import type {
  AccessibilityMode,
  Award,
  GameSession,
  EventStatus,
  LeaderboardEntry,
  Prize,
  AdminStats,
} from '../types';
import { selectChallengesForRound } from './challengeSelection';

export const EVENT_STATUS: EventStatus = {
  name: 'PSM TouchCTF',
  tagline: 'Capture. Crack. Defend.',
  state: 'open',
  durationSeconds: 180,
  playersToday: 1254,
  averageScore: 385,
  prizesClaimed: 317,
  challengesSolvedToday: 87,
  prizesWonToday: 23,
  bestTimeMs: 727000,
};

export const PRIZES: Prize[] = [
  {
    id: 'grand-prize',
    label: 'Grand Prize',
    shortLabel: 'GRAND PRIZE',
    description: 'Premium cybersecurity prize pack',
    icon: '🎁',
    image_url: null,
    weight: 5,
    available: 2,
    active: true,
    color: '#FFD700',
  },
  {
    id: 'psm-swag',
    label: 'PSM Swag',
    shortLabel: 'PSM SWAG',
    description: 'Wear your cybersecurity mindset',
    icon: '👕',
    image_url: null,
    weight: 15,
    available: 45,
    active: true,
    color: '#FF4FD8',
  },
  {
    id: 'sticker-pack',
    label: 'Sticker Pack',
    shortLabel: 'STICKER PACK',
    description: 'Collect. Share. Spread the word.',
    icon: '🃏',
    image_url: null,
    weight: 60,
    available: 120,
    active: true,
    color: '#20E3FF',
  },
  {
    id: 'enamel-pin',
    label: 'Enamel Pin',
    shortLabel: 'ENAMEL PIN',
    description: 'Show you belong',
    icon: '⭐',
    image_url: null,
    weight: 30,
    available: 40,
    active: true,
    color: '#A98BFF',
  },
  {
    id: 'cyber-ebook',
    label: 'Cybersecurity E-Book',
    shortLabel: 'CYBER E-BOOK',
    description: 'Knowledge for a safer tomorrow',
    icon: '📖',
    image_url: null,
    weight: 20,
    available: 999,
    active: true,
    color: '#20E3FF',
  },
  {
    id: 'mystery-prize',
    label: 'Mystery Prize',
    shortLabel: 'MYSTERY PRIZE',
    description: 'Spin and find out!',
    icon: '❓',
    image_url: null,
    weight: 10,
    available: 10,
    active: true,
    color: '#FF4FD8',
  },
];

export const LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, nickname: 'ByteBandit', score: 429, solvedCount: 3, elapsedMs: 127000, finalFlag: 'PSM{...}' },
  { rank: 2, nickname: 'NullPointer', score: 421, solvedCount: 3, elapsedMs: 142000, finalFlag: 'PSM{...}' },
  { rank: 3, nickname: 'CyberKitten', score: 414, solvedCount: 3, elapsedMs: 155000, finalFlag: 'PSM{...}' },
  { rank: 4, nickname: 'SecGuru', score: 407, solvedCount: 3, elapsedMs: 168000, finalFlag: 'PSM{...}' },
  { rank: 5, nickname: 'PacketPanda', score: 401, solvedCount: 3, elapsedMs: 179000, finalFlag: 'PSM{...}' },
  { rank: 6, nickname: 'RootRanger', score: 400, solvedCount: 3, elapsedMs: 184000, finalFlag: 'PSM{...}' },
  { rank: 7, nickname: 'BlueTiger', score: 400, solvedCount: 3, elapsedMs: 191000, finalFlag: 'PSM{...}' },
  { rank: 8, nickname: 'HexHunter', score: 400, solvedCount: 3, elapsedMs: 205000, finalFlag: 'PSM{...}' },
  { rank: 9, nickname: 'CloudChaser', score: 200, solvedCount: 2, elapsedMs: 217000, finalFlag: 'PSM{...}' },
  { rank: 10, nickname: 'TraceFox', score: 200, solvedCount: 2, elapsedMs: 235000, finalFlag: 'PSM{...}' },
];

