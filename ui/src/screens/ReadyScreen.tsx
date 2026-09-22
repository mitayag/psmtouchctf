import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Header } from '../components/Header';
import { Shell } from '../components/Shell';
import { useGameSession } from '../hooks/useGameSession';
import { api } from '../services/api';
import { audio } from '../services/audio';
import './ReadyScreen.css';

type CountdownPhase = 'preparing' | 'countdown' | 'starting' | 'error';

interface ReadyError {
  message: string;
  statusCode?: number;
}

function describeReadyError(e: unknown): ReadyError {
  const raw = (e as Error).message || 'Failed to prepare the round.';
  const status = (e as Error & { statusCode?: number }).statusCode;
  if (status === 404) {
    return { message: 'Service unavailable. The game service needs to be restarted. Please try again shortly.', statusCode: 404 };
  }
  if (status === 403) {
    return { message: 'Session not found or expired. Returning to home.', statusCode: 403 };
  }
  if (status === 503) {
    return { message: 'The game is currently unavailable. Please try again shortly.', statusCode: 503 };
  }
  if (!status) {
    return { message: 'Could not reach the game server. Check your connection and try again.', statusCode: undefined };
  }
  return { message: raw, statusCode: status };
}

export function ReadyScreen() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { session, start, prepare } = useGameSession(sessionId);
  const [phase, setPhase] = useState<CountdownPhase>('preparing');
  const [count, setCount] = useState<number>(3);
  const [readyError, setReadyError] = useState<ReadyError | null>(null);
  const preparedRef = useRef(false);
  const startedRef = useRef(false);
  const navigateRef = useRef(false);

  useEffect(() => {
    if (!sessionId || !session || navigateRef.current) return;

    // Already active — skip straight to challenge.
    if (session.state === 'active') {
      navigateRef.current = true;
      navigate(`/play/${sessionId}/challenge/1`, { replace: true });
      return;
    }

    // Not ready or prepared yet — wait for session to update.
    if (session.state !== 'ready' && session.state !== 'prepared') return;

    // Phase 1: Prepare (ready → prepared).  Idempotent.
    if (session.state === 'ready' && !preparedRef.current) {
      preparedRef.current = true;
      setPhase('preparing');
      (async () => {
        try {
          await prepare();
        } catch (e) {
          if (navigateRef.current) return;
          const err = describeReadyError(e);
          setReadyError(err);
          setPhase('error');
          // If 403, auto-navigate home since session is gone.
          if (err.statusCode === 403) {
            api.clearActiveSession();
            setTimeout(() => navigate('/', { replace: true }), 1500);
          }
        }
      })();
      return;
    }

    // Phase 2: Countdown.  Triggered once session is prepared.
    if (session.state === 'prepared' || session.state === 'ready') {
      setPhase('countdown');
      setCount(3);

      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const intervalMs = prefersReduced ? 0 : 1000;

      if (prefersReduced) {
        // Reduced motion: show all three numbers instantly, then GO.
        setCount(0); // 0 = GO
        setTimeout(() => activateRound(), 1200);
        return;
      }

      let current = 3;
      const tick = () => {
        if (navigateRef.current) return;
        if (current > 0) {
          audio.play('countdown');
          setCount(current);
          current -= 1;
          setTimeout(tick, intervalMs);
        } else {
          // GO!
          audio.play('countdownGo');
          setCount(0);
          setTimeout(() => activateRound(), 600);
        }
      };
      setTimeout(tick, intervalMs);
    }
  }, [sessionId, session?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  async function activateRound() {
    if (startedRef.current || navigateRef.current) return;
    startedRef.current = true;
    setPhase('starting');
    try {
      await start();
      if (navigateRef.current) return;
      api.setActiveSession(sessionId!, 'active');
      if (navigateRef.current) return;
      navigateRef.current = true;
      navigate(`/play/${sessionId}/challenge/1`, { replace: true });
    } catch (e) {
      if (navigateRef.current) return;
      const err = describeReadyError(e);
      setReadyError(err);
      setPhase('error');
      if (err.statusCode === 403) {
        api.clearActiveSession();
        setTimeout(() => navigate('/', { replace: true }), 1500);
      }
    }
  }

  const modeLabel =
    session?.accessibilityMode === 'extended-time'
      ? 'Extended time'
      : session?.accessibilityMode === 'reduced-motion'
        ? 'Reduced motion'
        : 'Standard';

  const showGo = phase === 'countdown' && count === 0;
  const showNumber = phase === 'countdown' && count > 0;

  return (
    <Shell header={<Header title="Get ready" subtitle="The challenge begins shortly" />}>
      <div className="ready-layout">
        <Card className="ready-card" padding="lg">
          <h1 className="ready-title">
            Get ready{session?.alias ? `, ${session.alias}` : ''}!
          </h1>
          <p className="ready-subtitle">
            Solve 3 challenges, capture the flag, and spin for a prize.
          </p>

          {phase === 'preparing' && (
            <div className="ready-status">
              <div className="ready-spinner" aria-hidden="true" />
              <p className="ready-starting-text">Preparing your round…</p>
            </div>
          )}

          {showNumber && (
            <div className="ready-countdown" aria-live="polite" aria-label={`${count}`}>
              <span className="ready-countdown-number">{count}</span>
            </div>
          )}

          {showGo && (
            <div className="ready-countdown ready-go" aria-live="assertive" aria-label="Go">
              <span className="ready-countdown-go">GO!</span>
            </div>
          )}

          {phase === 'starting' && (
            <div className="ready-status">
              <div className="ready-spinner" aria-hidden="true" />
              <p className="ready-starting-text">Starting your round…</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="ready-error">
              <p className="ready-error-text">{readyError?.message || 'An unexpected error occurred.'}</p>
              <div className="ready-error-actions">
                {readyError?.statusCode !== 403 && (
                  <Button variant="primary" size="md" onClick={() => window.location.reload()}>
                    Retry
                  </Button>
                )}
                <Button variant="ghost" size="md" onClick={() => navigate('/')}>
                  Back to home
                </Button>
              </div>
            </div>
          )}

          <p className="ready-mode">Mode: {modeLabel}</p>
        </Card>
      </div>
    </Shell>
  );
}
