import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Shell } from '../components/Shell';
import { StepProgress } from '../components/StepProgress';
import { Timer } from '../components/Timer';
import { StatusOverlay } from '../components/StatusOverlay';
import { TouchKeyboard } from '../components/TouchKeyboard';
import { useActiveChallenge, useGameSession } from '../hooks/useGameSession';
import { api } from '../services/api';
import { audio } from '../services/audio';
import type { PhishingEvidence, LogEntry, DecodeToken, PhishingChallengeData, LogsChallengeData, DecodeChallengeData } from '../types';
import './ChallengeScreen.css';

const stepIcons={home:<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,challenge:<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/></svg>,flag:<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,wheel:<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20"/></svg>,leaderboard:<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>};

function HeaderRight({ session, position, onTimerExpired }: { session: ReturnType<typeof useGameSession>['session']; position: number; onTimerExpired?: () => void }) {
  if (!session) return null;
  const prevScore = useRef(session.score);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (session.score !== prevScore.current) {
      prevScore.current = session.score;
      setBump(true);
      const t = setTimeout(() => setBump(false), 400);
      return () => clearTimeout(t);
    }
  }, [session.score]);
  const durationSeconds = session.accessibilityMode === 'extended-time' ? 300 : 180;
  return <div className="challenge-header-right"><Timer serverNow={session.serverNow} expiresAt={session.expiresAt} durationSeconds={durationSeconds} completed={session.state !== 'active'} onExpired={onTimerExpired} /><div className="challenge-score"><span className="challenge-score-label">SCORE</span><span className={`challenge-score-value ${bump ? 'bump' : ''}`}>{session.score}</span></div><div className="challenge-progress"><span className="challenge-score-label">CHALLENGE</span><span className="challenge-score-value">{position} of 3</span></div></div>;
}

