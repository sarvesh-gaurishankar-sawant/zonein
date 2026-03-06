import os
import json
import uuid
from datetime import datetime, date, timedelta
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
    model="gemini-2.5-flash-lite",
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
- Current date (YYYY-MM-DD): {current_date}
- Day of week: {day_of_week}
- Default session duration (minutes): {default_duration}
- Default break between sessions (minutes): {default_break}
- User's tags: {tags}
- Already booked on target date: {booked_today}

Rules:
- "morning" = 9am, "afternoon" = 1pm, "evening" = 6pm, "night" = 8pm
- "now" = current time rounded up to the nearest 5 minutes
- "pomodoro" = 25 minutes
- "quick" = 25 minutes
- "deep work" or "long" = 90 minutes
- If no duration mentioned, use default_duration
- If no break mentioned, use default_break
- If no start time mentioned and date is today, use "next_free" (set start_hour=-1, start_min=-1)
- If no start time mentioned and date is NOT today, default to 9am (start_hour=9, start_min=0)
- Match tag names case-insensitively to the user's tags list. Use the tag id, not the name.
- If tag not found in user's tags, set tag to null
- start_hour and start_min are 24h format integers (e.g. 14 for 2pm, 0 for midnight)
- For the "date" field: use YYYY-MM-DD format
  - "today" → current_date
  - "tomorrow" → current_date + 1 day
  - "next Monday" → calculate the actual date
  - A specific date like "March 3rd" → resolve to YYYY-MM-DD based on current_date year
  - If no date mentioned → use current_date

IMPORTANT - Session count rules:
- If the user mentions a TOTAL time (e.g. "2 hours", "3 hrs", "90 minutes"), set total_minutes to that value and set sessions to -1. The server will calculate how many sessions fit.
- If the user mentions an EXPLICIT session count (e.g. "3 pomodoros", "2 sessions"), set sessions to that number and total_minutes to -1.
- If neither, set sessions to 1 and total_minutes to -1.
- NEVER try to calculate session count yourself when total_minutes is given.

Return ONLY valid JSON, no explanation:
{{
  "date": <YYYY-MM-DD string>,
  "sessions": <number or -1 if total_minutes is set>,
  "total_minutes": <total time in minutes, or -1 if explicit sessions given>,
  "duration": <minutes per session>,
  "break": <minutes between sessions>,
  "tag_id": <tag id string or null>,
  "tag_name": <tag name string or null>,
  "start_hour": <0-23 or -1 for next_free>,
  "start_min": <0-59 or -1 for next_free>,
  "reasoning": <one sentence explaining your interpretation>
}}

Examples:
- "leetcode for 2 hrs" → total_minutes=120, sessions=-1, duration=default_duration
- "leetcode for 4 hrs" → total_minutes=240, sessions=-1, duration=default_duration
- "3 pomodoros of coding" → sessions=3, total_minutes=-1, duration=25
- "block my morning for deep work" → total_minutes=240 (9am-1pm), sessions=-1, duration=90
- "quick admin session now" → sessions=1, total_minutes=-1, duration=25
- "study leetcode tomorrow morning for 2 hrs" → tomorrow, start 9am, total_minutes=120, sessions=-1
- "2 sessions 50min leetcode 10min break" → sessions=2, total_minutes=-1, duration=50, break=10
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


