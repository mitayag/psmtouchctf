import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Confetti } from '../components/Confetti';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Shell } from '../components/Shell';
import { TrophyBronze, TrophyCyan, TrophyGold, TrophySilver } from '../components/TrophyIcons';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { audio } from '../services/audio';
import { api } from '../services/api';
import type { EventStatus, LeaderboardEntry } from '../types';
import './LeaderboardScreen.css';

const STANDARD_DURATION_MS = 180_000;

function fmtTime(ms: number) {
  const clamped = Math.max(0, Math.min(ms, STANDARD_DURATION_MS));
  const s = Math.floor(clamped / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function isCaptured(e: LeaderboardEntry): boolean {
  return !!e.finalFlag && e.finalFlag.startsWith('PSM{');
}

export function LeaderboardScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [status, setStatus] = useState<EventStatus | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [celebrateFirst, setCelebrateFirst] = useState(false);
  const fromRound = location.state && (location.state as { fromRound?: boolean }).fromRound === true;
  const audioPlayedRef = useRef(false);

  useEffect(() => {
    api.getLeaderboardReal().then(setEntries);
    api.getPublicEvent().then(data => {
      setStatus({
        name: data.name,
        tagline: 'Capture. Crack. Defend.',
        state: data.state as 'open' | 'paused' | 'closed',
        durationSeconds: data.durationSeconds,
        playersToday: data.playersToday,
        averageScore: data.averageScore,
        prizesClaimed: data.prizesClaimed,
        challengesSolvedToday: data.challengesSolvedToday,
        prizesWonToday: data.prizesWonToday,
        bestTimeMs: data.bestTimeMs,
      });
    });
    const id = setInterval(() => api.getLeaderboardReal().then(setEntries), 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!fromRound || entries.length === 0) return;
    if (audioPlayedRef.current) return;
    audioPlayedRef.current = true;

    const current = entries.find((e) => e.isCurrentPlayer);
    const isFirst = current?.rank === 1;
    setShowConfetti(true);
    setCelebrateFirst(isFirst);
    audio.play('leaderboardCelebration');
    const t = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(t);
  }, [fromRound, entries]);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3, 10);
  const current = entries.find((e) => e.isCurrentPlayer);
  const currentOutsideTop10 = current && current.rank > 10;

  return (
    <Shell
      header={<Header title="Hall of Hackers" subtitle="Top hackers. Real skills. A safer tomorrow." right={<div className="lb-header-stats"><div className="lb-stat"><span className="lb-stat-label">PLAYERS</span><span className="lb-stat-value">{status?.playersToday ?? 0}</span></div><div className="lb-stat"><span className="lb-stat-label">CHALLENGES SOLVED</span><span className="lb-stat-value">{status?.challengesSolvedToday ?? 0}</span></div></div>} />}
      footer={<Footer center="PEOPLE + SKILLS + TECHNOLOGY = A SAFER TOMORROW" right={<Button variant="ghost" size="sm" onClick={() => navigate('/')}>Back to home</Button>} />}
    >
      <Confetti active={showConfetti} />
      <div className="lb-layout">
        <div className="lb-main">
          <Card className="lb-card" padding="lg">
            <div className="lb-header">
              <span className="lb-icon" aria-hidden="true">🏆</span>
              <h1 className="lb-title">LEADERBOARD</h1>
              <span className="lb-meta">LIVE</span>
            </div>

            {top3.length > 0 && (
              <div className={`lb-podium ${celebrateFirst ? 'first-place-celebration' : ''}`}>
                {/* 2nd place */}
                {top3[1] && <PodiumCard rank={2} entry={top3[1]} delay={0.15} />}
                {/* 1st place */}
                {top3[0] && <PodiumCard rank={1} entry={top3[0]} delay={0} tall />}
                {/* 3rd place */}
                {top3[2] && <PodiumCard rank={3} entry={top3[2]} delay={0.3} />}
              </div>
            )}

            <div className="lb-list" role="list" aria-label="Leaderboard ranks 4 through 10">
              {rest.map((e, i) => (
                <LeaderboardRow key={e.nickname} entry={e} index={i} />
              ))}
            </div>

            {currentOutsideTop10 && current && (
              <div className="lb-your-result">
                <h2 className="lb-your-result-title">Your result</h2>
                <LeaderboardRow entry={current} index={-1} />
              </div>
            )}
          </Card>
        </div>

        <div className="lb-side">
          <Card className="lb-stats-card" padding="md">
            <h2 className="lb-side-title">📊 EVENT STATS</h2>
            <p className="lb-side-sub">Today's progress. A stronger community.</p>
            <div className="lb-stats-grid">
              <div className="lb-stat-box"><span className="lb-stat-box-value">{status?.challengesSolvedToday ?? 0}</span><span className="lb-stat-box-label">Challenges Solved Today</span></div>
              <div className="lb-stat-box"><span className="lb-stat-box-value">{status?.prizesWonToday ?? 0}</span><span className="lb-stat-box-label">Prizes Won Today</span></div>
              <div className="lb-stat-box"><span className="lb-stat-box-value">{fmtTime(status?.bestTimeMs ?? 0)}</span><span className="lb-stat-box-label">Best Time Today</span></div>
              <div className="lb-stat-box"><span className="lb-stat-box-value">{status?.averageScore ?? 0}</span><span className="lb-stat-box-label">Average Score Today</span></div>
            </div>
            <p className="lb-demo-note">Leaderboard updates in real time.</p>
            <div className="lb-quote">“Great hackers build a safer tomorrow.”<br/>— PSM</div>
          </Card>
          <Button variant="magenta" size="lg" fullWidth onClick={() => navigate('/')}>Play again →</Button>
          <Button variant="secondary" size="lg" fullWidth onClick={() => navigate('/')}>Back to home →</Button>
        </div>
      </div>
    </Shell>
  );
}

