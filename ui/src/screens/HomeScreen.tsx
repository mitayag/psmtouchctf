import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Footer } from '../components/Footer';
import { HAUQRModal } from '../components/HAUQRModal';
import { Header } from '../components/Header';
import { Shell } from '../components/Shell';
import { SoundActivator } from '../components/SoundActivator';
import { Wheel } from '../components/Wheel';
import { api } from '../services/api';
import { getPrizesForWheel } from '../services/fixtureApi';
import { EVENT_STATUS } from '../services/fixtureData';
import type { EventStatus } from '../types';
import './HomeScreen.css';

const HOW_IT_WORKS = [
  { number: 1, icon: '✉️', title: 'Solve 3 Mini Challenges', description: 'Phishing, logs, and decoding — one of each type per round.' },
  { number: 2, icon: '🚩', title: 'Capture the Final Flag', description: 'Assemble your clues and submit the final flag before time runs out.' },
  { number: 3, icon: '🎡', title: 'Spin the Prize Wheel', description: 'Only players who qualify get one spin for a physical prize.' },
  { number: 4, icon: '🎁', title: 'Claim Your Prize', description: 'Show your claim code to booth staff and take home your swag.' },
];

const MINI_CHALLENGES = [
  { icon: '✉️', title: 'Phishing Hunt', sub: 'Spot the red flags' },
  { icon: '▶️', title: 'Decode the Flag', sub: 'Crack the message' },
  { icon: '📋', title: 'Log Detective', sub: 'Find the trail' },
];

type SessionStatus = 'loading' | 'active' | 'completed' | 'expired' | 'abandoned' | 'missing' | 'error';