def find_next_free_slot(booked_sessions, default_duration, tz=None, target_date=None):
    """Find the next free slot after now (today) or from 9am (future date)."""
    today = get_today_str(tz)
    is_today = (target_date is None or target_date == today)

    if is_today:
        start_h, start_m = get_current_time(tz)
        start_h, start_m = round_up_to_5(start_h, start_m)
    else:
        start_h, start_m = 9, 0  # future dates start from 9am

    # Convert booked sessions to occupied minute ranges for target date
    date_key = target_date or today
    occupied = []
    for s in booked_sessions:
        if s.get("date") == date_key and s.get("status") != "completed":
            start = s["start_hour"] * 60 + s["start_min"]
            end = start + s["duration"]
            occupied.append((start, end))

    # Find first free slot
    candidate = start_h * 60 + start_m
    while candidate + default_duration <= 24 * 60:
        c_end = candidate + default_duration
        conflict = any(start < c_end and candidate < end for start, end in occupied)
        if not conflict:
            return candidate // 60, candidate % 60
        candidate += 5

    # Fallback: 9am
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
    # Use date from LLM if valid, otherwise fall back to today
    target_date = parsed.get("date") or today
    try:
        datetime.strptime(target_date, "%Y-%m-%d")
    except Exception:
        target_date = today

    sessions_to_book = []

    start_hour = parsed.get("start_hour", -1)
    start_min = parsed.get("start_min", -1)
    duration = parsed.get("duration", default_duration)
    break_mins = parsed.get("break", 10)
    num_sessions = parsed.get("sessions", 1)
    total_minutes = parsed.get("total_minutes", -1)

    # Always use server-side calculation when total_minutes is provided
    if total_minutes and int(total_minutes) > 0:
        num_sessions = calculate_sessions_from_total(int(total_minutes), duration, break_mins)
    else:
        num_sessions = max(1, int(num_sessions)) if num_sessions and int(num_sessions) > 0 else 1
    tag_id = parsed.get("tag_id")

    # Resolve next_free slot
    if start_hour == -1 or start_min == -1:
        start_hour, start_min = find_next_free_slot(booked_today, duration, tz, target_date=target_date)

    current_h = start_hour
    current_m = start_min

    for i in range(num_sessions):
        start_total = current_h * 60 + current_m
        end_total = start_total + duration

        if end_total > 1440:
            # Session overflows past midnight — split into two linked sessions
            linked_id = str(uuid.uuid4())
            day1_duration = 1440 - start_total  # minutes until midnight
            day2_duration = duration - day1_duration  # minutes into next day

            # Compute next day's date
            current_date_obj = datetime.strptime(target_date, "%Y-%m-%d")
            next_date = (current_date_obj + timedelta(days=1)).strftime("%Y-%m-%d")

            sessions_to_book.append({
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "date": target_date,
                "start_hour": current_h,
                "start_min": current_m,
                "duration": day1_duration,
                "task": "desk",
                "tag": tag_id,
                "status": "booked",
                "started_at": None,
                "notes": None,
                "linked_id": linked_id,
            })
            sessions_to_book.append({
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "date": next_date,
                "start_hour": 0,
                "start_min": 0,
                "duration": day2_duration,
                "task": "desk",
                "tag": tag_id,
                "status": "booked",
                "started_at": None,
                "notes": None,
                "linked_id": linked_id,
            })
        else:
            sessions_to_book.append({
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "date": target_date,
                "start_hour": current_h,
                "start_min": current_m,
                "duration": duration,
                "task": "desk",
                "tag": tag_id,
                "status": "booked",
                "started_at": None,
                "notes": None,
                "linked_id": None,
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
    # Settings — frontend can override duration/break for AI scheduling
    settings_res = supabase.table("settings").select("*").eq("user_id", user_id).execute()
    settings = settings_res.data[0] if settings_res.data else {}
    default_duration = body.get("default_duration") or settings.get("duration") or 50
    default_break = body.get("default_break") or settings.get("break") or 10

    # Tags
    tags_res = supabase.table("tags").select("*").eq("user_id", user_id).execute()
    tags = tags_res.data or []
    tags_for_prompt = [{"id": t["id"], "name": t["name"]} for t in tags]

    # Today's date in user timezone
    today = get_today_str(user_tz)
    now = datetime.now(user_tz)

    # Pre-fetch today's sessions for the prompt (we don't know target date yet)
    sessions_res = (
        supabase.table("sessions")
        .select("*")
        .eq("user_id", user_id)
        .eq("date", today)
        .execute()
    )
    booked_today_sessions = sessions_res.data or []
    booked_summary = [
        f"{s['start_hour']}:{str(s['start_min']).zfill(2)} ({s['duration']}min)"
        for s in booked_today_sessions
        if s.get("status") != "completed"
    ]

    # 4. Call Gemini via LangChain
    try:
        parsed = schedule_chain.invoke({
            "current_datetime": now.strftime("%Y-%m-%d %H:%M"),
            "current_date": today,
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

    # Fetch booked sessions for the target date the LLM resolved
    target_date = parsed.get("date") or today
    if target_date != today:
        target_sessions_res = (
            supabase.table("sessions")
            .select("*")
            .eq("user_id", user_id)
            .eq("date", target_date)
            .execute()
        )
        booked_target = target_sessions_res.data or []
    else:
        booked_target = booked_today_sessions

    # 6. Build sessions
    try:
        sessions_to_book = build_sessions(
            user_id=user_id,
            parsed=parsed,
            booked_today=booked_target,
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
        "summary": f"Booked {num} × {duration}min session{'s' if num > 1 else ''} on {first['date']} at {start_label} [{tag_name}]",
        "reasoning": reasoning,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=False)
