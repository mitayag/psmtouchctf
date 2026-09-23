import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { Modal, ConfirmModal } from '../components/Modal';
import { Wheel } from '../components/Wheel';
import { WheelResultModal } from '../components/WheelResultModal';
import { SoundToggle } from '../components/SoundToggle';
import { AnimationToggle } from '../components/AnimationToggle';
import { api } from '../services/api';
import type {
  AdminStats,
  AuditLogEntry,
  ChallengeListItem,
  ClaimLookup,
  EventDetail,
  LeaderboardAdminEntry,
  PlayerDataSummary,
  PrizeListItem,
  Prize,
  SessionListItem,
  StaffListItem,
  StaffUser,
} from '../types';
import './AdminScreen.css';

const NAV = ['Overview', 'Challenges', 'Prizes', 'Sessions', 'Claims', 'Leaderboard', 'Audit', 'Staff', 'Settings'] as const;
type NavItem = (typeof NAV)[number];

const ROLE_DESCRIPTIONS: Record<string, string> = {
  staff: 'Session operations and claim redemption',
  admin: 'Event content, prizes, inventory, moderation, and reporting',
  system_admin: 'All permissions, including staff management',
};

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

const EMPTY_PRIZE_FORM = {
  name: '',
  short_label: '',
  icon: '🎁',
  description: '',
  weight: 1,
  initial_stock: 10,
  display_order: 0,
  color: '#20E3FF',
  active: true,
};

const PRIZE_ICONS = [
  { value: '🎁', label: 'Gift' },
  { value: '☕', label: 'Mug' },
  { value: '👕', label: 'T-Shirt' },
  { value: '📘', label: 'Book / E-Book' },
  { value: '⭐', label: 'Pin' },
  { value: '🏷️', label: 'Sticker' },
  { value: '🖊️', label: 'Pen' },
  { value: '📓', label: 'Notebook' },
  { value: '👜', label: 'Tote Bag' },
  { value: '🧢', label: 'Cap' },
  { value: '🏆', label: 'Trophy' },
  { value: '🔑', label: 'Keychain' },
  { value: '🎟️', label: 'Voucher' },
  { value: '❓', label: 'Mystery Prize' },
  { value: '☂️', label: 'Umbrella' },
];

