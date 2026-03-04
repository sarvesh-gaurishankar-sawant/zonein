import { useEffect, useRef, useState } from 'react';

const START_MESSAGES = [
  "Hey! What are you working on today? 👀",
  "Let's get focused! What's the mission?",
  "Ready to zone in! What are you tackling?",
  "What are you working on for this session?",
];

const END_YES_MESSAGES = [
  "That's what I like to hear! Great work 🔥",
  "Crushed it! You're on a roll 💪",
  "Yes!! One step closer. Keep going 🚀",
  "Love to see it. Proud of you! 🎉",
];

const END_NO_MESSAGES = [
  "No worries — progress still happened. Try again! 💪",
  "That's okay! Every session is still practice 🙌",
  "Don't sweat it. What matters is you showed up ✊",
  "It happens! Regroup and go again 🔄",
];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

// phase: 'start' | 'end-check' | 'end-result' | null
export default function SessionCompanion({ phase, sessionGoal, onGoalSet, onCheckin, onDismiss }) {
  const [input, setInput] = useState('');
  const [visible, setVisible] = useState(false);
  const [animOut, setAnimOut] = useState(false);
  const [startMsg] = useState(rand(START_MESSAGES));
  const [endYesMsg] = useState(rand(END_YES_MESSAGES));
  const [endNoMsg] = useState(rand(END_NO_MESSAGES));
  const [endResult, setEndResult] = useState(null); // 'yes' | 'no'
  const inputRef = useRef(null);

  useEffect(() => {
    if (phase) {
      setVisible(true);
      setAnimOut(false);
      setInput('');
      setEndResult(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [phase]);

  function dismiss() {
    setAnimOut(true);
    setTimeout(() => {
      setVisible(false);
      setAnimOut(false);
      onDismiss();
    }, 250);
  }

  function handleStartSubmit() {
    const goal = input.trim();
    onGoalSet(goal || null);
    dismiss();
  }

  function handleCheckin(did) {
    setEndResult(did ? 'yes' : 'no');
    onCheckin(did);
    setTimeout(() => dismiss(), 1800);
  }

  if (!visible || !phase) return null;

  return (
    <div className={`companion-overlay${animOut ? ' out' : ''}`} onClick={e => e.target === e.currentTarget && dismiss()}>
      <div className={`companion-card${animOut ? ' out' : ''}`}>

        {/* Avatar */}
        <div className="companion-avatar">Z</div>

        {/* START PHASE */}
        {phase === 'start' && (
          <>
            <div className="companion-msg">{startMsg}</div>
            <input
              ref={inputRef}
              className="companion-input"
              type="text"
              placeholder="e.g. Finish the auth component..."
              maxLength={120}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStartSubmit()}
            />
            <div className="companion-btns">
              <button className="companion-btn primary" onClick={handleStartSubmit}>
                Let's go ⚡
              </button>
              <button className="companion-btn ghost" onClick={dismiss}>Skip</button>
            </div>
          </>
        )}

        {/* END CHECK PHASE */}
        {phase === 'end-check' && !endResult && (
          <>
            <div className="companion-msg">
              Session done! {sessionGoal ? <>Did you finish <span className="companion-goal">"{sessionGoal}"</span>?</> : 'Did you get it done?'}
            </div>
            <div className="companion-btns">
              <button className="companion-btn yes" onClick={() => handleCheckin(true)}>✓ Yes!</button>
              <button className="companion-btn no" onClick={() => handleCheckin(false)}>✕ Not quite</button>
            </div>
          </>
        )}

        {/* END RESULT */}
        {endResult === 'yes' && (
          <div className="companion-result yes">{endYesMsg}</div>
        )}
        {endResult === 'no' && (
          <div className="companion-result no">{endNoMsg}</div>
        )}

      </div>
    </div>
  );
}
