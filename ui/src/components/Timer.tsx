import { useEffect, useRef, useState } from 'react';
import { audio } from '../services/audio';
import './Timer.css';

interface TimerProps {
  serverNow: string | null;
  expiresAt: string | null;
  durationSeconds: number;
  completed?: boolean;
  onExpired?: () => void;
}

function parseIsoMs(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function Timer({ serverNow, expiresAt, durationSeconds, completed, onExpired }: TimerProps) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [invalid, setInvalid] = useState(false);
  const warned30 = useRef(false);
  const warned10 = useRef(false);
  const expiredPlayed = useRef(false);
  const syncRef = useRef<{ serverNowMs: number; performanceNowMs: number } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Reset audio warning flags whenever the server timestamps change.
    warned30.current = false;
    warned10.current = false;
    expiredPlayed.current = false;

    const serverMs = parseIsoMs(serverNow);
    const expiryMs = parseIsoMs(expiresAt);

    if (!serverMs || !expiryMs) {
      // Missing or unparseable timestamps: do not fabricate a countdown.
      setInvalid(true);
      setRemaining(null);
      syncRef.current = null;
      return;
    }

    setInvalid(false);
    syncRef.current = { serverNowMs: serverMs, performanceNowMs: performance.now() };

    const computeRemaining = () => {
      if (!syncRef.current) return null;
      const elapsedSinceSync = (performance.now() - syncRef.current.performanceNowMs) / 1000;
      const currentServerTime = syncRef.current.serverNowMs / 1000 + elapsedSinceSync;
      return Math.max(0, Math.ceil(expiryMs / 1000 - currentServerTime));
    };

    const update = () => {
      const seconds = computeRemaining();
      if (seconds === null) {
        setInvalid(true);
        return;
      }
      setRemaining(seconds);
      if (seconds <= 30 && !warned30.current) {
        warned30.current = true;
        audio.play('timerWarning30');
      }
      if (seconds <= 10 && !warned10.current) {
        warned10.current = true;
        audio.play('timerWarning10');
      }
      if (seconds === 0 && !expiredPlayed.current) {
        expiredPlayed.current = true;
        audio.play('roundExpiry');
        onExpired?.();
      }
    };

    update();
    intervalRef.current = setInterval(update, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [serverNow, expiresAt, durationSeconds]);

  let displaySeconds: number;
  if (completed) {
    displaySeconds = 0;
  } else if (invalid || remaining === null) {
    displaySeconds = durationSeconds;
  } else {
    displaySeconds = remaining;
  }

  const minutes = Math.floor(displaySeconds / 60);
  const seconds = displaySeconds % 60;
  const label = completed ? 'COMPLETED' : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  let variant = 'normal';
  if (!completed && invalid) {
    variant = 'unknown';
  } else if (!completed && displaySeconds <= 10) {
    variant = 'urgent';
  } else if (!completed && displaySeconds <= 30) {
    variant = 'warning';
  }

  return (
    <div className={`ctf-timer ctf-timer-${variant}`} role="timer" aria-label={`Time remaining ${invalid ? 'unknown' : label}`}>
      <svg className="ctf-timer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
      <div className="ctf-timer-content">
        <span className="ctf-timer-label">{completed ? 'TIME' : invalid ? 'SYNCING' : 'TIME REMAINING'}</span>
        <span className="ctf-timer-value mono">{label}</span>
      </div>
    </div>
  );
}
