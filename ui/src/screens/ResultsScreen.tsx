import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Shell } from '../components/Shell';
import { api } from '../services/api';
import { audio } from '../services/audio';
import { resetForNextPlayer } from '../hooks/useGameSession';
import type { ApiResults } from '../services/api';
import './ResultsScreen.css';

function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function ResultsScreen() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [results, setResults] = useState<ApiResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundPlayed, setSoundPlayed] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    api.getResults(sessionId).then(setResults).catch((e) => setError(e.message));
  }, [sessionId]);

  // Play completion sound once when results load for unqualified players,
  // only if sound is enabled. Qualified players hear celebration on the flag screen.
  useEffect(() => {
    if (results && !soundPlayed && !results.qualified) {
      setSoundPlayed(true);
      audio.play('challengeComplete');
    }
  }, [results, soundPlayed]);

  const handlePlayAgain = () => {
    resetForNextPlayer();
    navigate('/play/setup');
  };

  const handleBackToHome = () => {
    resetForNextPlayer();
    navigate('/');
  };

  if (error) {
    return (
      <Shell header={<div />}>
        <div className="rs-loading">{error}</div>
      </Shell>
    );
  }

  if (!results) {
    return (
      <Shell header={<div />}>
        <div className="rs-loading">Loading…</div>
      </Shell>
    );
  }

  const isUnqualified = !results.qualified;
  const isExpired = results.state === 'expired';

  if (isUnqualified) {
    return (
      <Shell
        header={<Header title="Results" subtitle="Round complete" />}
        footer={<Footer center="THANKS FOR DEFENDING THE NETWORK" />}
      >
        <div className="rs-layout">
          <Card className="rs-card rs-card-neon" variant="glow" padding="lg">
            <div className="rs-thankyou-badge">✓ ROUND COMPLETE</div>
            <h1 className="rs-thankyou-title">Thank you for playing PSM TouchCTF</h1>
            <p className="rs-thankyou-sub">
              You didn't unlock a prize spin this time. Try again—your next flag awaits!
            </p>

            <div className="rs-stat-row">
              <div className="rs-stat">
                <span className="rs-stat-value">{results.score}</span>
                <span className="rs-stat-label">Final score</span>
              </div>
              <div className="rs-stat-divider" aria-hidden="true" />
              <div className="rs-stat">
                <span className="rs-stat-value">{results.solvedCount}/3</span>
                <span className="rs-stat-label">Challenges solved</span>
              </div>
            </div>

            <div className="rs-reminder">
              Solve at least 2 of 3 challenges and capture the final flag before time expires.
            </div>

            {isExpired && (
              <p className="rs-expired-note">Time ran out before the round was completed.</p>
            )}

            <div className="rs-actions">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={handlePlayAgain}
              >
                Play again
              </Button>
              <Button
                variant="ghost"
                size="md"
                fullWidth
                onClick={handleBackToHome}
              >
                Back to home
              </Button>
            </div>
          </Card>
        </div>
      </Shell>
    );
  }

  // Qualified view — real prize spin
  return (
    <Shell
      header={<Header title="Results" subtitle="Your mission summary" />}
      footer={<Footer center="THANKS FOR DEFENDING THE NETWORK" />}
    >
      <div className="rs-layout">
        <Card className="rs-card" padding="lg">
          <h1 className="rs-title">Mission Complete</h1>
          <p className="rs-subtitle">Great work, {results.alias}!</p>
          <div className="rs-score">{results.score}</div>
          <div className="rs-breakdown">
            <div className="rs-row"><span>Challenges solved</span><span>{results.solvedCount}/3</span></div>
            <div className="rs-row"><span>Challenge points</span><span>{results.breakdown.challengePoints}</span></div>
            <div className="rs-row"><span>Capture bonus</span><span>{results.breakdown.captureBonus}</span></div>
            <div className="rs-row"><span>Time bonus</span><span>{results.breakdown.timeBonus}</span></div>
            <div className="rs-row"><span>Total deductions</span><span>-{results.breakdown.deductions}</span></div>
            <div className="rs-row"><span>Elapsed time</span><span>{fmtTime(results.elapsedMs)}</span></div>
          </div>
          <p className="rs-qualified">🎉 Prize spin unlocked!</p>
          <div className="rs-actions">
            <Button variant="primary" size="lg" fullWidth onClick={() => navigate(`/play/${sessionId}/prize`)}>
              Spin the prize wheel →
            </Button>
            <Button variant="ghost" size="md" fullWidth onClick={handleBackToHome}>Back to home</Button>
          </div>
        </Card>
      </div>
    </Shell>
  );
}
