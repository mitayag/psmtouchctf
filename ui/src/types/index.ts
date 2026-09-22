export type AccessibilityMode = 'standard' | 'extended-time' | 'reduced-motion';

export type ChallengeType = 'phishing' | 'logs' | 'decode';

export type ChallengeOutcome = 'solved' | 'failed' | 'skipped';

export interface Challenge {
  id: string;
  position: number;
  type: ChallengeType;
  title: string;
  instruction: string;
  hint: string;
  explanation?: string;
  data: PhishingChallengeData | LogsChallengeData | DecodeChallengeData;
}

export interface PhishingEvidence {
  id: string;
  label: string;
  detail: string;
}

export interface PhishingChallengeData {
  kind: 'phishing';
  email: {
    from: string;
    to: string;
    subject: string;
    body: string;
    attachment?: { name: string; size: string };
  };
  evidence: PhishingEvidence[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  source: string;
  event: string;
  detail: string;
}

export interface LogsChallengeData {
  kind: 'logs';
  logs: LogEntry[];
  question: string;
}

export interface DecodeToken {
  id: string;
  value: string;
}

export interface DecodeChallengeData {
  kind: 'decode';
  prompt: string;
  tokens: DecodeToken[];
  placeholder: string;
  binaryLookup?: Record<string, string>;
  substitutionLegend?: Record<string, string>;
}

export interface SessionChallengeState {
  challengeId: string;
  position: number;
  outcome: ChallengeOutcome | null;
  attempts: number;
  hintUsed: boolean;
  selectedAnswer: unknown;
  points: number;
}

export interface ScoreBreakdown {
  challengePoints: number;
  captureBonus: number;
  timeBonus: number;
  deductions: number;
}

export interface GameSession {
  id: string;
  alias: string;
  consent: boolean;
  accessibilityMode: AccessibilityMode;
  state: 'ready' | 'prepared' | 'active' | 'completed' | 'expired' | 'abandoned';
  preparedAt: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  serverNow: string | null;
  challenges: SessionChallengeState[];
  flagCaptured: boolean;
  flagValue: string | null;
  score: number;
  breakdown: ScoreBreakdown;
  qualified: boolean;
  qualificationReason: string;
  elapsedMs: number;
}

export interface Prize {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  image_url: string | null;
  weight: number;
  available: number;
  active: boolean;
  color: string;
}

export interface Award {
  prizeId: string;
  claimCode: string;
  segmentIndex: number;
}

export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  score: number;
  solvedCount: number;
  elapsedMs: number;
  finalFlag?: string;
  isCurrentPlayer?: boolean;
}

export interface EventStatus {
  name: string;
  tagline: string;
  state: 'open' | 'paused' | 'closed';
  durationSeconds: number;
  playersToday: number;
  averageScore: number;
  prizesClaimed: number;
  challengesSolvedToday: number;
  prizesWonToday: number;
  bestTimeMs: number;
}

export interface AdminStats {
  playersToday: number;
  completedRounds: number;
  prizesAwarded: number;
  pendingClaims: number;
  kiosks: KioskStatus[];
  recentClaims: RecentClaim[];
}

export interface KioskStatus {
  id: string;
  name: string;
  location: string;
  status: 'playing' | 'ready' | 'offline';
}

export interface RecentClaim {
  time: string;
  player: string;
  prize: string;
  kiosk: string;
  status: 'claimed' | 'awaiting';
}

export interface StaffUser {
  token: string;
  role: 'staff' | 'admin';
  username: string;
}

export interface ClaimLookup {
  awardId: string;
  claimCode: string;
  prizeName: string;
  prizeIcon: string;
  status: string;
  playerAlias: string;
  awardedAt: string;
  redeemedAt: string | null;
}

export interface PrizeInventoryItem {
  prizeId: string;
  name: string;
  shortLabel: string;
  icon: string;
  weight: number;
  active: boolean;
  color: string | null;
  stockReceived: number;
  stockReserved: number;
  stockRedeemed: number;
  available: number;
}

export interface AdminStats {
  total_sessions: number;
  active_sessions: number;
  completed_sessions: number;
  expired_sessions: number;
  abandoned_sessions: number;
  total_players: number;
  prizes_awarded: number;
  pending_claims: number;
  total_solved: number;
  total_attempts: number;
  hints_used: number;
  captures: number;
}

export interface SessionListItem {
  id: string;
  alias: string;
  state: string;
  score: number;
  solved_count: number;
  elapsed_ms: number;
  publish_consent: boolean;
  kiosk_id: string;
  created_at: string;
  started_at: string | null;
  finalized_at: string | null;
  award_status: string | null;
  award_prize_name: string | null;
  claim_code: string | null;
}

export interface ChallengeListItem {
  id: string;
  stable_id: string;
  type: string;
  difficulty: string;
  title: string;
  published: boolean;
  revision_number: number;
  created_at: string;
}

export interface PrizeListItem {
  id: string;
  name: string;
  short_label: string;
  icon: string;
  description: string;
  image_url: string | null;
  weight: number;
  active: boolean;
  archived: boolean;
  display_order: number;
  color: string | null;
  stock_received: number;
  stock_reserved: number;
  stock_redeemed: number;
  available: number;
  odds_percent: number;
}

export interface LeaderboardAdminEntry {
  rank: number;
  alias: string;
  score: number;
  solved_count: number;
  elapsed_ms: number;
  captured: boolean;
  publish_consent: boolean;
  is_hidden: boolean;
  session_id: string;
  finalized_at: string | null;
}

export interface AnalyticsData {
  rounds_started: number;
  rounds_completed: number;
  rounds_expired: number;
  rounds_abandoned: number;
  completion_rate: number;
  qualification_rate: number;
  total_players: number;
  avg_score: number;
  median_score: number;
  avg_duration_ms: number;
  challenge_stats: Array<{
    type: string;
    presented: number;
    solved: number;
    hint_used: number;
    skipped: number;
    avg_attempts: number;
  }>;
  prize_distribution: Array<{
    prize_name: string;
    awarded: number;
    redeemed: number;
    voided: number;
    pending: number;
  }>;
  inventory_status: Array<{
    name: string;
    received: number;
    reserved: number;
    redeemed: number;
    available: number;
  }>;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_type: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface StaffListItem {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface EventDetail {
  id: string;
  name: string;
  state: string;
  timezone: string;
  opens_at: string | null;
  closes_at: string | null;
  active_ruleset_id: string | null;
  created_at: string;
  ruleset: Record<string, unknown> | null;
}

export interface PlayerDataSummary {
  sessions: number;
  challenges: number;
  attempts: number;
  entitlements: number;
  awards_total: number;
  awards_awarded: number;
  awards_redeemed: number;
  awards_voided: number;
  awards_expired: number;
}

export interface DeletePlayerDataResult {
  deleted: boolean;
  counts: PlayerDataSummary;
  awards_anonymized: number;
}