export const ADMIN_STATS: AdminStats = {
  playersToday: 128,
  completedRounds: 96,
  prizesAwarded: 64,
  pendingClaims: 8,
  total_sessions: 248,
  active_sessions: 4,
  completed_sessions: 201,
  expired_sessions: 30,
  abandoned_sessions: 17,
  total_players: 156,
  prizes_awarded: 64,
  pending_claims: 8,
  total_solved: 412,
  total_attempts: 733,
  hints_used: 88,
  captures: 12,
  kiosks: [
    { id: 'k1', name: 'Kiosk 01', location: 'Main Hall', status: 'playing' },
    { id: 'k2', name: 'Kiosk 02', location: 'Exhibit Area', status: 'ready' },
    { id: 'k3', name: 'Kiosk 03', location: 'Workshop Zone', status: 'playing' },
  ],
  recentClaims: [
    { time: '14:32', player: 'Alex T.', prize: 'Sticker Pack', kiosk: 'Kiosk 01', status: 'claimed' },
    { time: '14:28', player: 'Jordan M.', prize: 'Enamel Pin', kiosk: 'Kiosk 03', status: 'awaiting' },
    { time: '14:21', player: 'Taylor K.', prize: 'PSM Swag', kiosk: 'Kiosk 02', status: 'claimed' },
  ],
};

export const ADMIN_PRIZES = [
  { id: 'sticker-pack', name: 'Sticker Pack', available: 120, weight: 60, lowStock: false },
  { id: 'enamel-pin', name: 'Enamel Pin', available: 40, weight: 30, lowStock: false },
  { id: 'psm-swag', name: 'PSM Swag', available: 45, weight: 15, lowStock: false },
  { id: 'cyber-ebook', name: 'Cybersecurity E-Book', available: 999, weight: 20, lowStock: false },
  { id: 'mystery-prize', name: 'Mystery Prize', available: 10, weight: 10, lowStock: true },
  { id: 'grand-prize', name: 'Grand Prize', available: 2, weight: 5, lowStock: true },
];

export function createInitialSession(
  alias: string,
  consent: boolean,
  accessibilityMode: AccessibilityMode
): GameSession {
  const selection = selectChallengesForRound();
  return {
    id: 'fixture-' + Math.random().toString(36).slice(2, 10),
    alias: alias || 'CyberPlayer',
    consent,
    accessibilityMode,
    state: 'ready',
    preparedAt: null,
    startedAt: null,
    expiresAt: null,
    serverNow: null,
    challenges: selection.challenges.map((c) => ({
      challengeId: c.id,
      position: c.position,
      outcome: null,
      attempts: 0,
      hintUsed: false,
      selectedAnswer: null,
      points: 0,
    })),
    flagCaptured: false,
    flagValue: null,
    score: 0,
    breakdown: { challengePoints: 0, captureBonus: 0, timeBonus: 0, deductions: 0 },
    qualified: false,
    qualificationReason: '',
    elapsedMs: 0,
  };
}

export function makeFlagValue(sessionId: string): string {
  return 'PSM{FLAG_' + sessionId.slice(-6).toUpperCase() + '}';
}

export function computeScore(session: GameSession): GameSession {
  const challengePoints = session.challenges.reduce((sum, c) => sum + c.points, 0);
  const captureBonus = session.flagCaptured ? 100 : 0;
  const durationMs = (session.expiresAt ? new Date(session.expiresAt).getTime() : Date.now()) -
    (session.startedAt ? new Date(session.startedAt).getTime() : Date.now());
  const remainingSeconds = Math.max(
    0,
    Math.floor(((session.expiresAt ? new Date(session.expiresAt).getTime() : Date.now()) - Date.now()) / 1000)
  );
  const configuredDuration = EVENT_STATUS.durationSeconds;
  const timeBonus = session.flagCaptured ? Math.floor(100 * remainingSeconds / configuredDuration) : 0;
  const deductions = session.challenges.reduce(
    (sum, c) => sum + (c.hintUsed ? 25 : 0) + (c.attempts > 1 && c.outcome === 'solved' ? 10 * (c.attempts - 1) : 0),
    0
  );
  const score = challengePoints + captureBonus + timeBonus;
  const solvedCount = session.challenges.filter((c) => c.outcome === 'solved').length;
  const qualified = solvedCount >= 2 && session.flagCaptured;
  return {
    ...session,
    score,
    breakdown: { challengePoints, captureBonus, timeBonus, deductions },
    qualified,
    qualificationReason: qualified
      ? 'Captured the final flag with at least two challenges solved.'
      : solvedCount < 2
      ? 'At least two challenges must be solved to qualify.'
      : 'The final flag must be captured before time runs out.',
    elapsedMs: session.flagCaptured
      ? Date.now() - (session.startedAt ? new Date(session.startedAt).getTime() : Date.now())
      : Math.min(Date.now() - (session.startedAt ? new Date(session.startedAt).getTime() : Date.now()), durationMs),
  };
}