export function HomeScreen() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<EventStatus | null>(null);
  const [nickname, setNickname] = useState('');
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('loading');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSessionAlias, setActiveSessionAlias] = useState<string>('');
  const [resuming, setResuming] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const validationError = useRef('');

  useEffect(() => {
    api.getPublicEvent()
      .then(setStatus)
      .catch(() => setStatus(EVENT_STATUS));

    const stored = api.getActiveSession();
    if (!stored) {
      setSessionStatus('missing');
      return;
    }

    setActiveSessionId(stored.id);
    api.getSession(stored.id)
      .then((s) => {
        if (!s) {
          api.clearActiveSession();
          setSessionStatus('missing');
          return;
        }
        setActiveSessionAlias(s.alias);
        if (s.state === 'active' || s.state === 'ready' || s.state === 'prepared') {
          setSessionStatus('active');
        } else if (s.state === 'completed') {
          setSessionStatus('completed');
          api.clearActiveSession();
        } else if (s.state === 'expired' || s.state === 'abandoned') {
          setSessionStatus('expired');
          api.clearActiveSession();
        } else {
          api.clearActiveSession();
          setSessionStatus('missing');
        }
      })
      .catch(() => {
        setSessionStatus('error');
      });
  }, []);

  const validateNickname = useCallback((value: string): string => {
    const trimmed = value.trim();
    if (trimmed.length > 0 && (trimmed.length < 2 || trimmed.length > 20)) {
      return 'Nickname must be 2–20 characters.';
    }
    return '';
  }, []);

  const start = () => {
    const err = validateNickname(nickname);
    validationError.current = err;
    navigate('/play/setup', { state: { nickname } });
  };

  const resume = async () => {
    if (!activeSessionId || resuming) return;
    setResuming(true);
    try {
      const s = await api.getSession(activeSessionId);
      if (!s) {
        api.clearActiveSession();
        setSessionStatus('missing');
        return;
      }
      if (s.state === 'active' || s.state === 'ready') {
        api.setActiveSession(s.id, s.state);
        navigate(`/play/${s.id}/challenge/1`);
      } else if (s.state === 'completed') {
        api.clearActiveSession();
        setSessionStatus('missing');
        navigate(`/play/${s.id}/results`);
      } else {
        api.clearActiveSession();
        setSessionStatus('missing');
      }
    } catch {
      setSessionStatus('error');
    } finally {
      setResuming(false);
    }
  };

  const endAndStartNew = async () => {
    if (!activeSessionId || endingSession) return;
    setEndingSession(true);
    try {
      await api.abandon(activeSessionId);
    } catch {
      // best-effort abandon
    } finally {
      api.clearActiveSession();
      setSessionStatus('missing');
      setEndingSession(false);
      setShowEndConfirm(false);
      navigate('/play/setup', { state: { nickname } });
    }
  };

  const stats = [
    { label: 'PLAYERS TODAY', value: status?.playersToday ?? EVENT_STATUS.playersToday, icon: '👥' },
    { label: 'AVG SCORE (SAMPLE)', value: status?.averageScore ?? EVENT_STATUS.averageScore, icon: '🏆' },
    { label: 'PRIZES CLAIMED', value: status?.prizesClaimed ?? EVENT_STATUS.prizesClaimed, icon: '🎁' },
  ];

  const wheelPrizes = getPrizesForWheel();

  return (
    <Shell
      header={
        <Header
          title="3-Minute Touchscreen CTF Challenge"
          subtitle="Capture. Crack. Defend."
          right={
            <>
              <button
                className="home-qr-btn"
                onClick={() => setShowQR(true)}
                aria-label="HAU QR Code"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="2" width="8" height="8" rx="1" />
                  <rect x="14" y="2" width="8" height="8" rx="1" />
                  <rect x="2" y="14" width="8" height="8" rx="1" />
                  <rect x="14" y="14" width="4" height="4" rx="0.5" />
                  <rect x="20" y="14" width="2" height="2" />
                  <rect x="14" y="20" width="2" height="2" />
                  <rect x="20" y="20" width="2" height="2" />
                </svg>
                <span>HAU QR Code</span>
              </button>
              <button
                className="home-admin-btn"
                onClick={() => navigate('/admin')}
                aria-label="Admin"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>Admin</span>
              </button>
            </>
          }
          stats={
            <div className="home-stats">
              {stats.map(s => (
                <div key={s.label} className="home-stat">
                  <span className="home-stat-icon">{s.icon}</span>
                  <span className="home-stat-label">{s.label}</span>
                  <span className="home-stat-value">{s.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          }
        />
      }
      footer={
        <Footer
          left={<span className="home-footer-brand"><span className="psm-mini-logo" aria-hidden="true" /> PSM | CYBERSECURITY</span>}
          center="PEOPLE + SKILLS + TECHNOLOGY = A SAFER TOMORROW"
          right={<><button className="home-footer-link">Privacy</button><button className="home-footer-link">Help</button></>}
        />
      }
    >
      <div className="home-layout">
        <div className="home-left">
          <Card className="home-welcome-card" padding="md">
            <div className="home-welcome-grid">
              <div className="home-welcome-text">
                <h1 className="home-welcome-title">
                  Welcome to <br />
                  <span className="home-welcome-brand">PSM <span className="neon-text-cyan">Touch</span><span className="neon-text-magenta">CTF</span></span>
                </h1>
                <p className="home-welcome-subtitle">3-MINUTE TOUCHSCREEN CTF CHALLENGE</p>
                <p className="home-welcome-tagline">REAL THREATS. REAL SKILLS. A SAFER TOMORROW.</p>
              </div>
              <div className="home-nickname-panel">
                <label htmlFor="nickname" className="home-nickname-label">CHOOSE A NICKNAME (OPTIONAL)</label>
                <div className="home-nickname-input-wrap">
                  <span className="home-nickname-icon" aria-hidden="true">👤</span>
                  <input
                    id="nickname"
                    type="text"
                    className="home-nickname-input"
                    placeholder="CyberPlayer"
                    value={nickname}
                    onChange={(e) => {
                      const v = e.target.value.slice(0, 20);
                      setNickname(v);
                    }}
                    maxLength={20}
                    autoComplete="off"
                  />
                </div>
                <p className="home-nickname-hint">No personal info. Just for the leaderboard!</p>
              </div>
            </div>
          </Card>
          <Card className="home-how-card" padding="md">
            <div className="home-section-header">
              <span className="home-section-icon">⚡</span>
              <h2 className="home-section-title">HOW IT WORKS</h2>
              <span className="home-section-meta">FOUR STEPS. ONE EPIC CHALLENGE.</span>
            </div>
            <div className="home-how-grid">
              {HOW_IT_WORKS.map((step) => (
                <div key={step.number} className="home-how-step">
                  <span className="home-how-number">{step.number}</span>
                  <span className="home-how-icon" aria-hidden="true">{step.icon}</span>
                  <h3 className="home-how-title">{step.title}</h3>
                  <p className="home-how-desc">{step.description}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="home-mini-card" padding="md">
            <div className="home-section-header">
              <span className="home-section-icon">🎯</span>
              <h2 className="home-section-title">THE MINI CHALLENGES</h2>
              <span className="home-section-meta">3 CHALLENGES. 3 MINUTES. 1 FLAG.</span>
            </div>
            <div className="home-mini-grid">
              {MINI_CHALLENGES.map((c) => (
                <div key={c.title} className="home-mini-item">
                  <span className="home-mini-icon" aria-hidden="true">{c.icon}</span>
                  <div>
                    <span className="home-mini-title">{c.title}</span>
                    <span className="home-mini-sub">{c.sub}</span>
                  </div>
                  <span className="home-mini-arrow" aria-hidden="true">›</span>
                </div>
              ))}
            </div>
          </Card>

          {sessionStatus === 'error' && (
            <Card className="home-session-banner error" padding="sm">
              <span>Could not reach the server. Check your connection and try again.</span>
              <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>Retry</Button>
            </Card>
          )}

          {sessionStatus === 'active' && activeSessionId && (
            <Card className="home-session-banner active" padding="sm">
              <span>You have a game in progress{activeSessionAlias ? ` as ${activeSessionAlias}` : ''}.</span>
              <div className="home-session-banner-actions">
                <Button variant="primary" size="sm" onClick={resume} disabled={resuming}>
                  {resuming ? 'Checking…' : 'Resume current game'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowEndConfirm(true)}>
                  End game and start new
                </Button>
              </div>
            </Card>
          )}

          <div className="home-actions">
            <Button variant="primary" size="lg" onClick={start} className="home-start-btn">▶ START CHALLENGE</Button>
            <Button variant="secondary" size="lg" onClick={() => navigate('/leaderboard')} className="home-leaderboard-btn">🏆 LEADERBOARD</Button>
          </div>
        </div>
        <div className="home-right">
          <Card className="home-wheel-card" padding="md">
            <div className="home-wheel-header">
              <span className="home-wheel-icon" aria-hidden="true">🎁</span>
              <div>
                <h2 className="home-wheel-title">SPIN & WIN</h2>
                <p className="home-wheel-sub">PHYSICAL PRIZES FOR QUALIFIED PLAYERS</p>
              </div>
            </div>
            <div className="home-wheel-wrap">
              <Wheel prizes={wheelPrizes} diameter={560} hubLabel="SPIN" hubSubLabel="TO WIN" />
            </div>
            <p className="home-wheel-legend">
              <strong>Qualify:</strong> solve at least 2 of 3 challenges and capture the final flag before time expires.
            </p>
          </Card>
          <div className="home-sound">
            <SoundActivator compact />
          </div>
        </div>
      </div>

      {showEndConfirm && (
        <div className="home-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="end-confirm-title">
          <Card padding="lg" className="home-confirm-card">
            <h2 id="end-confirm-title" className="home-confirm-title">End current game?</h2>
            <p className="home-confirm-text">
              Your unfinished round{activeSessionAlias ? ` (${activeSessionAlias})` : ''} will be abandoned.
              Your score so far will not carry over to the new game.
            </p>
            <div className="home-confirm-actions">
              <Button variant="ghost" size="md" onClick={() => setShowEndConfirm(false)}>Keep playing</Button>
              <Button variant="primary" size="md" onClick={endAndStartNew} disabled={endingSession}>
                {endingSession ? 'Abandoning…' : 'Abandon and start new'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      <HAUQRModal open={showQR} onClose={() => setShowQR(false)} />
    </Shell>
  );
}
