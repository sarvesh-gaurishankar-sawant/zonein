import os
import json
import uuid
from datetime import datetime, date
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
import pytz

app = Flask(__name__)
CORS(app)

# ===== CONFIG =====
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise EnvironmentError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
if not GEMINI_API_KEY:
    raise EnvironmentError("GEMINI_API_KEY must be set")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=GEMINI_API_KEY,
    temperature=0.2,
)

# ===== AUTH HELPER =====
def get_user_from_token(token: str):
    """Verify Supabase JWT and return user."""
    try:
        user_response = supabase.auth.get_user(token)
        return user_response.user
    except Exception:
        return None


# ===== SCHEDULE PARSER CHAIN =====
SCHEDULE_SYSTEM_PROMPT = """You are a scheduling assistant for ZoneIn, a focus session calendar app.

Your job is to parse a natural language scheduling request and return a JSON object.

User context:
- Current datetime: {current_datetime}
- Day of week: {day_of_week}
- Default session duration (minutes): {default_duration}
- Default break between sessions (minutes): {default_break}
- User's tags: {tags}
- Already booked today: {booked_today}

Rules:
- "morning" = 9am, "afternoon" = 1pm, "evening" = 6pm, "night" = 8pm
- "now" = current time rounded up to the nearest 5 minutes
- "pomodoro" = 25 minutes
- "quick" = 25 minutes
- "deep work" or "long" = 90 minutes
- If no duration mentioned, use default_duration
- If no break mentioned, use default_break
- If no start time mentioned, use "next_free" (means find next free slot after now)
- If total_minutes is given (e.g. "2 hours"), calculate how many full sessions fit with breaks
- Match tag names case-insensitively to the user's tags list. Use the tag id, not the name.
- If tag not found in user's tags, set tag to null
- sessions = number of sessions to book
- start_hour and start_min are 24h format integers (e.g. 14 for 2pm, 0 for midnight)
- If start is "next_free", set start_hour to -1 and start_min to -1

Return ONLY valid JSON, no explanation:
{{
  "sessions": <number>,
  "duration": <minutes per session>,
  "break": <minutes between sessions>,
  "tag_id": <tag id string or null>,
  "tag_name": <tag name string or null>,
  "start_hour": <0-23 or -1 for next_free>,
  "start_min": <0-59 or -1 for next_free>,
  "reasoning": <one sentence explaining your interpretation>
}}

Examples:
- "leetcode for 2 hrs" → sessions fit within 120 total minutes using default duration + break
- "3 pomodoros of coding" → 3 sessions of 25 min
- "block my morning for deep work" → start 9am, 90min sessions, fill morning
- "quick admin session now" → 1 session, 25min, start now
- "2 sessions 50min leetcode 10min break" → explicit values
"""

schedule_prompt = ChatPromptTemplate.from_messages([
    ("system", SCHEDULE_SYSTEM_PROMPT),
    ("human", "{user_message}"),
])

parser = JsonOutputParser()
schedule_chain = schedule_prompt | llm | parser


# ===== HELPERS =====
def get_user_tz(timezone_str: str):
    """Return a pytz timezone object, defaulting to UTC if invalid."""
    try:
        return pytz.timezone(timezone_str)
    except Exception:
        return pytz.utc


def get_today_str(tz=None):
    """Return today's date string in the user's timezone."""
    now = datetime.now(tz or pytz.utc)
    return now.strftime("%Y-%m-%d")


def get_current_time(tz=None):
    """Return current hour and minute in the user's timezone."""
    now = datetime.now(tz or pytz.utc)
    return now.hour, now.minute


