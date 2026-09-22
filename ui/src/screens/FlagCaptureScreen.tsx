import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Shell } from '../components/Shell';
import { StatusOverlay } from '../components/StatusOverlay';
import { Timer } from '../components/Timer';
import { Wheel } from '../components/Wheel';
import { useGameSession } from '../hooks/useGameSession';
import { api } from '../services/api';
import { getPrizesForWheel } from '../services/fixtureApi';
import { audio } from '../services/audio';
import './FlagCaptureScreen.css';

export function FlagCaptureScreen() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { session, loading, error, refresh, captureFlag, abandon } = useGameSession(sessionId);
  const [celebrating, setCelebrating] = useState(false);
  const [showEndGame, setShowEndGame] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const capturedRef = useRef(false);

  useEffect(() => {
    if (session?.state === 'completed' && !capturedRef.current) {
      capturedRef.current = true;
      setCelebrating(true);
      audio.play('flagCapture');
      const t = setTimeout(() => setCelebrating(false), 1500);
      return () => clearTimeout(t);
    }
  }, [session?.state]);

  if (!session) {
    return (
      <Shell header={<div />}>
        <StatusOverlay loading={loading && !session} error={error} onRetry={refresh} />
        <div className="fc-loading">Loading…</div>
      </Shell>
    );
  }
  const solved = session.challenges.filter(c => c.outcome === 'solved').length;
  const eligible = solved >= 2;
  const captured = session.state === 'completed';

  const assembleAndCapture = async () => {
    await captureFlag();
  };

  const handleEndGame = async () => {
    if (isEnding) return;
    setIsEnding(true);
    try {
      await abandon();
      audio.play('button');
      api.clearActiveSession();
      navigate('/', { replace: true });
    } catch {
      api.clearActiveSession();
      navigate('/', { replace: true });
    }
  };

  return (
    <Shell
      header={<Header title="Final Flag" subtitle={eligible ? 'Assemble and capture' : 'Complete the challenges'} right={<Timer serverNow={session.serverNow} expiresAt={session.expiresAt} durationSeconds={session.accessibilityMode === 'extended-time' ? 300 : 180} completed={session.state !== 'active'} onExpired={refresh} />} />}
      footer={<Footer center="CAPTURE TODAY. A SAFER TOMORROW." />}
    >
      {showEndGame && (
        <ConfirmDialog
          title="End this game?"
          message="Your progress will be saved as abandoned, and this round will not qualify for a prize."
          confirmLabel="End game"
          cancelLabel="Keep playing"
          onConfirm={handleEndGame}
          onCancel={() => setShowEndGame(false)}
        />
      )}
      {celebrating && (
        <div className="fc-confetti-overlay" aria-hidden="true">
          {Array.from({ length: 40 }).map((_, i) => (
            <div
              key={i}
              className="fc-confetti-piece"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 0.5}s`,
                animationDuration: `${1 + Math.random() * 1.5}s`,
                backgroundColor: ['#20e3ff','#ff73c6','#ff8c42','#53f5ad','#ffd700'][i % 5],
              }}
            />
          ))}
        </div>
      )}
      <div className="fc-layout">
        <Card className={`fc-status-card ${celebrating ? 'celebrating' : ''}`} padding="lg">
          <div className="fc-status-header">🏆 CHALLENGE COMPLETE</div>
          <p className="fc-status-sub">Mission Accomplished!</p>
          <h1 className={eligible ? 'fc-title success' : 'fc-title'}>{eligible ? 'VAULT BREACHED!' : 'KEEP GOING'}</h1>
          <p className="fc-status-sub">{eligible ? 'You captured the final flag!' : 'Solve at least two challenges to unlock the flag.'}</p>
          {eligible && <p className="fc-qualified">You qualified to spin the prize wheel!</p>}
          <div className="fc-challenge-status">
            {session.challenges.map(c => (
              <div key={c.position} className={`fc-status-dot ${c.outcome === 'solved' ? 'solved' : c.outcome === 'failed' || c.outcome === 'skipped' ? 'failed' : 'pending'}`}>
                {c.position}
              </div>
            ))}
          </div>
          {eligible && !captured && <Button variant="primary" size="lg" fullWidth onClick={assembleAndCapture}>🔒 Assemble flag → Capture flag</Button>}
          {captured && <Button variant="primary" size="lg" fullWidth onClick={() => navigate(`/play/${sessionId}/results`)}>View results →</Button>}
          {!eligible && <Button variant="secondary" size="lg" fullWidth onClick={() => navigate(`/play/${sessionId}/results`)}>View results →</Button>}
          <Button variant="ghost" size="md" onClick={() => setShowEndGame(true)} disabled={isEnding}>End Game</Button>
        </Card>
        <Card className="fc-wheel-card" padding="lg">
          <div className="fc-wheel-header">🎁 PRIZE WHEEL</div>
          <p className="fc-wheel-sub">Complete the round to unlock your prize spin.</p>
          <div className="fc-wheel-wrap"><Wheel prizes={getPrizesForWheel()} diameter={420} hubLabel="SPIN" hubSubLabel="TO WIN" /></div>
        </Card>
      </div>
    </Shell>
  );
}
