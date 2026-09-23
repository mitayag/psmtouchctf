import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Shell } from '../components/Shell';
import { StatusOverlay } from '../components/StatusOverlay';
import { Wheel } from '../components/Wheel';
import { WheelResultModal } from '../components/WheelResultModal';
import { useGameSession } from '../hooks/useGameSession';
import { api } from '../services/api';
import { audio } from '../services/audio';
import type { Award, Prize } from '../types';
import './PrizeWheelScreen.css';

export function PrizeWheelScreen() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { session, loading, error: sessionError, refresh, spin } = useGameSession(sessionId);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [targetSegment, setTargetSegment] = useState(0);
  const [committedAward, setCommittedAward] = useState<Award | null>(null);
  const [spinError, setSpinError] = useState<string | null>(null);
  const [noStock, setNoStock] = useState(false);
  const [spinRequested, setSpinRequested] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    if (session && !session.qualified) {
      navigate(`/play/${sessionId}/results`);
    }
  }, [session, navigate, sessionId]);

  useEffect(() => {
    api.getPrizes().then(setPrizes).catch(() => {});
  }, []);

  const handleSpin = useCallback(async () => {
    if (spinning || spinRequested) return;
    setSpinRequested(true);
    setSpinError(null);
    completedRef.current = false;
    try {
      const award = await spin();
      if (!award) {
        setNoStock(true);
        setSpinRequested(false);
        return;
      }
      setCommittedAward(award);
      setTargetSegment(award.segmentIndex);
      setSpinning(true);
      audio.play('wheelSpin');
    } catch (e) {
      setSpinError((e as Error).message);
      setSpinRequested(false);
    }
  }, [spinning, spinRequested, spin]);

  const handleSpinComplete = useCallback(() => {
    setSpinning(false);
    if (completedRef.current) return;
    completedRef.current = true;
    audio.play('prizeReveal');
    setShowResult(true);
  }, []);

  const handleResultClose = useCallback(() => {
    setShowResult(false);
  }, []);

  const handleTick = useCallback(() => {
    audio.play('wheelTick');
  }, []);

  if (!session) {
    return (
      <Shell header={<div />}>
        <StatusOverlay loading={loading && !session} error={sessionError} onRetry={refresh} />
        <div className="pw-loading">Loading…</div>
      </Shell>
    );
  }

  const eligiblePrizes = prizes.filter(p => p.active && p.weight > 0 && p.available > 0);
  const totalWeight = eligiblePrizes.reduce((sum, p) => sum + p.weight, 0);
  const wheelPrizes = eligiblePrizes.length > 0 ? eligiblePrizes : prizes;
  const noEligible = eligiblePrizes.length === 0;

  const wonPrize = committedAward ? prizes.find(p => p.id === committedAward.prizeId) : null;

  return (
    <Shell
      header={
        <Header
          title="Prize Wheel"
          subtitle={committedAward ? 'Your prize spin is unlocked' : 'Spin for a prize'}
          right={<div className="pw-score">🏆 SCORE <span>{session.score}</span></div>}
        />
      }
      footer={
        <Footer
          center="HACKING A BRIGHTER TOMORROW"
          right={<Button variant="ghost" size="sm" onClick={() => navigate(`/play/${sessionId}/results`)}>← Back to results</Button>}
        />
      }
    >
      <div className="pw-layout">
        <div className="pw-wheel-area">
          <h1 className="pw-title">VAULT BREACHED</h1>
          <p className="pw-subtitle">Your prize spin is unlocked</p>
          <div className="pw-wheel-wrap">
            <Wheel
              prizes={wheelPrizes}
              diameter={560}
              spinning={spinning}
              targetSegment={targetSegment}
              onSpinComplete={handleSpinComplete}
              onTick={handleTick}
              hubLabel="SPIN"
              hubSubLabel="TO WIN"
            />
          </div>
        </div>
        <Card className="pw-panel" padding="lg">
          <h2 className="pw-panel-title"><span className="neon-text-cyan">HACK.</span> <span className="neon-text-magenta">SPIN.</span> WIN.</h2>
          <p className="pw-panel-sub">One spin. One prize.</p>

          <div className="pw-prizes">
            {prizes.length === 0 ? (
              <div className="pw-no-stock" role="alert">No prizes available</div>
            ) : (
              wheelPrizes.map(p => (
                <div key={p.id} className={`pw-prize-card${committedAward && committedAward.prizeId === p.id ? ' revealed' : ''}`}>
                  <span className="pw-prize-icon">{p.icon}</span>
                  <span className="pw-prize-name">{p.shortLabel || p.label}</span>
                </div>
              ))
            )}
          </div>

          {prizes.length > 0 && (
            <div className="pw-odds" style={{ marginBottom: 8 }}>
              <strong>{eligiblePrizes.length}</strong> eligible prize{eligiblePrizes.length !== 1 ? 's' : ''}
              {eligiblePrizes.length > 0 && (
                <> — {eligiblePrizes.map(p => `${p.shortLabel || p.label}: ${Math.round(p.weight / totalWeight * 100)}%`).join(', ')}</>
              )}
            </div>
          )}

          {!committedAward && !spinning && (
            <>
              {noEligible ? (
                <div className="pw-no-stock" role="alert">
                  {prizes.length === 0
                    ? 'No prizes available. Please try again later.'
                    : 'No prizes are currently in stock. Please try again later.'}
                </div>
              ) : noStock ? (
                <div className="pw-no-stock" role="alert">
                  No prizes are currently available. Please try again later.
                </div>
              ) : spinError ? (
                <div className="pw-error" role="alert">{spinError}</div>
              ) : null}
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={handleSpin}
                disabled={spinRequested || noStock || noEligible}
              >
                {spinRequested ? 'Requesting spin…' : 'SPIN FOR A PRIZE'}
              </Button>
              {!noEligible && <p className="pw-instruction">Tap once to reveal your reward.</p>}
            </>
          )}

          {spinning && (
            <div className="pw-spinning-status">
              <p className="pw-spinning-text">Spinning…</p>
            </div>
          )}

          {committedAward && !spinning && !showResult && (
            <div className="pw-revealed" role="status">
              <p className="pw-reveal-text">🎉 You won <strong>{wonPrize?.shortLabel || wonPrize?.label || 'a prize'}</strong>!</p>
              <p className="pw-reveal-sub">Redirecting to your claim code…</p>
            </div>
          )}

          <div className="pw-odds">
            <strong>Segment size does not represent odds.</strong><br />
            Odds depend on prize weights and remaining stock.
          </div>
        </Card>
      </div>

      {/* Live result modal */}
      <WheelResultModal
        open={showResult && !!committedAward && !!wonPrize}
        onClose={handleResultClose}
        icon={wonPrize?.icon || '🎁'}
        prizeName={wonPrize?.shortLabel || wonPrize?.label || 'a prize'}
        live
        claimCode={committedAward?.claimCode}
      />
    </Shell>
  );
}
