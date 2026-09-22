import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Shell } from '../components/Shell';
import { api } from '../services/api';
import type { ClaimLookup, PrizeInventoryItem, StaffUser } from '../types';
import './StaffScreen.css';

type StaffView = 'login' | 'lookup' | 'outstanding' | 'prizes';

export function StaffScreen() {
  const navigate = useNavigate();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [view, setView] = useState<StaffView>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [lookupCode, setLookupCode] = useState('');
  const [lookupResult, setLookupResult] = useState<ClaimLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const [outstanding, setOutstanding] = useState<ClaimLookup[]>([]);
  const [outstandingLoading, setOutstandingLoading] = useState(false);

  const [prizes, setPrizes] = useState<PrizeInventoryItem[]>([]);
  const [prizesLoading, setPrizesLoading] = useState(false);

  const [redeemResult, setRedeemResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleLogin = async () => {
    setLoginError(null);
    setLoginLoading(true);
    try {
      const u = await api.staffLogin(username, password);
      setUser(u);
      setView('lookup');
    } catch (e) {
      setLoginError((e as Error).message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleBackToHome = () => {
    setUsername('');
    setPassword('');
    setLoginError(null);
    navigate('/');
  };

  const handleLookup = async () => {
    if (!user || !lookupCode.trim()) return;
    setLookupError(null);
    setLookupResult(null);
    setRedeemResult(null);
    setLookupLoading(true);
    try {
      const result = await api.staffLookupClaim(user.token, lookupCode.trim());
      setLookupResult(result);
    } catch (e) {
      setLookupError((e as Error).message);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleRedeem = async (code: string) => {
    if (!user) return;
    setRedeemResult(null);
    try {
      const result = await api.staffRedeemClaim(user.token, code);
      setRedeemResult(result);
      if (result.success) {
        // Refresh the lookup
        const updated = await api.staffLookupClaim(user.token, code);
        setLookupResult(updated);
      }
    } catch (e) {
      setRedeemResult({ success: false, message: (e as Error).message });
    }
  };

  const handleLoadOutstanding = async () => {
    if (!user) return;
    setOutstandingLoading(true);
    try {
      const claims = await api.staffOutstandingClaims(user.token);
      setOutstanding(claims);
      setView('outstanding');
    } catch (e) {
      console.error(e);
    } finally {
      setOutstandingLoading(false);
    }
  };

  const handleLoadPrizes = async () => {
    if (!user) return;
    setPrizesLoading(true);
    try {
      const p = await api.staffListPrizes(user.token);
      setPrizes(p);
      setView('prizes');
    } catch (e) {
      console.error(e);
    } finally {
      setPrizesLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setView('login');
    setUsername('');
    setPassword('');
  };

  if (!user) {
    return (
      <Shell
        header={<Header title="Staff Portal" subtitle="Claim redemption tools" />}
        footer={<Footer center="PSM TOUCHCTF STAFF ONLY" />}
      >
        <div className="staff-layout">
          <Card className="staff-login-card" padding="lg">
            <h1 className="staff-login-title">Staff Login</h1>
            {loginError && <div className="staff-error" role="alert">{loginError}</div>}
            <div className="staff-form">
              <label className="staff-label">Username</label>
              <input
                className="staff-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
              <label className="staff-label">Password</label>
              <input
                className="staff-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
              <Button variant="primary" size="lg" fullWidth onClick={handleLogin} disabled={loginLoading}>
                {loginLoading ? 'Logging in…' : 'Login'}
              </Button>
              <button type="button" className="staff-back-btn" onClick={handleBackToHome}>
                ← Back to home
              </button>
            </div>
          </Card>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      header={
        <Header
          title="Staff Portal"
          subtitle={`Logged in as ${user.username} (${user.role})`}
          right={
            <div className="staff-nav">
              <Button variant={view === 'lookup' ? 'primary' : 'ghost'} size="sm" onClick={() => setView('lookup')}>Lookup</Button>
              <Button variant={view === 'outstanding' ? 'primary' : 'ghost'} size="sm" onClick={handleLoadOutstanding} disabled={outstandingLoading}>
                {outstandingLoading ? 'Loading…' : 'Outstanding'}
              </Button>
              <Button variant={view === 'prizes' ? 'primary' : 'ghost'} size="sm" onClick={handleLoadPrizes} disabled={prizesLoading}>
                {prizesLoading ? 'Loading…' : 'Prizes'}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLogout}>Logout</Button>
            </div>
          }
        />
      }
      footer={<Footer center="PSM TOUCHCTF STAFF ONLY" />}
    >
      <div className="staff-layout">
        {view === 'lookup' && (
          <Card className="staff-card" padding="lg">
            <h2 className="staff-card-title">Claim Lookup</h2>
            <div className="staff-form">
              <label className="staff-label">Claim code</label>
              <div className="staff-lookup-row">
                <input
                  className="staff-input staff-input-code"
                  type="text"
                  value={lookupCode}
                  onChange={(e) => setLookupCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX"
                  onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                />
                <Button variant="primary" size="md" onClick={handleLookup} disabled={lookupLoading}>
                  {lookupLoading ? 'Searching…' : 'Search'}
                </Button>
              </div>
            </div>
            {lookupError && <div className="staff-error" role="alert">{lookupError}</div>}
            {lookupResult && (
              <div className="staff-claim-result">
                <div className="staff-claim-header">
                  <span className="staff-claim-prize-icon">{lookupResult.prizeIcon}</span>
                  <div>
                    <h3 className="staff-claim-prize-name">{lookupResult.prizeName}</h3>
                    <p className="staff-claim-player">Player: {lookupResult.playerAlias}</p>
                  </div>
                </div>
                <div className="staff-claim-code">{lookupResult.claimCode}</div>
                <div className="staff-claim-status">
                  Status: <span className={`staff-status-${lookupResult.status}`}>{lookupResult.status}</span>
                </div>
                <p className="staff-claim-date">Awarded: {new Date(lookupResult.awardedAt).toLocaleString()}</p>
                {lookupResult.redeemedAt && (
                  <p className="staff-claim-date">Redeemed: {new Date(lookupResult.redeemedAt).toLocaleString()}</p>
                )}
                {lookupResult.status === 'awarded' && (
                  <Button variant="primary" size="lg" fullWidth onClick={() => handleRedeem(lookupResult.claimCode)}>
                    Confirm handover
                  </Button>
                )}
                {redeemResult && (
                  <div className={`staff-redeem-result ${redeemResult.success ? 'success' : 'error'}`} role="status">
                    {redeemResult.message}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {view === 'outstanding' && (
          <Card className="staff-card" padding="lg">
            <h2 className="staff-card-title">Outstanding Claims</h2>
            {outstanding.length === 0 ? (
              <p className="staff-empty">No outstanding claims.</p>
            ) : (
              <div className="staff-outstanding-list">
                {outstanding.map(c => (
                  <div key={c.awardId} className="staff-outstanding-item">
                    <span className="staff-claim-prize-icon">{c.prizeIcon}</span>
                    <div className="staff-outstanding-info">
                      <span className="staff-outstanding-prize">{c.prizeName}</span>
                      <span className="staff-outstanding-player">{c.playerAlias}</span>
                    </div>
                    <div className="staff-outstanding-code">{c.claimCode}</div>
                    <Button variant="primary" size="sm" onClick={() => { setLookupCode(c.claimCode); setView('lookup'); handleLookup(); }}>
                      Redeem
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {view === 'prizes' && (
          <Card className="staff-card" padding="lg">
            <h2 className="staff-card-title">Prize Inventory</h2>
            {prizes.length === 0 ? (
              <p className="staff-empty">No prizes configured.</p>
            ) : (
              <table className="staff-prizes-table">
                <thead>
                  <tr>
                    <th>PRIZE</th>
                    <th>WEIGHT</th>
                    <th>RECEIVED</th>
                    <th>RESERVED</th>
                    <th>REDEEMED</th>
                    <th>AVAILABLE</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {prizes.map(p => (
                    <tr key={p.prizeId}>
                      <td>{p.icon} {p.name}</td>
                      <td>{p.weight}</td>
                      <td>{p.stockReceived}</td>
                      <td>{p.stockReserved}</td>
                      <td>{p.stockRedeemed}</td>
                      <td>{p.available}</td>
                      <td>
                        <span className={`staff-inventory-status ${p.available > 0 ? 'in-stock' : 'out-of-stock'}`}>
                          {p.available > 0 ? 'In stock' : 'Out of stock'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </div>
    </Shell>
  );
}
