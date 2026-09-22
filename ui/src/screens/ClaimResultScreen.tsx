import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Shell } from '../components/Shell';
import { useGameSession } from '../hooks/useGameSession';
import { api } from '../services/api';
import { resetForNextPlayer } from '../hooks/useGameSession';
import type { Award } from '../types';
import './ClaimResultScreen.css';

export function ClaimResultScreen() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { getAward } = useGameSession(sessionId);
  const [award, setAward] = useState<Award | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAward().then((a) => {
      if (!cancelled) setAward(a);
    }).catch((e) => {
      if (!cancelled) setError(e.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [getAward]);

  const handleDone = () => {
    resetForNextPlayer();
    api.clearActiveSession();
    navigate('/', { replace: true });
  };

  if (loading) {
    return (
      <Shell header={<div />}>
        <div className="cr-layout">
          <Card className="cr-card" padding="lg">
            <p className="cr-instruction">Retrieving your prize…</p>
          </Card>
        </div>
      </Shell>
    );
  }

  if (error || !award) {
    return (
      <Shell header={<div />}>
        <div className="cr-layout">
          <Card className="cr-card" padding="lg">
            <h1 className="cr-title">No Prize Awarded</h1>
            <p className="cr-instruction">{error || 'No prize was awarded for this session.'}</p>
            <Button variant="primary" size="lg" fullWidth onClick={handleDone}>Done</Button>
          </Card>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      header={<Header title="Claim Prize" subtitle="Show this code to booth staff" />}
      footer={<Footer center="CLAIM CODES ARE STAFF-REDEEMABLE ONLY" />}
    >
      <div className="cr-layout">
        <Card className="cr-card" padding="lg">
          <h1 className="cr-title">🎉 You won {award.prizeId}!</h1>
          <div className="cr-prize">
            <span className="cr-prize-icon">{award.prizeId}</span>
          </div>
          <p className="cr-instruction">Show this code to booth staff to claim your prize.</p>
          <div className="cr-code" aria-label="Claim code">{award.claimCode}</div>
          <p className="cr-expiry">This code is valid until the event closes.</p>
          <Button variant="primary" size="lg" fullWidth onClick={handleDone}>Done</Button>
        </Card>
      </div>
    </Shell>
  );
}