function PodiumCard({ rank, entry, delay, tall }: { rank: number; entry: LeaderboardEntry; delay: number; tall?: boolean }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      setAnimatedScore(entry.score);
      return;
    }
    const duration = 1200;
    const start = performance.now();
    const startValue = 0;
    const endValue = entry.score;
    let raf: number;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(startValue + (endValue - startValue) * eased));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    const timer = setTimeout(() => {
      raf = requestAnimationFrame(animate);
    }, delay * 1000 + 300);
    return () => {
      clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [entry.score, delay, reducedMotion]);

  const Trophy = rank === 1 ? TrophyGold : rank === 2 ? TrophySilver : TrophyBronze;
  const delayStyle = { animationDelay: `${delay}s` } as React.CSSProperties;

  return (
    <div className={`lb-podium-card rank-${rank} ${entry.isCurrentPlayer ? 'current' : ''} ${tall ? 'tall' : ''}`} style={delayStyle}>
      <div className="lb-podium-trophy"><Trophy className="lb-trophy-svg" /></div>
      <div className="lb-podium-rank">{rank}</div>
      <div className="lb-podium-name">{entry.nickname}</div>
      <div className="lb-podium-score">{animatedScore}</div>
      <div className="lb-podium-meta">
        <span>{fmtTime(entry.elapsedMs)}</span>
        <span className="lb-capture-status">{isCaptured(entry) ? 'Captured' : 'Not captured'}</span>
      </div>
      {entry.isCurrentPlayer && <span className="lb-current-badge">YOU</span>}
    </div>
  );
}

function LeaderboardRow({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  const [animatedScore, setAnimatedScore] = useState(entry.score);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      setAnimatedScore(entry.score);
      return;
    }
    const duration = 800;
    const start = performance.now();
    const startValue = entry.score - 30;
    const endValue = entry.score;
    let raf: number;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(startValue + (endValue - startValue) * eased));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    const timer = setTimeout(() => {
      raf = requestAnimationFrame(animate);
    }, 600 + index * 80);
    return () => {
      clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [entry.score, index, reducedMotion]);

  return (
    <div role="listitem" className={`lb-row ${entry.isCurrentPlayer ? 'current' : ''}`}>
      <div className="lb-row-rank"><TrophyCyan className="lb-row-trophy" /><span>{entry.rank}</span></div>
      <div className="lb-row-name">{entry.nickname}</div>
      <div className="lb-row-score">{animatedScore}</div>
      <div className="lb-row-time">{fmtTime(entry.elapsedMs)}</div>
      <div className="lb-row-capture">{isCaptured(entry) ? 'Captured' : 'Not captured'}</div>
    </div>
  );
}