export const SCENARIOS: Record<string, { label: string; description: string; setup: (session: GameSession) => GameSession }> = {
  success: {
    label: 'Successful capture and prize qualification',
    description: 'All three challenges solved, flag captured, prize wheel unlocked.',
    setup: (session) => {
      session.state = 'completed';
      session.challenges.forEach((c) => {
        c.outcome = 'solved';
        c.points = 100;
      });
      session.flagCaptured = true;
      session.flagValue = makeFlagValue(session.id);
      return computeScore(session);
    },
  },
  unqualified: {
    label: 'Unqualified result',
    description: 'Only one challenge solved; no prize spin.',
    setup: (session) => {
      session.state = 'completed';
      session.challenges[0].outcome = 'solved';
      session.challenges[0].points = 100;
      session.flagCaptured = false;
      return computeScore(session);
    },
  },
  timeout: {
    label: 'Timer expiry',
    description: 'Round expires before the final flag is captured.',
    setup: (session) => {
      session.state = 'expired';
      session.challenges[0].outcome = 'solved';
      session.challenges[0].points = 100;
      session.challenges[1].outcome = 'solved';
      session.challenges[1].points = 100;
      session.flagCaptured = false;
      return computeScore(session);
    },
  },
  'stock-unavailable': {
    label: 'Prize stock unavailable',
    description: 'Qualified, but every eligible prize is out of stock.',
    setup: (session) => {
      session.state = 'completed';
      session.challenges.forEach((c) => {
        c.outcome = 'solved';
        c.points = 100;
      });
      session.flagCaptured = true;
      return computeScore(session);
    },
  },
  'connection-failure': {
    label: 'Connection failure',
    description: 'Simulates a network error during spin.',
    setup: (session) => {
      session.state = 'completed';
      session.challenges.forEach((c) => {
        c.outcome = 'solved';
        c.points = 100;
      });
      session.flagCaptured = true;
      return computeScore(session);
    },
  },
  'prize-awarded': {
    label: 'Prize awarded and claim displayed',
    description: 'Spin already completed; claim code is shown.',
    setup: (session) => {
      session.state = 'completed';
      session.challenges.forEach((c) => {
        c.outcome = 'solved';
        c.points = 100;
      });
      session.flagCaptured = true;
      return computeScore(session);
    },
  },
};

export function makeAward(scenario: string): Award | null {
  if (scenario === 'stock-unavailable') return null;
  if (scenario === 'connection-failure') throw new Error('Network error');
  if (scenario === 'prize-awarded') {
    return { prizeId: 'enamel-pin', claimCode: 'PSM-CLAIM-7742', segmentIndex: 3 };
  }
  return { prizeId: 'sticker-pack', claimCode: 'PSM-CLAIM-3918', segmentIndex: 2 };
}

export function generateAlias(): string {
  const parts = ['Cyber', 'Byte', 'Net', 'Pixel', 'Hex', 'Root', 'Null', 'Stack', 'Hash', 'Cipher'];
  const suffixes = ['Panda', 'Fox', 'Kitten', 'Bandit', 'Ninja', 'Wolf', 'Ranger', 'Ghost', 'Hunter', 'Bolt'];
  return parts[Math.floor(Math.random() * parts.length)] + suffixes[Math.floor(Math.random() * suffixes.length)];
}