export function AdminScreen() {
  const navigate = useNavigate();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [active, setActive] = useState<NavItem>('Overview');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async () => {
    setLoginError(null);
    if (!username.trim() || !password) {
      setLoginError('Enter your username and password.');
      return;
    }
    setLoginLoading(true);
    try {
      const u = await api.adminLogin(username, password);
      setUser(u);
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

  const handleLogout = () => {
    setUser(null);
    setUsername('');
    setPassword('');
  };

  if (!user) {
    return (
      <div className="admin-login-shell">
        <div className="admin-login-card">
          <div className="admin-login-brand">PSM <span>TouchCTF</span><small>ADMIN CONSOLE</small></div>
          <h1 className="admin-login-title">Staff Login</h1>
          {loginError && <div className="admin-login-error" role="alert">{loginError}</div>}
          <div className="admin-login-form">
            <label className="admin-login-label">Username</label>
            <input className="admin-login-input" type="text" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" />
            <label className="admin-login-label">Password</label>
            <input className="admin-login-input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            <button className="admin-login-btn" onClick={handleLogin} disabled={loginLoading}>
              {loginLoading ? 'Logging in…' : 'Login'}
            </button>
            <button type="button" className="admin-login-back-btn" onClick={handleBackToHome}>
              ← Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">PSM <span>TouchCTF</span><small>ADMIN CONSOLE</small></div>
        <nav className="admin-nav">
          {NAV.map(item => (
            <button key={item} className={`admin-nav-item ${active === item ? 'active' : ''}`} onClick={() => setActive(item)}>
              {item}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <div className="admin-user-badge">👤 {user.username}</div>
          <button className="admin-logout-btn" onClick={handleLogout}>Logout</button>
        </div>
        <div className="admin-sidelogo">PLAY<br/>SOLVE<br/>WIN<br/><span>TOGETHER</span></div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <h1>{active}</h1>
            {active === 'Overview' && <p>Real-time insights for a smoother event</p>}
          </div>
          <div className="admin-topbar-right">
            <StatusBadge status="online" label="SYSTEM ONLINE" />
          </div>
        </header>
        {active === 'Overview' && <OverviewTab token={user.token} />}
        {active === 'Challenges' && <ChallengesTab token={user.token} />}
        {active === 'Prizes' && <PrizesTab token={user.token} />}
        {active === 'Sessions' && <SessionsTab token={user.token} />}
        {active === 'Claims' && <ClaimsTab token={user.token} />}
        {active === 'Leaderboard' && <LeaderboardTab token={user.token} />}
        {active === 'Audit' && <AuditTab token={user.token} />}
        {active === 'Staff' && <StaffTab token={user.token} />}
        {active === 'Settings' && <SettingsTab token={user.token} userRole={user.role} />}
      </main>
    </div>
  );
}

/* ── Overview ────────────────────────────────────────────────────── */

function OverviewTab({ token }: { token: string }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [prizes, setPrizes] = useState<PrizeListItem[]>([]);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);

  useEffect(() => {
    const ctrl = new AbortController();
    api.adminGetStats(token, ctrl.signal).then(setStats).catch(() => {});
    api.adminListPrizes(token, ctrl.signal).then(setPrizes).catch(() => {});
    api.adminListSessions(token, undefined, undefined, 5, 0, ctrl.signal).then(setSessions).catch(() => {});
    return () => ctrl.abort();
  }, [token]);

  if (!stats) return <div className="admin-loading">Loading…</div>;

  return (
    <div className="admin-content">
      <div className="admin-stats-row">
        <StatCard label="Total sessions" value={stats.total_sessions} />
        <StatCard label="Active sessions" value={stats.active_sessions} />
        <StatCard label="Completed" value={stats.completed_sessions} />
        <StatCard label="Prizes awarded" value={stats.prizes_awarded} />
      </div>
      <div className="admin-grid">
        <Card className="admin-inventory" padding="md">
          <div className="admin-section-header">
            <span>🎁</span>
            <h2>Prize inventory</h2>
            <span>{prizes.length} prizes</span>
          </div>
          <table className="admin-table">
            <thead><tr><th>PRIZE</th><th>AVAILABLE</th><th>WEIGHT</th><th>ODDS</th><th>STATUS</th></tr></thead>
            <tbody>
              {prizes.map(p => (
                <tr key={p.id}>
                  <td>{p.icon} {p.name}</td>
                  <td>{p.available}</td>
                  <td>{p.weight}</td>
                  <td>{p.odds_percent.toFixed(1)}%</td>
                  <td><StatusBadge status={p.active ? 'online' : 'error'} label={p.active ? 'Active' : 'Inactive'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="admin-recent-sessions" padding="md">
          <div className="admin-section-header">
            <span>📋</span>
            <h2>Recent sessions</h2>
            <span>{stats.total_sessions} total</span>
          </div>
          <table className="admin-table">
            <thead><tr><th>ALIAS</th><th>STATE</th><th>SCORE</th><th>CREATED</th></tr></thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id}>
                  <td>👤 {s.alias}</td>
                  <td><StatusBadge status={s.state === 'completed' ? 'online' : s.state === 'active' ? 'playing' : 'warning'} label={s.state} /></td>
                  <td>{s.score}</td>
                  <td>{new Date(s.created_at).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="admin-stat-card" padding="md">
      <div className="admin-stat-label">{label}</div>
      <div className="admin-stat-value">{value}</div>
    </Card>
  );
}

/* ── Challenges ──────────────────────────────────────────────────── */

function ChallengesTab({ token }: { token: string }) {
  const [challenges, setChallenges] = useState<ChallengeListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    api.adminListChallenges(token, ctrl.signal).then(setChallenges).catch(() => {}).finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [token]);

  if (loading) return <div className="admin-loading">Loading…</div>;

  return (
    <Card className="admin-content-card" padding="md">
      <table className="admin-table">
        <thead><tr><th>TYPE</th><th>DIFFICULTY</th><th>TITLE</th><th>REVISION</th><th>STATUS</th><th>CREATED</th></tr></thead>
        <tbody>
          {challenges.map(c => (
            <tr key={c.id}>
              <td><span className={`admin-challenge-type type-${c.type}`}>{c.type}</span></td>
              <td>{c.difficulty}</td>
              <td>{c.title}</td>
              <td>v{c.revision_number}</td>
              <td><StatusBadge status={c.published ? 'online' : 'error'} label={c.published ? 'Published' : 'Draft'} /></td>
              <td>{new Date(c.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
          {challenges.length === 0 && <tr><td colSpan={6} className="admin-empty">No challenges found.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

/* ── Prizes ──────────────────────────────────────────────────────── */

function PrizesTab({ token }: { token: string }) {
  const [prizes, setPrizes] = useState<PrizeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('active');
  const [showForm, setShowForm] = useState(false);
  const [editingPrize, setEditingPrize] = useState<PrizeListItem | null>(null);
  const [form, setForm] = useState(EMPTY_PRIZE_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [stockModalPrize, setStockModalPrize] = useState<PrizeListItem | null>(null);
  const [stockAdjustment, setStockAdjustment] = useState<number>(0);
  const [stockReason, setStockReason] = useState('');
  const [stockSaving, setStockSaving] = useState(false);
  const [deleteModalPrize, setDeleteModalPrize] = useState<PrizeListItem | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [showWheelPreview, setShowWheelPreview] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    api.adminListPrizes(token).then(setPrizes).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { reload(); }, [reload]);

  const filteredPrizes = useMemo(() => {
    if (filter === 'active') return prizes.filter(p => p.active && !p.archived);
    if (filter === 'archived') return prizes.filter(p => p.archived);
    return prizes;
  }, [prizes, filter]);

  const wheelPrizes: Prize[] = useMemo(() =>
    prizes
      .filter(p => p.active && !p.archived && p.weight > 0 && p.available > 0)
      .slice(0, 12)
      .map(p => ({
        id: p.id,
        label: p.name,
        shortLabel: p.short_label,
        description: p.description,
        icon: p.icon,
        image_url: p.image_url,
        weight: p.weight,
        available: p.available,
        active: p.active,
        color: p.color || '#20E3FF',
      })),
  [prizes]);

  const openAddForm = () => {
    setEditingPrize(null);
    setForm({ ...EMPTY_PRIZE_FORM });
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (p: PrizeListItem) => {
    setEditingPrize(p);
    setForm({
      name: p.name,
      short_label: p.short_label,
      icon: p.icon,
      description: p.description,
      weight: p.weight,
      initial_stock: 0,
      display_order: p.display_order,
      color: p.color || '#20E3FF',
      active: p.active,
    });
    setFormError(null);
    setShowForm(true);
  };

  const handleSaveForm = async () => {
    setFormError(null);
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    if (!form.short_label.trim()) { setFormError('Short label is required.'); return; }
    if (form.weight < 1) { setFormError('Weight must be at least 1.'); return; }
    setSaving(true);
    try {
      if (editingPrize) {
        await api.adminUpdatePrize(token, editingPrize.id, {
          name: form.name,
          short_label: form.short_label,
          icon: form.icon,
          description: form.description,
          weight: form.weight,
          display_order: form.display_order,
          color: form.color,
          active: form.active,
        });
      } else {
        await api.adminCreatePrize(token, {
          name: form.name,
          short_label: form.short_label,
          icon: form.icon,
          description: form.description,
          weight: form.weight,
          initial_stock: form.initial_stock,
          display_order: form.display_order,
          color: form.color,
          active: form.active,
        });
      }
      setShowForm(false);
      setEditingPrize(null);
      reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleStockAdjust = async () => {
    if (!stockModalPrize || stockAdjustment === 0 || !stockReason.trim()) return;
    setStockSaving(true);
    try {
      await api.adminAdjustStock(token, stockModalPrize.id, stockAdjustment, stockReason.trim());
      setStockModalPrize(null);
      setStockAdjustment(0);
      setStockReason('');
      reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setStockSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModalPrize) return;
    setDeleteSaving(true);
    try {
      await api.adminArchivePrize(token, deleteModalPrize.id, `Deleted by admin`);
      setDeleteModalPrize(null);
      reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDeleteSaving(false);
    }
  };

  if (loading) return <div className="admin-loading">Loading…</div>;

  return (
    <div className="admin-content">
      <div className="admin-filter-row">
        <button className={`admin-btn ${filter === 'all' ? 'primary' : ''}`} onClick={() => setFilter('all')}>All</button>
        <button className={`admin-btn ${filter === 'active' ? 'primary' : ''}`} onClick={() => setFilter('active')}>Active</button>
        <button className={`admin-btn ${filter === 'archived' ? 'primary' : ''}`} onClick={() => setFilter('archived')}>Archived</button>
        <button className="admin-btn primary" onClick={openAddForm}>+ Add Prize</button>
        <button className="admin-btn" onClick={() => setShowWheelPreview(true)}>Preview Wheel</button>
      </div>
      <Card className="admin-content-card" padding="md">
        <table className="admin-table">
          <thead><tr><th>NAME</th><th>WEIGHT</th><th>ODDS</th><th>STOCK</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
          <tbody>
            {filteredPrizes.map(p => (
              <tr key={p.id}>
                <td>{p.icon} {p.name}</td>
                <td>{p.weight}</td>
                <td>{p.odds_percent.toFixed(1)}%</td>
                <td>
                  {p.available}
                  <button className="admin-btn-sm" style={{ marginLeft: 8 }} onClick={() => { setStockModalPrize(p); setStockAdjustment(0); setStockReason(''); }}>
                    Adjust
                  </button>
                </td>
                <td><StatusBadge status={p.active && !p.archived ? 'online' : 'error'} label={p.archived ? 'Archived' : p.active ? 'Active' : 'Inactive'} /></td>
                <td>
                  <div className="admin-edit-actions">
                    <button className="admin-btn-sm" onClick={() => openEditForm(p)}>Edit</button>
                    {!p.archived && (
                      <button className="admin-btn-sm danger" onClick={() => setDeleteModalPrize(p)}>
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredPrizes.length === 0 && <tr><td colSpan={6} className="admin-empty">No prizes found.</td></tr>}
          </tbody>
        </table>
      </Card>

      {/* Add/Edit Prize Modal */}
      <Modal open={showForm} title={editingPrize ? 'Edit Prize' : 'Add Prize'} onClose={() => { setShowForm(false); setEditingPrize(null); }}>
        {formError && <div className="admin-error" role="alert">{formError}</div>}
        <div className="admin-form-grid">
          <label className="admin-login-label">Name
            <input className="admin-login-input" type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="admin-login-label">Short Label
            <input className="admin-login-input" type="text" value={form.short_label} onChange={e => setForm({ ...form, short_label: e.target.value })} />
          </label>
          <label className="admin-login-label">Prize icon
            <div className="admin-icon-select-wrap">
              <span className="admin-icon-select-preview" aria-hidden="true">{form.icon}</span>
              <select
                className="admin-icon-select"
                value={PRIZE_ICONS.some(ic => ic.value === form.icon) ? form.icon : '__custom__'}
                onChange={e => {
                  if (e.target.value !== '__custom__') {
                    setForm({ ...form, icon: e.target.value });
                  }
                }}
              >
                {PRIZE_ICONS.map(ic => (
                  <option key={ic.value} value={ic.value}>{ic.value} {ic.label}</option>
                ))}
                {!PRIZE_ICONS.some(ic => ic.value === form.icon) && form.icon && (
                  <option value="__custom__">{form.icon} Current custom icon</option>
                )}
              </select>
            </div>
          </label>
          <label className="admin-login-label">Description
            <input className="admin-login-input" type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </label>
          <label className="admin-login-label">Weight
            <input className="admin-login-input" type="number" min={1} value={form.weight} onChange={e => setForm({ ...form, weight: Number(e.target.value) })} />
          </label>
          {!editingPrize && (
            <label className="admin-login-label">Initial Stock
              <input className="admin-login-input" type="number" min={0} value={form.initial_stock} onChange={e => setForm({ ...form, initial_stock: Number(e.target.value) })} />
            </label>
          )}
          <label className="admin-login-label">Display Order
            <input className="admin-login-input" type="number" value={form.display_order} onChange={e => setForm({ ...form, display_order: Number(e.target.value) })} />
          </label>
          <label className="admin-login-label">Color
            <input className="admin-login-input" type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} />
          </label>
          <label className="admin-toggle">
            <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
            <span>Active</span>
          </label>
        </div>
        <div className="admin-edit-actions" style={{ marginTop: 16 }}>
          <button className="admin-btn primary" onClick={handleSaveForm} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button className="admin-btn" onClick={() => { setShowForm(false); setEditingPrize(null); }}>Cancel</button>
        </div>
      </Modal>

      {/* Stock Adjustment Modal */}
      <Modal open={!!stockModalPrize} title="Adjust Stock" onClose={() => setStockModalPrize(null)}>
        {stockModalPrize && (
          <div>
            <p style={{ color: 'var(--text-primary)', marginBottom: 12 }}>
              {stockModalPrize.icon} {stockModalPrize.name} — Current: {stockModalPrize.available}
            </p>
            <label className="admin-login-label">Adjustment (+/-)
              <input className="admin-login-input" type="number" value={stockAdjustment} onChange={e => setStockAdjustment(Number(e.target.value))} />
            </label>
            <label className="admin-login-label">Reason (required)
              <input className="admin-login-input" type="text" value={stockReason} onChange={e => setStockReason(e.target.value)} placeholder="e.g. Restocked from warehouse" />
            </label>
            <div className="admin-edit-actions" style={{ marginTop: 12 }}>
              <button className="admin-btn primary" onClick={handleStockAdjust} disabled={stockSaving || stockAdjustment === 0 || !stockReason.trim()}>
                {stockSaving ? 'Saving…' : 'Apply'}
              </button>
              <button className="admin-btn" onClick={() => setStockModalPrize(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!deleteModalPrize}
        title="Delete Prize"
        onConfirm={handleDelete}
        onCancel={() => setDeleteModalPrize(null)}
        confirmLabel={deleteSaving ? 'Deleting…' : 'Delete'}
        variant="danger"
      >
        {deleteModalPrize && (
          <p style={{ color: 'var(--text-primary)' }}>
            Delete <strong>{deleteModalPrize.icon} {deleteModalPrize.name}</strong>? It will be removed from the prize list and future wheel spins. Existing awards and claims will be preserved.
          </p>
        )}
      </ConfirmModal>

      {/* Wheel Preview Modal */}
      <WheelPreviewModal
        open={showWheelPreview}
        onClose={() => setShowWheelPreview(false)}
        prizes={wheelPrizes}
      />
    </div>
  );
}

/* ── Wheel Preview Modal ────────────────────────────────────────── */

function WheelPreviewModal({ open, onClose, prizes }: { open: boolean; onClose: () => void; prizes: Prize[] }) {
  const [spinning, setSpinning] = useState(false);
  const [targetSegment, setTargetSegment] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const completedRef = useRef(false);

  const handleSpin = () => {
    if (prizes.length === 0 || spinning) return;
    const weights = prizes.map(p => p.weight);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) { idx = i; break; }
    }
    setTargetSegment(idx);
    setSpinning(true);
    setShowResult(false);
    completedRef.current = false;
  };

  const handleSpinComplete = useCallback(() => {
    setSpinning(false);
    if (completedRef.current) return;
    completedRef.current = true;
    setShowResult(true);
  }, []);

  const resultPrize = showResult ? prizes[targetSegment] : null;

  return (
    <>
      <Modal open={open} title="Wheel Preview" onClose={onClose}>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <p style={{ color: '#ff6b6b', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            PREVIEW — No prize awarded. Inventory is unchanged.
          </p>
          {prizes.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', padding: 40 }}>No eligible prizes to display.</div>
          ) : prizes.length === 1 ? (
            <div style={{ color: 'var(--text-secondary)', padding: 20, fontSize: 14 }}>
              Only 1 eligible prize — full circle. Spin is deterministic.
            </div>
          ) : null}
          {prizes.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <div style={{ width: 320, height: 320 }}>
                <Wheel
                  prizes={prizes}
                  diameter={320}
                  spinning={spinning}
                  targetSegment={targetSegment}
                  onSpinComplete={handleSpinComplete}
                  hubLabel="PREVIEW"
                  hubSubLabel=""
                />
              </div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <SoundToggle />
            <AnimationToggle />
            <button className="admin-btn primary" onClick={handleSpin} disabled={spinning || prizes.length === 0}>
              {spinning ? 'Spinning…' : 'Spin Preview'}
            </button>
          </div>
          {prizes.length > 12 && (
            <p style={{ color: '#ff6b6b', fontSize: 12, marginTop: 8 }}>
              Note: Only the first 12 eligible prizes are shown. Total eligible: {prizes.length}.
            </p>
          )}
        </div>
      </Modal>

      {/* Preview result modal — separate dialog above the preview window */}
      <WheelResultModal
        open={showResult && !!resultPrize}
        onClose={() => setShowResult(false)}
        icon={resultPrize?.icon || '🎁'}
        prizeName={resultPrize?.shortLabel || resultPrize?.label || 'Unknown'}
        live={false}
      />
    </>
  );
}

/* ── Sessions ────────────────────────────────────────────────────── */

function SessionsTab({ token }: { token: string }) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.adminListSessions(token, search || undefined, stateFilter || undefined).then(setSessions).catch(() => {}).finally(() => setLoading(false));
  }, [token, search, stateFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="admin-content">
      <div className="admin-filter-row">
        <input className="admin-filter-input" type="text" placeholder="Search alias or ID…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="admin-filter-select" value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
          <option value="">All states</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="expired">Expired</option>
          <option value="abandoned">Abandoned</option>
        </select>
      </div>
      <Card className="admin-content-card" padding="md">
        {loading ? <div className="admin-loading">Loading…</div> : (
          <table className="admin-table">
            <thead><tr><th>ALIAS</th><th>STATE</th><th>SCORE</th><th>SOLVED</th><th>TIME</th><th>PRIZE</th><th>CLAIM CODE</th><th>CONSENT</th><th>CREATED</th></tr></thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id}>
                  <td>👤 {s.alias}</td>
                  <td><StatusBadge status={s.state === 'completed' ? 'online' : s.state === 'active' ? 'playing' : 'warning'} label={s.state} /></td>
                  <td>{s.score}</td>
                  <td>{s.solved_count}/3</td>
                  <td>{formatMs(s.elapsed_ms)}</td>
                  <td>{s.award_prize_name || '—'}</td>
                  <td>
                    {s.claim_code ? (
                      <span className="admin-claim-cell">
                        <code className="admin-claim-code">{s.claim_code}</code>
                        <button
                          className="admin-claim-copy"
                          onClick={() => navigator.clipboard.writeText(s.claim_code!)}
                          title="Copy claim code"
                        >📋</button>
                        <span className={`admin-claim-status claim-${s.award_status || 'pending'}`}>{s.award_status || 'pending'}</span>
                      </span>
                    ) : s.award_prize_name ? (
                      <span className="admin-claim-unavailable">Code unavailable</span>
                    ) : '—'}
                  </td>
                  <td>{s.publish_consent ? '✓' : '✗'}</td>
                  <td>{new Date(s.created_at).toLocaleTimeString()}</td>
                </tr>
              ))}
              {sessions.length === 0 && <tr><td colSpan={9} className="admin-empty">No sessions found.</td></tr>}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* ── Claims ──────────────────────────────────────────────────────── */

function ClaimsTab({ token }: { token: string }) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<ClaimLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [redeemResult, setRedeemResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleLookup = async () => {
    if (!code.trim()) return;
    setError(null);
    setResult(null);
    setRedeemResult(null);
    setLoading(true);
    try {
      const r = await api.staffLookupClaim(token, code.trim());
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRedeem = async () => {
    if (!result) return;
    setRedeemResult(null);
    try {
      const r = await api.staffRedeemClaim(token, result.claimCode);
      setRedeemResult(r);
      if (r.success) {
        const updated = await api.staffLookupClaim(token, result.claimCode);
        setResult(updated);
      }
    } catch (e) {
      setRedeemResult({ success: false, message: (e as Error).message });
    }
  };

  return (
    <div className="admin-content">
      <Card className="admin-content-card" padding="md">
        <h2 className="admin-card-title">Claim Lookup</h2>
        <div className="admin-claim-form">
          <input className="admin-claim-input" type="text" placeholder="XXXX-XXXX-XXXX" value={code} onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && handleLookup()} />
          <button className="admin-btn primary" onClick={handleLookup} disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
        </div>
        {error && <div className="admin-error" role="alert">{error}</div>}
        {result && (
          <div className="admin-claim-result">
            <div className="admin-claim-header">
              <span className="admin-claim-icon">{result.prizeIcon}</span>
              <div>
                <h3>{result.prizeName}</h3>
                <p>Player: {result.playerAlias}</p>
              </div>
            </div>
            <div className="admin-claim-code">{result.claimCode}</div>
            <div>Status: <span className={`admin-status-${result.status}`}>{result.status}</span></div>
            <p className="admin-claim-date">Awarded: {new Date(result.awardedAt).toLocaleString()}</p>
            {result.redeemedAt && <p className="admin-claim-date">Redeemed: {new Date(result.redeemedAt).toLocaleString()}</p>}
            {result.status === 'awarded' && (
              <button className="admin-btn primary full-width" onClick={handleRedeem}>Confirm handover</button>
            )}
            {redeemResult && (
              <div className={`admin-redeem-result ${redeemResult.success ? 'success' : 'error'}`} role="status">
                {redeemResult.message}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── Leaderboard (Admin) ─────────────────────────────────────────── */

function LeaderboardTab({ token }: { token: string }) {
  const [entries, setEntries] = useState<LeaderboardAdminEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    api.adminGetLeaderboard(token).then(setEntries).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { reload(); }, [reload]);

  const toggleHide = async (entry: LeaderboardAdminEntry) => {
    const reason = entry.is_hidden ? 'Unhidden by admin' : 'Hidden by admin';
    await api.adminModerateLeaderboard(token, entry.session_id, !entry.is_hidden, reason);
    reload();
  };

  if (loading) return <div className="admin-loading">Loading…</div>;

  return (
    <Card className="admin-content-card" padding="md">
      <table className="admin-table">
        <thead><tr><th>RANK</th><th>ALIAS</th><th>SCORE</th><th>SOLVED</th><th>TIME</th><th>CAPTURED</th><th>VISIBLE</th><th>ACTIONS</th></tr></thead>
        <tbody>
          {entries.map(e => (
            <tr key={e.session_id} className={e.is_hidden ? 'admin-row-hidden' : ''}>
              <td>{e.rank}</td>
              <td>👤 {e.alias}</td>
              <td>{e.score}</td>
              <td>{e.solved_count}/3</td>
              <td>{formatMs(e.elapsed_ms)}</td>
              <td>{e.captured ? '✓' : '✗'}</td>
              <td><StatusBadge status={e.is_hidden ? 'error' : 'online'} label={e.is_hidden ? 'Hidden' : 'Visible'} /></td>
              <td>
                <button className={`admin-btn-sm ${e.is_hidden ? 'primary' : 'danger'}`} onClick={() => toggleHide(e)}>
                  {e.is_hidden ? 'Unhide' : 'Hide'}
                </button>
              </td>
            </tr>
          ))}
          {entries.length === 0 && <tr><td colSpan={8} className="admin-empty">No leaderboard entries.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

/* ── Audit ───────────────────────────────────────────────────────── */

function AuditTab({ token }: { token: string }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminListAudit(token).then(setLogs).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="admin-loading">Loading…</div>;

  return (
    <Card className="admin-content-card" padding="md">
      <table className="admin-table">
        <thead><tr><th>TIME</th><th>ACTOR</th><th>ACTION</th><th>ENTITY</th><th>DETAILS</th></tr></thead>
        <tbody>
          {logs.map(l => (
            <tr key={l.id}>
              <td>{new Date(l.created_at).toLocaleString()}</td>
              <td>{l.actor_type}:{l.actor_id?.slice(0, 8) || '—'}</td>
              <td><span className="admin-audit-action">{l.action}</span></td>
              <td>{l.entity_type}{l.entity_id ? ` (${l.entity_id.slice(0, 8)})` : ''}</td>
              <td className="admin-audit-details">{l.details ? JSON.stringify(l.details).slice(0, 80) : '—'}</td>
            </tr>
          ))}
          {logs.length === 0 && <tr><td colSpan={5} className="admin-empty">No audit entries.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

/* ── Staff ───────────────────────────────────────────────────────── */

function StaffTab({ token }: { token: string }) {
  const [staff, setStaff] = useState<StaffListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffListItem | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('staff');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetModalUser, setResetModalUser] = useState<StaffListItem | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [deleteModalUser, setDeleteModalUser] = useState<StaffListItem | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteSaving, setDeleteSaving] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    api.adminListStaff(token).then(setStaff).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { reload(); }, [reload]);

  // Get current user info for self-deactivation check
  useEffect(() => {
    // The token is passed in; we need to identify the current user.
    // We'll infer from the staff list match or use the username from login.
    // For now, we detect the current user by checking last_login_at is very recent.
  }, [staff]);

  const openAddForm = () => {
    setEditingStaff(null);
    setFormUsername('');
    setFormDisplayName('');
    setFormPassword('');
    setFormRole('staff');
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (s: StaffListItem) => {
    setEditingStaff(s);
    setFormUsername(s.username);
    setFormDisplayName(s.display_name || '');
    setFormPassword('');
    setFormRole(s.role);
    setFormError(null);
    setShowForm(true);
  };

  const handleSaveForm = async () => {
    setFormError(null);
    if (editingStaff) {
      if (!formDisplayName.trim()) { setFormError('Display name is required.'); return; }
      setSaving(true);
      try {
        await api.adminUpdateStaff(token, editingStaff.id, {
          display_name: formDisplayName.trim(),
          role: formRole,
        });
        setShowForm(false);
        setEditingStaff(null);
        reload();
      } catch (e) {
        setFormError((e as Error).message);
      } finally {
        setSaving(false);
      }
    } else {
      if (!formUsername.trim()) { setFormError('Username is required.'); return; }
      if (!formPassword.trim()) { setFormError('Password is required.'); return; }
      if (formPassword.length < 6) { setFormError('Password must be at least 6 characters.'); return; }
      setSaving(true);
      try {
        await api.adminCreateStaff(token, {
          username: formUsername.trim(),
          display_name: formDisplayName.trim() || undefined,
          password: formPassword,
          role: formRole,
        });
        setShowForm(false);
        setEditingStaff(null);
        reload();
      } catch (e) {
        setFormError((e as Error).message);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleResetPassword = async () => {
    if (!resetModalUser || !resetPassword.trim()) return;
    if (resetPassword.length < 6) { alert('Password must be at least 6 characters.'); return; }
    setResetSaving(true);
    try {
      await api.adminResetPassword(token, resetModalUser.id, resetPassword.trim());
      setResetModalUser(null);
      setResetPassword('');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setResetSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModalUser || !deleteReason.trim()) return;
    setDeleteSaving(true);
    try {
      await api.adminDeleteStaff(token, deleteModalUser.id, deleteReason.trim());
      setDeleteModalUser(null);
      setDeleteReason('');
      reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDeleteSaving(false);
    }
  };

  const handleToggleActive = async (s: StaffListItem) => {
    const systemAdmins = staff.filter(st => st.role === 'system_admin' && st.active);
    if (s.role === 'system_admin' && s.active && systemAdmins.length <= 1) {
      alert('Cannot deactivate the last system_admin account.');
      return;
    }
    try {
      await api.adminUpdateStaff(token, s.id, { active: !s.active });
      reload();
    } catch (e) {
      alert((e as Error).message);
    }
  };


  if (loading) return <div className="admin-loading">Loading…</div>;

  return (
    <div className="admin-content">
      <div className="admin-filter-row">
        <button className="admin-btn primary" onClick={openAddForm}>+ Add Staff</button>
      </div>
      <Card className="admin-content-card" padding="md">
        <table className="admin-table">
          <thead><tr><th>USERNAME</th><th>DISPLAY NAME</th><th>ROLE</th><th>ACTIVE</th><th>CREATED</th><th>LAST LOGIN</th><th>ACTIONS</th></tr></thead>
          <tbody>
            {staff.map(s => (
              <tr key={s.id}>
                <td>{s.username}</td>
                <td>{s.display_name || '—'}</td>
                <td><span className={`admin-role role-${s.role}`}>{s.role}</span></td>
                <td><StatusBadge status={s.active ? 'online' : 'error'} label={s.active ? 'Active' : 'Inactive'} /></td>
                <td>{new Date(s.created_at).toLocaleDateString()}</td>
                <td>{s.last_login_at ? new Date(s.last_login_at).toLocaleString() : 'Never'}</td>
                <td>
                  <div className="admin-edit-actions">
                    <button className="admin-btn-sm" onClick={() => openEditForm(s)}>Edit</button>
                    <button className="admin-btn-sm" onClick={() => { setResetModalUser(s); setResetPassword(''); }}>Reset Password</button>
                    <button
                      className={`admin-btn-sm ${s.active ? 'danger' : 'primary'}`}
                      onClick={() => handleToggleActive(s)}
                    >
                      {s.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button className="admin-btn-sm danger" onClick={() => { setDeleteModalUser(s); setDeleteReason(''); }}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {staff.length === 0 && <tr><td colSpan={7} className="admin-empty">No staff users.</td></tr>}
          </tbody>
        </table>
      </Card>

      {/* Add/Edit Staff Modal */}
      <Modal open={showForm} title={editingStaff ? 'Edit Staff' : 'Add Staff'} onClose={() => { setShowForm(false); setEditingStaff(null); }}>
        {formError && <div className="admin-error" role="alert">{formError}</div>}
        <div className="admin-form-grid">
          {!editingStaff && (
            <label className="admin-login-label">Username
              <input className="admin-login-input" type="text" value={formUsername} onChange={e => setFormUsername(e.target.value)} autoComplete="off" />
            </label>
          )}
          <label className="admin-login-label">Display Name
            <input className="admin-login-input" type="text" value={formDisplayName} onChange={e => setFormDisplayName(e.target.value)} />
          </label>
          {!editingStaff && (
            <label className="admin-login-label">Password
              <input className="admin-login-input" type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)} autoComplete="new-password" />
            </label>
          )}
          <label className="admin-login-label">Role
            <select className="admin-login-input" value={formRole} onChange={e => setFormRole(e.target.value)}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
              <option value="system_admin">System Admin</option>
            </select>
          </label>
          {formRole && (
            <div className="admin-role-summary">
              <span className="admin-role-summary-label">Permissions:</span> {ROLE_DESCRIPTIONS[formRole]}
            </div>
          )}
        </div>
        <div className="admin-edit-actions" style={{ marginTop: 16 }}>
          <button className="admin-btn primary" onClick={handleSaveForm} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button className="admin-btn" onClick={() => { setShowForm(false); setEditingStaff(null); }}>Cancel</button>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={!!resetModalUser} title="Reset Password" onClose={() => setResetModalUser(null)}>
        {resetModalUser && (
          <div>
            <p style={{ color: 'var(--text-primary)', marginBottom: 12 }}>
              Reset password for <strong>{resetModalUser.username}</strong>
            </p>
            <label className="admin-login-label">New Password
              <input className="admin-login-input" type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} autoComplete="new-password" />
            </label>
            <div className="admin-edit-actions" style={{ marginTop: 12 }}>
              <button className="admin-btn primary" onClick={handleResetPassword} disabled={resetSaving || !resetPassword.trim()}>
                {resetSaving ? 'Saving…' : 'Reset Password'}
              </button>
              <button className="admin-btn" onClick={() => setResetModalUser(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!deleteModalUser}
        title="Delete Staff Account"
        onConfirm={handleDelete}
        onCancel={() => setDeleteModalUser(null)}
        confirmLabel={deleteSaving ? 'Deleting…' : 'Delete'}
        variant="danger"
      >
        {deleteModalUser && (
          <div>
            <p style={{ color: 'var(--text-primary)' }}>
              Are you sure you want to permanently delete <strong>{deleteModalUser.username}</strong> ({deleteModalUser.role})?
              This action cannot be undone.
            </p>
            <label className="admin-login-label">Reason (required)
              <input className="admin-login-input" type="text" value={deleteReason} onChange={e => setDeleteReason(e.target.value)} placeholder="e.g. Account no longer needed" />
            </label>
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}

/* ── Settings ────────────────────────────────────────────────────── */

function SettingsTab({ token, userRole }: { token: string; userRole: string }) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<PlayerDataSummary | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleteResult, setDeleteResult] = useState<{ counts: PlayerDataSummary; awards_anonymized: number } | null>(null);

  const isSystemAdmin = userRole === 'system_admin';

  useEffect(() => {
    const ctrl = new AbortController();
    api.adminGetEvent(token, ctrl.signal)
      .then(setEvent)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [token]);

  const loadSummary = useCallback(async () => {
    try {
      const s = await api.adminPlayerDataSummary(token);
      setSummary(s);
    } catch (e) {
      setResetError((e as Error).message);
    }
  }, [token]);

  const handleOpenResetModal = useCallback(async () => {
    setShowResetModal(true);
    setResetError(null);
    setResetSuccess(false);
    setConfirmText('');
    setDeleteResult(null);
    await loadSummary();
  }, [loadSummary]);

  const handleDeletePlayerData = useCallback(async () => {
    setResetLoading(true);
    setResetError(null);
    try {
      const result = await api.adminDeletePlayerData(token);
      setDeleteResult(result);
      setResetSuccess(true);
    } catch (e) {
      setResetError((e as Error).message);
    } finally {
      setResetLoading(false);
    }
  }, [token]);

  if (loading) return <div className="admin-loading">Loading…</div>;

  return (
    <div className="admin-content">
      {error && <div className="admin-error" role="alert">{error}</div>}
      <Card className="admin-content-card" padding="md">
        <div className="admin-section-header"><span>⚙️</span><h2>Event configuration</h2></div>
        <div className="admin-settings-grid">
          <div className="admin-settings-item">
            <span className="admin-settings-label">Event name</span>
            <span className="admin-settings-value">{event?.name || '—'}</span>
          </div>
          <div className="admin-settings-item">
            <span className="admin-settings-label">Event state</span>
            <span className="admin-settings-value">{event?.state || '—'}</span>
          </div>
          <div className="admin-settings-item">
            <span className="admin-settings-label">Timezone</span>
            <span className="admin-settings-value">{event?.timezone || '—'}</span>
          </div>
          <div className="admin-settings-item">
            <span className="admin-settings-label">Active ruleset</span>
            <span className="admin-settings-value">{event?.active_ruleset_id || 'Default'}</span>
          </div>
          <div className="admin-settings-item">
            <span className="admin-settings-label">Opens at</span>
            <span className="admin-settings-value">{event?.opens_at ? new Date(event.opens_at).toLocaleString() : '—'}</span>
          </div>
          <div className="admin-settings-item">
            <span className="admin-settings-label">Closes at</span>
            <span className="admin-settings-value">{event?.closes_at ? new Date(event.closes_at).toLocaleString() : '—'}</span>
          </div>
          <div className="admin-settings-item">
            <span className="admin-settings-label">System status</span>
            <StatusBadge status="online" label="Operational" />
          </div>
          <div className="admin-settings-item">
            <span className="admin-settings-label">Created</span>
            <span className="admin-settings-value">{event?.created_at ? new Date(event.created_at).toLocaleDateString() : '—'}</span>
          </div>
        </div>
      </Card>

      {isSystemAdmin && (
        <Card className="admin-content-card admin-danger-zone" padding="md">
          <div className="admin-section-header admin-danger-header"><span>⚠️</span><h2>Player data reset</h2></div>
          <p className="admin-danger-description">
            This action permanently deletes <strong>all player data across every event</strong>:
            nicknames, sessions, challenges, attempts, answers, scores, and leaderboard entries.
            Active games will end immediately.
          </p>
          <p className="admin-danger-description">
            Staff accounts, event settings, challenges, prizes, inventory records,
            and administrative audit history are preserved. Redeemed and voided prize
            claims are anonymized as operational history.
          </p>
          <button className="admin-danger-btn" onClick={handleOpenResetModal}>
            Delete all player data
          </button>
        </Card>
      )}

      <Modal open={showResetModal} onClose={() => !resetLoading && setShowResetModal(false)}>
        <div className="admin-confirm-content">
          {!resetSuccess ? (
            <>
              <h2 className="admin-confirm-title">Delete all player data</h2>

              <div className="admin-confirm-info">
                <p>This action applies to <strong>all events</strong> and is irreversible.</p>
              </div>

              {summary && (
                <div className="admin-reset-summary">
                  <h3>Affected data</h3>
                  <table className="admin-reset-table">
                    <tbody>
                      <tr><td>Game sessions</td><td className="admin-reset-count">{summary.sessions}</td></tr>
                      <tr><td>Challenge assignments</td><td className="admin-reset-count">{summary.challenges}</td></tr>
                      <tr><td>Answer attempts</td><td className="admin-reset-count">{summary.attempts}</td></tr>
                      <tr><td>Entitlements</td><td className="admin-reset-count">{summary.entitlements}</td></tr>
                      <tr><td>Awards (total)</td><td className="admin-reset-count">{summary.awards_total}</td></tr>
                    </tbody>
                  </table>

                  {summary.awards_redeemed + summary.awards_voided > 0 && (
                    <div className="admin-reset-note">
                      <strong>{summary.awards_redeemed + summary.awards_voided}</strong> redeemed/voided
                      prize claim(s) will be anonymized (player links removed, prize history preserved).
                    </div>
                  )}
                </div>
              )}

              <div className="admin-reset-warnings">
                <h3>What happens</h3>
                <ul>
                  <li>All active, prepared, completed, expired, and abandoned sessions are deleted.</li>
                  <li>Player nicknames, scores, challenge attempts, and answers are removed.</li>
                  <li>Active games end immediately — players return to the home screen.</li>
                  <li>Staff accounts, prizes, challenges, and event settings are <strong>not</strong> affected.</li>
                  <li>Existing backups are not erased — backup retention still applies.</li>
                </ul>
              </div>

              {resetError && <div className="admin-error" role="alert">{resetError}</div>}

              <div className="admin-confirm-field">
                <label>Type <strong>DELETE PLAYER DATA</strong> to confirm:</label>
                <input
                  className="admin-confirm-input"
                  type="text"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder="DELETE PLAYER DATA"
                  disabled={resetLoading}
                  autoFocus
                />
              </div>

              <div className="admin-confirm-actions">
                <button
                  className="admin-confirm-cancel-btn"
                  onClick={() => setShowResetModal(false)}
                  disabled={resetLoading}
                >
                  Cancel
                </button>
                <button
                  className="admin-danger-btn"
                  disabled={confirmText !== 'DELETE PLAYER DATA' || resetLoading}
                  onClick={handleDeletePlayerData}
                >
                  {resetLoading ? 'Deleting…' : 'Permanently delete player data'}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="admin-confirm-title">Player data deleted</h2>
              <div className="admin-reset-success">
                <p>All player data has been permanently removed.</p>
                {deleteResult && (
                  <table className="admin-reset-table">
                    <tbody>
                      <tr><td>Sessions deleted</td><td className="admin-reset-count">{deleteResult.counts.sessions}</td></tr>
                      <tr><td>Challenges deleted</td><td className="admin-reset-count">{deleteResult.counts.challenges}</td></tr>
                      <tr><td>Attempts deleted</td><td className="admin-reset-count">{deleteResult.counts.attempts}</td></tr>
                      <tr><td>Awards anonymized</td><td className="admin-reset-count">{deleteResult.awards_anonymized}</td></tr>
                    </tbody>
                  </table>
                )}
                <p className="admin-reset-note">
                  An audit entry has been recorded. Staff accounts, prizes, challenges,
                  and settings are unchanged.
                </p>
              </div>
              <div className="admin-confirm-actions">
                <button className="admin-confirm-cancel-btn" onClick={() => setShowResetModal(false)}>
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
