import type {
  AccessibilityMode,
  AdminStats,
  AnalyticsData,
  AuditLogEntry,
  Award,
  Challenge,
  ChallengeListItem,
  ClaimLookup,
  EventDetail,
  EventStatus,
  GameSession,
  LeaderboardAdminEntry,
  LeaderboardEntry,
  Prize,
  PrizeInventoryItem,
  PrizeListItem,
  SessionChallengeState,
  SessionListItem,
  StaffListItem,
  StaffUser,
} from '../types';

const API_BASE = '/api/v1';
const KIOSK_KEY = 'psm-kiosk-credential';
const ACTIVE_SESSION_KEY = 'psm-active-session';

function getKioskCredential(): string {
  return localStorage.getItem(KIOSK_KEY) || 'default-kiosk';
}

export function setKioskCredential(credential: string): void {
  localStorage.setItem(KIOSK_KEY, credential);
}

function requestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function apiFetch(path: string, options: RequestInit = {}, signal?: AbortSignal): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'kiosk-credential': getKioskCredential(),
    'x-request-id': requestId(),
    ...(options.headers as Record<string, string> || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, signal });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      // ignore
    }
    const err = new Error(detail);
    (err as Error & { statusCode?: number }).statusCode = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export interface ApiAnswerResult {
  correct: boolean;
  finished: boolean;
  attemptsRemaining: number;
  score: number;
  feedback: string | null;
  explanation: string | null;
}

export interface ApiCaptureResult {
  captured: boolean;
  score: number;
  qualified: boolean;
  timeBonus: number;
}

export interface ApiResults {
  id: string;
  alias: string;
  state: string;
  score: number;
  solvedCount: number;
  captured: boolean;
  qualified: boolean;
  elapsedMs: number;
  breakdown: {
    challengePoints: number;
    captureBonus: number;
    timeBonus: number;
    deductions: number;
  };
  entitlementId: string | null;
}

function mapSessionChallenge(backend: any): SessionChallengeState {
  return {
    challengeId: backend.id,
    position: backend.position,
    outcome: backend.outcome === 'pending' ? null : backend.outcome,
    attempts: 0,
    hintUsed: backend.hint_used ?? false,
    selectedAnswer: undefined,
    points: 0,
  };
}

function mapChallenge(backend: any): Challenge {
  const type = backend.type;
  const data = backend.data;
  if (type === 'phishing') {
    return {
      id: backend.id,
      position: backend.position,
      type,
      title: backend.title,
      instruction: backend.instruction,
      hint: backend.hint || '',
      data: {
        kind: 'phishing',
        email: data.email,
        evidence: data.evidence.map((e: any) => ({ id: e.id, label: e.label, detail: e.detail })),
      },
    };
  }
  if (type === 'logs') {
    return {
      id: backend.id,
      position: backend.position,
      type,
      title: backend.title,
      instruction: backend.instruction,
      hint: backend.hint || '',
      data: {
        kind: 'logs',
        question: data.question,
        logs: data.logs.map((l: any) => ({ id: l.id, timestamp: l.timestamp, source: l.source, event: l.event, detail: l.detail })),
      },
    };
  }
  return {
    id: backend.id,
    position: backend.position,
    type,
    title: backend.title,
    instruction: backend.instruction,
    hint: backend.hint || '',
    data: {
      kind: 'decode',
      prompt: data.prompt,
      placeholder: data.placeholder,
      tokens: data.tokens,
      binaryLookup: data.binaryLookup,
      substitutionLegend: data.substitutionLegend,
    },
  };
}

function mapSession(backend: any): GameSession {
  return {
    id: backend.id,
    alias: backend.alias,
    consent: true,
    accessibilityMode: backend.accessibility_mode || 'standard',
    state: backend.state,
    preparedAt: backend.prepared_at || null,
    startedAt: backend.started_at,
    expiresAt: backend.expires_at,
    serverNow: backend.server_now,
    challenges: backend.challenges.map(mapSessionChallenge),
    flagCaptured: false,
    flagValue: null,
    score: backend.score,
    breakdown: {
      challengePoints: 0,
      captureBonus: 0,
      timeBonus: 0,
      deductions: 0,
    },
    qualified: backend.qualified,
    qualificationReason: '',
    elapsedMs: backend.elapsed_ms,
  };
}