def round_up_to_5(hour, minute):
    """Round time up to nearest 5 minutes."""
    if minute % 5 != 0:
        minute = ((minute // 5) + 1) * 5
    if minute >= 60:
        minute -= 60
        hour += 1
    if hour >= 24:
        hour = 23
        minute = 55
    return hour, minute


def find_next_free_slot(booked_sessions, default_duration, tz=None):
    """Find the next free slot after now."""
    now_h, now_m = get_current_time(tz)
    now_h, now_m = round_up_to_5(now_h, now_m)

    today = get_today_str(tz)

    # Convert booked sessions to occupied minute ranges
    occupied = []
    for s in booked_sessions:
        if s.get("date") == today and s.get("status") != "completed":
            start = s["start_hour"] * 60 + s["start_min"]
            end = start + s["duration"]
            occupied.append((start, end))

    # Find first free slot
    candidate = now_h * 60 + now_m
    while candidate + default_duration <= 24 * 60:
        c_end = candidate + default_duration
        conflict = any(start < c_end and candidate < end for start, end in occupied)
        if not conflict:
            return candidate // 60, candidate % 60
        candidate += 5

    # Fallback: next morning 9am
    return 9, 0


def calculate_sessions_from_total(total_minutes, duration, break_mins):
    """Calculate how many full sessions fit in total_minutes."""
    if total_minutes <= 0:
        return 1
    sessions = 0
    used = 0
    while True:
        new_used = used + duration
        if new_used > total_minutes:
            break
        sessions += 1
        used = new_used + break_mins  # add break after session
    return max(1, sessions)


def build_sessions(user_id, parsed, booked_today, default_duration, tz=None):
    """Build session objects to insert into Supabase."""
    today = get_today_str(tz)
    sessions_to_book = []

    start_hour = parsed.get("start_hour", -1)
    start_min = parsed.get("start_min", -1)
    duration = parsed.get("duration", default_duration)
    break_mins = parsed.get("break", 10)
    num_sessions = parsed.get("sessions", 1)

    # If LLM returned 0 or missing sessions, recalculate from total_minutes if available
    total_minutes = parsed.get("total_minutes")
    if (not num_sessions or num_sessions < 1) and total_minutes:
        num_sessions = calculate_sessions_from_total(total_minutes, duration, break_mins)
    num_sessions = max(1, int(num_sessions))
    tag_id = parsed.get("tag_id")

    # Resolve next_free slot
    if start_hour == -1 or start_min == -1:
        start_hour, start_min = find_next_free_slot(booked_today, duration, tz)

    current_h = start_hour
    current_m = start_min

    for i in range(num_sessions):
        session_id = str(uuid.uuid4())
        sessions_to_book.append({
            "id": session_id,
            "user_id": user_id,
            "date": today,
            "start_hour": current_h,
            "start_min": current_m,
            "duration": duration,
            "task": "desk",
            "tag": tag_id,
            "status": "booked",
            "started_at": None,
            "notes": None,
        })

        # Advance time for next session
        total_mins = current_h * 60 + current_m + duration + break_mins
        current_h = total_mins // 60
        current_m = total_mins % 60

    return sessions_to_book


# ===== ROUTES =====
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/api/schedule", methods=["POST"])
def schedule():
    # 1. Auth
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "Missing authorization token"}), 401

    token = auth_header.split(" ")[1]
    user = get_user_from_token(token)
    if not user:
        return jsonify({"error": "Invalid or expired token"}), 401

    user_id = str(user.id)

    # 2. Get request body
    body = request.get_json()
    if not body or not body.get("message"):
        return jsonify({"error": "Missing message"}), 400

    user_message = body["message"].strip()
    if not user_message:
        return jsonify({"error": "Empty message"}), 400
    if len(user_message) > 500:
        return jsonify({"error": "Message too long (max 500 characters)"}), 400

    # Timezone from client (e.g. "America/New_York"), fallback to UTC
    timezone_str = body.get("timezone", "UTC")
    user_tz = get_user_tz(timezone_str)

    # 3. Fetch user context from Supabase
    # Settings
    settings_res = supabase.table("settings").select("*").eq("user_id", user_id).execute()
    settings = settings_res.data[0] if settings_res.data else {}
    default_duration = settings.get("duration", 50)
    default_break = settings.get("break", 10)

    # Tags
    tags_res = supabase.table("tags").select("*").eq("user_id", user_id).execute()
    tags = tags_res.data or []
    tags_for_prompt = [{"id": t["id"], "name": t["name"]} for t in tags]

    # Today's booked sessions (use user's local date)
    today = get_today_str(user_tz)
    sessions_res = (
        supabase.table("sessions")
        .select("*")
        .eq("user_id", user_id)
        .eq("date", today)
        .execute()
    )
    booked_today = sessions_res.data or []
    booked_summary = [
        f"{s['start_hour']}:{str(s['start_min']).zfill(2)} ({s['duration']}min)"
        for s in booked_today
        if s.get("status") != "completed"
    ]

    # 4. Call Gemini via LangChain
    now = datetime.now(user_tz)
    try:
        parsed = schedule_chain.invoke({
            "current_datetime": now.strftime("%Y-%m-%d %H:%M"),
            "day_of_week": now.strftime("%A"),
            "default_duration": default_duration,
            "default_break": default_break,
            "tags": json.dumps(tags_for_prompt),
            "booked_today": ", ".join(booked_summary) if booked_summary else "None",
            "user_message": user_message,
        })
    except Exception as e:
        return jsonify({"error": f"AI parsing failed: {str(e)}"}), 500

    # 5. Validate tag_id returned by LLM against real user tags
    valid_tag_ids = {t["id"] for t in tags}
    if parsed.get("tag_id") and parsed["tag_id"] not in valid_tag_ids:
        parsed["tag_id"] = None
        parsed["tag_name"] = None

    # 6. Build sessions
    try:
        sessions_to_book = build_sessions(
            user_id=user_id,
            parsed=parsed,
            booked_today=booked_today,
            default_duration=default_duration,
            tz=user_tz,
        )
    except Exception as e:
        return jsonify({"error": f"Session building failed: {str(e)}"}), 500

    # 7. Insert into Supabase
    if not sessions_to_book:
        return jsonify({"error": "No sessions to book"}), 400

    try:
        insert_res = supabase.table("sessions").insert(sessions_to_book).execute()
    except Exception as e:
        return jsonify({"error": f"Database insert failed: {str(e)}"}), 500

    # 8. Return booked sessions + summary
    num = len(sessions_to_book)
    first = sessions_to_book[0]
    start_label = f"{first['start_hour']}:{str(first['start_min']).zfill(2)}"
    duration = first["duration"]
    tag_name = parsed.get("tag_name") or "no tag"
    reasoning = parsed.get("reasoning", "")

    return jsonify({
        "success": True,
        "sessions_booked": num,
        "sessions": sessions_to_book,
        "summary": f"Booked {num} × {duration}min session{'s' if num > 1 else ''} starting {start_label} [{tag_name}]",
        "reasoning": reasoning,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=False)