export function ChallengeScreen() {
  const { sessionId, position } = useParams<{ sessionId: string; position: string }>();
  const pos = parseInt(position || '1', 10);
  const navigate = useNavigate();
  const { session, loading, error, refresh, submitAnswer, useHint, skip, abandon } = useGameSession(sessionId);
  const { challenge } = useActiveChallenge(sessionId, pos);
  const [selected, setSelected] = useState<string[]>([]);
  const [decodeInput, setDecodeInput] = useState('');
  const [feedback, setFeedback] = useState<{correct?:boolean;message:string;attemptsRemaining?:number}|null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [showEndGame, setShowEndGame] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [showHintConfirm, setShowHintConfirm] = useState(false);
  const state = session?.challenges.find(c => c.position === pos);
  const finalized = !!state?.outcome;

  // Guard against invalid positions and direct navigation to unavailable steps.
  useEffect(() => {
    if (!session) return;
    const validPositions = session.challenges.map(c => c.position);
    if (!validPositions.includes(pos)) {
      navigate(`/play/${sessionId}/challenge/1`, { replace: true });
      return;
    }
    if (session.state === 'ready' || session.state === 'prepared') {
      navigate(`/play/${sessionId}/ready`, { replace: true });
      return;
    }
    // If the round is finalized, route to the appropriate end screen.
    if (session.state === 'completed') {
      navigate(`/play/${sessionId}/flag`, { replace: true });
    } else if (session.state === 'expired' || session.state === 'abandoned') {
      navigate(`/play/${sessionId}/results`, { replace: true });
    }
  }, [session, pos, navigate, sessionId]);

  useEffect(() => {
    // Reset local input when moving to a different challenge position
    setSelected([]);
    setDecodeInput('');
    setFeedback(null);
    setIsSubmitting(false);
    setIsNavigating(false);
  }, [pos]);

  useEffect(() => {
    if (challenge && challenge.data.kind !== 'decode' && state?.selectedAnswer) {
      setSelected(state.selectedAnswer as string[]);
    }
    if (challenge && challenge.data.kind === 'decode' && state?.selectedAnswer) {
      setDecodeInput(state.selectedAnswer as string);
    }
  }, [state, challenge]);

  if (!session || !challenge) {
    return (
      <Shell header={<div />}>
        <StatusOverlay loading={loading && !session} error={error} onRetry={refresh} />
        <div className="challenge-loading">Loading challenge…</div>
      </Shell>
    );
  }

  const handleToggle = (id: string) => { if (finalized || isSubmitting) return; setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); };
  const submit = async () => {
    if (isSubmitting || finalized) return;
    let answer: unknown;
    if (challenge.data.kind === 'decode') answer = decodeInput; else answer = selected;
    if (challenge.data.kind === 'decode' && !(answer as string).trim()) return;
    if (challenge.data.kind !== 'decode' && selected.length === 0) return;
    setIsSubmitting(true);
    const result = await submitAnswer(pos, answer);
    setIsSubmitting(false);
    setFeedback({ correct: result.correct, message: result.message, attemptsRemaining: result.attemptsRemaining });
    if (result.correct) {
      audio.play('correct');
    } else {
      audio.play('incorrect');
    }
  };

  const encouragingMessage = feedback && !feedback.correct && feedback.attemptsRemaining !== undefined && feedback.attemptsRemaining > 0
    ? `You have ${feedback.attemptsRemaining} attempt${feedback.attemptsRemaining === 1 ? '' : 's'} left. Review the clue and try again!`
    : null;
  const onHint = async () => {
    if (isSubmitting || finalized || state?.hintUsed) return;
    setShowHintConfirm(true);
  };
  const confirmHint = async () => {
    setShowHintConfirm(false);
    await useHint(pos);
    audio.play('hint');
  };
  const onSkip = async () => {
    if (isSubmitting || finalized) return;
    await skip(pos);
    audio.play('button');
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
      // Abandon is idempotent; navigate home regardless.
      api.clearActiveSession();
      navigate('/', { replace: true });
    }
  };

  const next = () => {
    if (isNavigating) return;
    setIsNavigating(true);
    const solvedCount = session.challenges.filter(c => c.outcome === 'solved').length;
    if (solvedCount >= 2 && pos === 3) audio.play('challengeComplete');
    if (pos < 3) {
      navigate(`/play/${sessionId}/challenge/${pos + 1}`);
    } else if (solvedCount >= 2) {
      navigate(`/play/${sessionId}/flag`);
    } else {
      navigate(`/play/${sessionId}/results`);
    }
  };

  const questionText = challenge.data.kind === 'logs' ? challenge.data.question : challenge.data.kind === 'phishing' ? 'Find and tap everything that looks malicious, suspicious, or out of place in this email.' : 'Decode the ciphertext to reveal the flag fragment.';

  return (
    <Shell
      header={<><div className="challenge-header-left"><span className="challenge-type-icon">{challenge.type === 'phishing' ? '✉️' : challenge.type === 'logs' ? '📋' : '▶️'}</span><div><h1 className="challenge-title">{challenge.title}</h1><p className="challenge-instruction">{challenge.instruction}</p></div></div><HeaderRight session={session} position={pos} onTimerExpired={refresh} /></>}
      footer={<StepProgress steps={[{ id: 'home', number: 1, label: 'Home', sublabel: 'Start Your Journey', icon: stepIcons.home },{ id: 'challenge', number: 2, label: 'Challenge', sublabel: 'Solve the Challenge', icon: stepIcons.challenge },{ id: 'flag', number: 3, label: 'Final Flag', sublabel: 'Capture the Flag', icon: stepIcons.flag },{ id: 'wheel', number: 4, label: 'Prize Wheel', sublabel: 'Win Exciting Prizes', icon: stepIcons.wheel },{ id: 'leaderboard', number: 5, label: 'Leaderboard', sublabel: 'See the Top Players', icon: stepIcons.leaderboard }]} activeId="challenge" />}
    >
      <StatusOverlay loading={false} error={error} onRetry={refresh} />
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
      {showHintConfirm && (
        <ConfirmDialog
          title="Use a hint?"
          message="Using a hint costs 25 points from this challenge's potential score. The hint will guide you without revealing the full answer."
          confirmLabel="Use hint (−25)"
          cancelLabel="Cancel"
          onConfirm={confirmHint}
          onCancel={() => setShowHintConfirm(false)}
        />
      )}
      <div className="challenge-layout">
        <div className="challenge-task"><Card className="challenge-evidence-card" padding="md">{challenge.data.kind === 'phishing' && <PhishingView data={challenge.data} selected={selected} onToggle={handleToggle} finalized={finalized} />}{challenge.data.kind === 'logs' && <LogsView data={challenge.data} selected={selected} onToggle={handleToggle} finalized={finalized} />}{challenge.data.kind === 'decode' && <DecodeView data={challenge.data} input={decodeInput} onInput={setDecodeInput} finalized={finalized} />}</Card></div>
        <div className="challenge-context">
          <Card className="challenge-context-card" padding="md">
            <h2 className="context-title">🖐️ {challenge.data.kind === 'phishing' ? 'Tap all suspicious elements' : challenge.data.kind === 'logs' ? 'Select the suspicious rows' : 'Decode the flag'}</h2>
            <p className="context-desc">{questionText}</p>
            <div className="challenge-clues"><h3 className="clues-title">Discovered Clues ({selected.length})</h3>{selected.length === 0 ? <p className="clues-empty">No selections yet.</p> : <ul className="clues-list">{selected.map(id => { let label = id; if (challenge.data.kind === 'phishing') { const e = challenge.data.evidence.find((x: PhishingEvidence) => x.id === id); if (e) label = e.label; } else if (challenge.data.kind === 'logs') { const l = challenge.data.logs.find((x: LogEntry) => x.id === id); if (l) label = `${l.event} ${l.source}`; } return <li key={id} className="clue-item">{label}</li>; })}</ul>}</div>
            {state?.hintUsed && <div className="challenge-hint-box"><strong>Hint:</strong> {challenge.hint}</div>}
            {feedback && (
              <div className={`challenge-feedback ${feedback.correct ? 'success' : 'error'}`}>
                <span className="challenge-feedback-icon" aria-hidden="true">{feedback.correct ? '✓' : '✕'}</span>
                <div>
                  <div>{feedback.message}</div>
                  {encouragingMessage && <div className="challenge-feedback-encourage">{encouragingMessage}</div>}
                </div>
              </div>
            )}
            <div className="challenge-actions">
              {!finalized && <Button variant="secondary" size="md" onClick={onHint} disabled={isSubmitting || state?.hintUsed}>💡 Hint {state?.hintUsed ? '' : '(-25)'}</Button>}
              {!finalized && <Button variant="ghost" size="md" onClick={onSkip} disabled={isSubmitting}>Skip</Button>}
              {!finalized && <Button variant="ghost" size="md" onClick={() => setShowEndGame(true)} disabled={isSubmitting || isEnding}>End Game</Button>}
              {!finalized ? (
                <Button variant="primary" size="md" onClick={submit} disabled={isSubmitting || (challenge.data.kind === 'decode' ? !decodeInput.trim() : selected.length === 0)}>
                  {isSubmitting ? 'Checking…' : '✓ Submit Answer'}
                </Button>
              ) : (
                <Button variant="primary" size="md" onClick={next} disabled={isNavigating}>
                  {pos < 3 ? 'Next →' : session.challenges.filter(c => c.outcome === 'solved').length >= 2 ? 'Capture Flag →' : 'View results →'}
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  );
}

function EvidenceButton({ id, label, detail, selected, finalized, onToggle }: { id: string; label: string; detail: string; selected: boolean; finalized: boolean; onToggle: (id: string) => void }) {
  return (
    <button
      data-evidence-id={id}
      className={`evidence-item ${selected ? 'selected' : ''}`}
      onClick={() => !finalized && onToggle(id)}
      disabled={finalized}
      aria-pressed={selected}
    >
      <span className="evidence-label">{label}</span>
      <span className="evidence-detail">{detail}</span>
    </button>
  );
}

function PhishingView({ data, selected, onToggle, finalized }: { data: PhishingChallengeData; selected: string[]; onToggle: (id: string) => void; finalized: boolean }) {
  const toggle = (id: string) => !finalized && onToggle(id);
  return (
    <div className="phishing-email">
      <div className="email-row">
        <span className="email-label">From:</span>
        <span className="email-value">{data.email.from}</span>
      </div>
      <div className="email-row">
        <span className="email-label">To:</span>
        <span className="email-value">{data.email.to}</span>
      </div>
      <div className="email-row">
        <span className="email-label">Subject:</span>
        <span className="email-value">{data.email.subject}</span>
      </div>
      <div className="email-body">
        {data.email.body.split('\n').map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
      {data.email.attachment && (
        <div className="email-attachment">
          📄 {data.email.attachment.name}<br /><small>{data.email.attachment.size}</small>
        </div>
      )}
      <div className="evidence-list" role="group" aria-label="Suspicious elements">
        {data.evidence.map((e) => (
          <EvidenceButton
            key={e.id}
            id={e.id}
            label={e.label}
            detail={e.detail}
            selected={selected.includes(e.id)}
            finalized={finalized}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}

function LogsView({ data, selected, onToggle, finalized }: { data: LogsChallengeData; selected: string[]; onToggle: (id: string) => void; finalized: boolean }) {
  return (
    <div className="logs-table-wrap">
      <table className="logs-table">
        <thead><tr><th>Time</th><th>Source</th><th>Event</th><th>Detail</th></tr></thead>
        <tbody>
          {data.logs.map((log) => (
            <tr
              key={log.id}
              data-log-id={log.id}
              className={selected.includes(log.id) ? 'selected' : ''}
              onClick={() => !finalized && onToggle(log.id)}
            >
              <td>{log.timestamp}</td>
              <td>{log.source}</td>
              <td>{log.event}</td>
              <td>{log.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DecodeView({ data, input, onInput, finalized }: { data: DecodeChallengeData; input: string; onInput: (v: string) => void; finalized: boolean }) {
  const append = (v: string) => !finalized && onInput(input + v);
  return (
    <div className="decode-panel">
      <div className="decode-prompt">{data.prompt}</div>
      {data.substitutionLegend && (
        <div className="decode-legend">
          <strong>Legend:</strong>
          <div className="decode-legend-grid">
            {Object.entries(data.substitutionLegend).map(([symbol, letter]) => (
              <div key={symbol} className="decode-legend-item"><code>{symbol}</code> → <span>{letter}</span></div>
            ))}
          </div>
        </div>
      )}
      {data.binaryLookup && (
        <div className="decode-legend">
          <strong>ASCII lookup aid:</strong>
          <div className="decode-legend-grid">
            {Object.entries(data.binaryLookup).map(([bits, letter]) => (
              <div key={bits} className="decode-legend-item"><code>{bits}</code> → <span>{letter}</span></div>
            ))}
          </div>
        </div>
      )}
      <input className="decode-input" value={input} onChange={(e) => !finalized && onInput(e.target.value)} placeholder={data.placeholder} readOnly={finalized} />
      <div className="decode-tokens">{data.tokens.map((t: DecodeToken) => <button key={t.id} className="decode-token" onClick={() => append(t.value)} disabled={finalized}>{t.value}</button>)}</div>
      <TouchKeyboard onKey={(k) => append(k)} onBackspace={() => onInput(input.slice(0, -1))} onDone={() => {}} mode="flag" />
    </div>
  );
}