interface ActiveSessionRecord {
  id: string;
  state: string;
  updatedAt: number;
}

function readActiveSession(): ActiveSessionRecord | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveSessionRecord;
  } catch {
    return null;
  }
}

export const api = {
  setActiveSession(sessionId: string, state: string): void {
    try {
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({ id: sessionId, state, updatedAt: Date.now() }));
    } catch {
      // ignore
    }
  },

  getActiveSession(): ActiveSessionRecord | null {
    return readActiveSession();
  },

  clearActiveSession(): void {
    try {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    } catch {
      // ignore
    }
  },

  async getPublicEvent(signal?: AbortSignal): Promise<EventStatus> {
    const data = await apiFetch('/public/event', {}, signal) as any;
    return {
      name: data.name,
      tagline: 'Capture. Crack. Defend.',
      state: data.open ? 'open' : 'closed',
      durationSeconds: data.duration_seconds,
      playersToday: 0,
      averageScore: 385,
      prizesClaimed: 0,
      challengesSolvedToday: 0,
      prizesWonToday: 0,
      bestTimeMs: data.duration_seconds * 1000,
    };
  },

  async createSession(
    alias: string,
    consent: boolean,
    accessibilityMode: AccessibilityMode,
    forceNew = false,
    signal?: AbortSignal,
  ): Promise<GameSession> {
    const data = await apiFetch('/sessions', {
      method: 'POST',
      body: JSON.stringify({
        alias: alias || undefined,
        publish_consent: consent,
        accessibility_mode: accessibilityMode,
        kiosk_credential: getKioskCredential(),
        force_new: forceNew,
      }),
    }, signal) as any;
    return mapSession(data);
  },

  async getSession(sessionId: string, signal?: AbortSignal): Promise<GameSession | null> {
    const data = await apiFetch(`/sessions/${sessionId}`, {}, signal) as any;
    return mapSession(data);
  },

  async startRound(sessionId: string, signal?: AbortSignal): Promise<GameSession> {
    const data = await apiFetch(`/sessions/${sessionId}/begin`, { method: 'POST' }, signal) as any;
    return mapSession(data);
  },

  async prepare(sessionId: string, signal?: AbortSignal): Promise<GameSession> {
    const data = await apiFetch(`/sessions/${sessionId}/prepare`, { method: 'POST' }, signal) as any;
    return mapSession(data);
  },

  async submitAnswer(sessionId: string, _position: number, answer: unknown, signal?: AbortSignal): Promise<ApiAnswerResult> {
    const data = await apiFetch(`/sessions/${sessionId}/answers`, {
      method: 'POST',
      body: JSON.stringify({ idempotency_key: requestId(), answer }),
    }, signal) as any;
    return {
      correct: data.correct,
      finished: data.finished,
      attemptsRemaining: data.attempts_remaining,
      score: data.score,
      feedback: data.feedback,
      explanation: data.explanation,
    };
  },

  async useHint(sessionId: string, _position: number, signal?: AbortSignal): Promise<GameSession> {
    await apiFetch(`/sessions/${sessionId}/hints`, {
      method: 'POST',
      body: JSON.stringify({ idempotency_key: requestId() }),
    }, signal);
    return this.getSession(sessionId, signal) as Promise<GameSession>;
  },

  async skipChallenge(sessionId: string, _position: number, signal?: AbortSignal): Promise<GameSession> {
    await apiFetch(`/sessions/${sessionId}/skip`, {
      method: 'POST',
      body: JSON.stringify({ idempotency_key: requestId() }),
    }, signal);
    return this.getSession(sessionId, signal) as Promise<GameSession>;
  },

  async captureFlag(sessionId: string, signal?: AbortSignal): Promise<{ session: GameSession; captured: boolean }> {
    const data = await apiFetch(`/sessions/${sessionId}/capture`, {
      method: 'POST',
      body: JSON.stringify({ idempotency_key: requestId() }),
    }, signal) as any;
    const session = await this.getSession(sessionId, signal) as GameSession;
    return { session, captured: data.captured };
  },

  async getResults(sessionId: string, signal?: AbortSignal): Promise<ApiResults> {
    const data = await apiFetch(`/sessions/${sessionId}/results`, {}, signal) as any;
    return {
      id: data.id,
      alias: data.alias,
      state: data.state,
      score: data.score,
      solvedCount: data.solved_count,
      captured: data.captured,
      qualified: data.qualified,
      elapsedMs: data.elapsed_ms,
      breakdown: {
        challengePoints: data.breakdown.challenge_points,
        captureBonus: data.breakdown.capture_bonus,
        timeBonus: data.breakdown.time_bonus,
        deductions: 0,
      },
      entitlementId: data.entitlement_id,
    };
  },

  async abandon(sessionId: string, signal?: AbortSignal): Promise<GameSession> {
    await apiFetch(`/sessions/${sessionId}/abandon`, {
      method: 'POST',
      body: JSON.stringify({ idempotency_key: requestId() }),
    }, signal);
    return this.getSession(sessionId, signal) as Promise<GameSession>;
  },

  async getChallenge(sessionId: string, position: number, signal?: AbortSignal): Promise<Challenge | null> {
    const data = await apiFetch(`/sessions/${sessionId}`, {}, signal) as any;
    const backendChallenge = data.challenges.find((c: any) => c.position === position);
    if (!backendChallenge) return null;
    return mapChallenge(backendChallenge);
  },

  async spin(sessionId: string, signal?: AbortSignal): Promise<{ session: GameSession; award: Award | null }> {
    const data = await apiFetch(`/sessions/${sessionId}/spin`, {
      method: 'POST',
      body: JSON.stringify({}),
    }, signal) as any;
    const session = await this.getSession(sessionId, signal) as GameSession;
    const award = data.award ? {
      prizeId: data.award.prize_id,
      claimCode: data.award.claim_code,
      segmentIndex: data.award.segment_index,
    } : null;
    return { session, award };
  },

  async getAward(sessionId: string, signal?: AbortSignal): Promise<Award | null> {
    const data = await apiFetch(`/sessions/${sessionId}/award`, {}, signal) as any;
    if (!data.award) return null;
    return {
      prizeId: data.award.prize_id,
      claimCode: data.award.claim_code,
      segmentIndex: data.award.segment_index,
    };
  },

  async getPrizes(signal?: AbortSignal): Promise<Prize[]> {
    const data = await apiFetch('/prizes', {}, signal) as any[];
    return data.map((p: any) => ({
      id: p.id,
      label: p.label || p.name || p.shortLabel,
      shortLabel: p.shortLabel,
      description: '',
      icon: p.icon,
      weight: p.weight,
      available: p.available ?? 0,
      active: p.active,
      color: p.color || '#20E3FF',
    }));
  },

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    return [];
  },

  async staffLogin(username: string, password: string, signal?: AbortSignal): Promise<StaffUser> {
    const data = await apiFetch('/staff/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }, signal) as any;
    return { token: data.token, role: data.role, username: data.username };
  },

  async staffLookupClaim(token: string, claimCode: string, signal?: AbortSignal): Promise<ClaimLookup> {
    const data = await apiFetch(`/staff/claims/${encodeURIComponent(claimCode)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    }, signal) as any;
    return {
      awardId: data.award_id,
      claimCode: data.claim_code,
      prizeName: data.prize_name,
      prizeIcon: data.prize_icon,
      status: data.status,
      playerAlias: data.player_alias,
      awardedAt: data.awarded_at,
      redeemedAt: data.redeemed_at,
    };
  },

  async staffRedeemClaim(token: string, claimCode: string, signal?: AbortSignal): Promise<{ success: boolean; message: string }> {
    const data = await apiFetch(`/staff/claims/${encodeURIComponent(claimCode)}/redeem`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    }, signal) as any;
    return { success: data.success, message: data.message };
  },

  async staffOutstandingClaims(token: string, signal?: AbortSignal): Promise<ClaimLookup[]> {
    const data = await apiFetch('/staff/claims/outstanding', {
      headers: { 'Authorization': `Bearer ${token}` },
    }, signal) as any[];
    return data.map((d: any) => ({
      awardId: d.award_id,
      claimCode: d.claim_code,
      prizeName: d.prize_name,
      prizeIcon: d.prize_icon,
      status: d.status,
      playerAlias: d.player_alias,
      awardedAt: d.awarded_at,
      redeemedAt: d.redeemed_at,
    }));
  },

  async staffListPrizes(token: string, signal?: AbortSignal): Promise<PrizeInventoryItem[]> {
    const data = await apiFetch('/staff/prizes', {
      headers: { 'Authorization': `Bearer ${token}` },
    }, signal) as any[];
    return data.map((d: any) => ({
      prizeId: d.prize_id,
      name: d.name,
      shortLabel: d.short_label,
      icon: d.icon,
      weight: d.weight,
      active: d.active,
      color: d.color,
      stockReceived: d.stock_received,
      stockReserved: d.stock_reserved,
      stockRedeemed: d.stock_redeemed,
      available: d.available,
    }));
  },

  async adminLogin(username: string, password: string, signal?: AbortSignal): Promise<StaffUser> {
    const data = await apiFetch('/staff/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }, signal) as any;
    return { token: data.token, role: data.role, username: data.username };
  },

  async adminGetStats(token: string, signal?: AbortSignal): Promise<AdminStats> {
    return apiFetch('/admin/stats', { headers: { Authorization: `Bearer ${token}` } }, signal) as Promise<AdminStats>;
  },

  async adminListSessions(token: string, search?: string, state?: string, limit = 50, offset = 0, signal?: AbortSignal): Promise<SessionListItem[]> {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (state) params.set('state', state);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    return apiFetch(`/admin/sessions?${params}`, { headers: { Authorization: `Bearer ${token}` } }, signal) as Promise<SessionListItem[]>;
  },

  async adminListChallenges(token: string, signal?: AbortSignal): Promise<ChallengeListItem[]> {
    return apiFetch('/admin/challenges', { headers: { Authorization: `Bearer ${token}` } }, signal) as Promise<ChallengeListItem[]>;
  },

  async adminListPrizes(token: string, signal?: AbortSignal): Promise<PrizeListItem[]> {
    return apiFetch('/admin/prizes', { headers: { Authorization: `Bearer ${token}` } }, signal) as Promise<PrizeListItem[]>;
  },

  async adminUpdatePrize(token: string, prizeId: string, data: {
    name?: string;
    short_label?: string;
    icon?: string;
    description?: string;
    image_url?: string;
    weight?: number;
    active?: boolean;
    display_order?: number;
    color?: string;
  }, signal?: AbortSignal): Promise<PrizeListItem> {
    return apiFetch(`/admin/prizes/${prizeId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }, signal) as Promise<PrizeListItem>;
  },

  async adminAdjustStock(token: string, prizeId: string, adjustment: number, reason: string, signal?: AbortSignal): Promise<PrizeListItem> {
    return apiFetch(`/admin/prizes/${prizeId}/adjust`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ adjustment, reason }),
    }, signal) as Promise<PrizeListItem>;
  },

  async adminGetLeaderboard(token: string, signal?: AbortSignal): Promise<LeaderboardAdminEntry[]> {
    return apiFetch('/admin/leaderboard', { headers: { Authorization: `Bearer ${token}` } }, signal) as Promise<LeaderboardAdminEntry[]>;
  },

  async adminModerateLeaderboard(token: string, sessionId: string, hide: boolean, reason: string, signal?: AbortSignal): Promise<void> {
    await apiFetch(`/admin/leaderboard/${sessionId}/moderate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ hide, reason }),
    }, signal);
  },

  async adminGetAnalytics(token: string, signal?: AbortSignal): Promise<AnalyticsData> {
    return apiFetch('/admin/analytics', { headers: { Authorization: `Bearer ${token}` } }, signal) as Promise<AnalyticsData>;
  },

  async adminExportAnalytics(token: string, signal?: AbortSignal): Promise<Blob> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    const res = await fetch(`${API_BASE}/admin/analytics/export`, { headers, signal });
    if (!res.ok) throw new Error('Export failed');
    return res.blob();
  },

  async adminListAudit(token: string, limit = 100, offset = 0, signal?: AbortSignal): Promise<AuditLogEntry[]> {
    return apiFetch(`/admin/audit?limit=${limit}&offset=${offset}`, { headers: { Authorization: `Bearer ${token}` } }, signal) as Promise<AuditLogEntry[]>;
  },

  async adminListStaff(token: string, signal?: AbortSignal): Promise<StaffListItem[]> {
    return apiFetch('/admin/users', { headers: { Authorization: `Bearer ${token}` } }, signal) as Promise<StaffListItem[]>;
  },

  async adminUpdateStaff(token: string, userId: string, data: {
    role?: string;
    active?: boolean;
    display_name?: string;
  }, signal?: AbortSignal): Promise<StaffListItem> {
    return apiFetch(`/admin/users/${userId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }, signal) as Promise<StaffListItem>;
  },

  async adminGetEvent(token: string, signal?: AbortSignal): Promise<EventDetail> {
    return apiFetch('/admin/events/current', { headers: { Authorization: `Bearer ${token}` } }, signal) as Promise<EventDetail>;
  },

  async adminCreateStaff(token: string, data: {
    username: string;
    display_name?: string;
    password: string;
    role: string;
  }, signal?: AbortSignal): Promise<StaffListItem> {
    return apiFetch('/admin/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }, signal) as Promise<StaffListItem>;
  },

  async adminUpdateStaff(token: string, userId: string, data: {
    display_name?: string;
    role?: string;
    active?: boolean;
  }, signal?: AbortSignal): Promise<StaffListItem> {
    return apiFetch(`/admin/users/${userId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }, signal) as Promise<StaffListItem>;
  },

  async getLeaderboardReal(): Promise<LeaderboardEntry[]> {
    const data = await apiFetch('/leaderboard', {}) as any;
    return (data.entries || []).map((e: any) => ({
      rank: e.rank,
      nickname: e.nickname,
      score: e.score,
      solvedCount: e.solved_count,
      elapsedMs: e.elapsed_ms,
      isCurrentPlayer: false,
    }));
  },

  async adminCreatePrize(token: string, data: {
    name: string;
    short_label: string;
    icon: string;
    description?: string;
    image_url?: string;
    weight: number;
    active?: boolean;
    display_order?: number;
    color?: string;
    initial_stock?: number;
  }, signal?: AbortSignal): Promise<PrizeListItem> {
    return apiFetch('/admin/prizes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }, signal) as Promise<PrizeListItem>;
  },

  async adminArchivePrize(token: string, prizeId: string, reason: string, signal?: AbortSignal): Promise<void> {
    await apiFetch(`/admin/prizes/${prizeId}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason }),
    }, signal);
  },

  async adminResetPassword(token: string, userId: string, newPassword: string, signal?: AbortSignal): Promise<void> {
    await apiFetch(`/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ new_password: newPassword }),
    }, signal);
  },

  async adminDeleteStaff(token: string, userId: string, reason: string, signal?: AbortSignal): Promise<void> {
    await apiFetch(`/admin/users/${userId}/delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason }),
    }, signal);
  },

  async adminPlayerDataSummary(token: string, signal?: AbortSignal): Promise<PlayerDataSummary> {
    return apiFetch('/admin/player-data/summary', {
      headers: { Authorization: `Bearer ${token}` },
    }, signal) as Promise<PlayerDataSummary>;
  },

  async adminDeletePlayerData(token: string, signal?: AbortSignal): Promise<DeletePlayerDataResult> {
    return apiFetch('/admin/player-data', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ confirmation: 'DELETE PLAYER DATA' }),
    }, signal) as Promise<DeletePlayerDataResult>;
  },

  resetForNextPlayer(): void {
    this.clearActiveSession();
  },
};
