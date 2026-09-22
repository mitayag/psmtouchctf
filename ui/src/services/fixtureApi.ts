import type {
  AccessibilityMode,
  Award,
  Challenge,
  GameSession,
  LeaderboardEntry,
  Prize,
  AdminStats,
} from '../types';
import {
  ADMIN_STATS,
  ADMIN_PRIZES,
  EVENT_STATUS,
  LEADERBOARD,
  PRIZES,
  createInitialSession,
  computeScore,
  makeAward,
  makeFlagValue,
  SCENARIOS,
} from './fixtureData';
import { getChallengeForPosition, loadSession, loadActiveSession, saveSession, clearSession } from './challengeSelection';

let currentScenario = 'success';
let committedAward: Award | null = null;
let connectionOk = true;

export const fixtureApi = {
  getEventStatus: () => Promise.resolve({ ...EVENT_STATUS }),

  getPublicPrizes: () => Promise.resolve(PRIZES.filter((p) => p.active).map((p) => ({ ...p }))),

  getLeaderboard: async (): Promise<LeaderboardEntry[]> => {
    const current = loadActiveSession();
    const entries = LEADERBOARD.map((e) => ({ ...e }));
    if (current && current.consent && (current.state === 'completed' || current.state === 'expired')) {
      const existing = entries.find((e) => e.nickname === current.alias);
      if (existing) {
        existing.score = current.score;
        existing.solvedCount = current.challenges.filter((c) => c.outcome === 'solved').length;
        existing.isCurrentPlayer = true;
      } else {
        entries.push({
          rank: 11,
          nickname: current.alias,
          score: current.score,
          solvedCount: current.challenges.filter((c) => c.outcome === 'solved').length,
          elapsedMs: current.elapsedMs,
          finalFlag: current.flagValue || undefined,
          isCurrentPlayer: true,
        });
      }
      entries.sort((a, b) => b.score - a.score || b.solvedCount - a.solvedCount || a.elapsedMs - b.elapsedMs);
      entries.forEach((e, i) => (e.rank = i + 1));
    }
    return entries.slice(0, 10);
  },

  createSession: async (alias: string, consent: boolean, accessibilityMode: AccessibilityMode): Promise<GameSession> => {
    const session = createInitialSession(alias, consent, accessibilityMode);
    saveSession(session);
    return { ...session };
  },

  getSession: async (sessionId: string): Promise<GameSession | null> => {
    const stored = loadSession(sessionId);
    if (!stored) return null;
    return computeScore(stored);
  },

  startRound: async (sessionId: string): Promise<GameSession> => {
    const stored = loadSession(sessionId);
    if (!stored) throw new Error('Session not found');
    const now = Date.now();
    const durationMs = EVENT_STATUS.durationSeconds * 1000;
    stored.state = 'active';
    stored.startedAt = new Date(now).toISOString();
    stored.expiresAt = new Date(now + durationMs).toISOString();
    saveSession(stored);
    return { ...stored };
  },

  getChallenge: async (sessionId: string, position: number): Promise<Challenge | null> => {
    const stored = loadSession(sessionId);
    if (!stored) return null;
    return getChallengeForPosition(stored.challenges, position) || null;
  },

  submitAnswer: async (
    sessionId: string,
    position: number,
    answer: unknown
  ): Promise<{ session: GameSession; correct: boolean; message: string }> => {
    const stored = loadSession(sessionId);
    if (!stored) throw new Error('Session not found');
    const challenge = await fixtureApi.getChallenge(sessionId, position);
    const state = stored.challenges.find((c) => c.position === position);
    if (!challenge || !state || state.outcome) {
      throw new Error('Invalid challenge state');
    }
    state.attempts += 1;
    const correct = validateAnswer(challenge, answer);
    if (correct) {
      state.outcome = 'solved';
      let points = 100;
      if (state.attempts > 1) points -= 10 * (state.attempts - 1);
      if (state.hintUsed) points -= 25;
      state.points = Math.max(0, points);
      state.selectedAnswer = answer;
    } else if (state.attempts >= 2) {
      state.outcome = 'failed';
      state.selectedAnswer = answer;
    }
    const updated = computeScore(stored);
    saveSession(updated);
    return {
      session: { ...updated },
      correct,
      message: correct ? 'Challenge solved' : state.attempts >= 2 ? 'Maximum attempts reached' : 'Not quite — review the highlighted clue',
    };
  },

  useHint: async (sessionId: string, position: number): Promise<GameSession> => {
    const stored = loadSession(sessionId);
    if (!stored) throw new Error('Session not found');
    const state = stored.challenges.find((c) => c.position === position);
    if (!state || state.hintUsed) throw new Error('Invalid hint state');
    state.hintUsed = true;
    const updated = computeScore(stored);
    saveSession(updated);
    return { ...updated };
  },

  skipChallenge: async (sessionId: string, position: number): Promise<GameSession> => {
    const stored = loadSession(sessionId);
    if (!stored) throw new Error('Session not found');
    const state = stored.challenges.find((c) => c.position === position);
    if (!state || state.outcome) throw new Error('Invalid skip state');
    state.outcome = 'skipped';
    const updated = computeScore(stored);
    saveSession(updated);
    return { ...updated };
  },

  captureFlag: async (sessionId: string): Promise<GameSession> => {
    const stored = loadSession(sessionId);
    if (!stored) throw new Error('Session not found');
    const solvedCount = stored.challenges.filter((c) => c.outcome === 'solved').length;
    if (solvedCount < 2) throw new Error('Not enough solves to capture flag');
    stored.flagCaptured = true;
    stored.flagValue = makeFlagValue(stored.id);
    stored.state = 'completed';
    const updated = computeScore(stored);
    saveSession(updated);
    return { ...updated };
  },

  abandon: async (sessionId: string): Promise<GameSession> => {
    const stored = loadSession(sessionId);
    if (!stored) throw new Error('Session not found');
    stored.state = 'abandoned';
    saveSession(stored);
    return { ...stored };
  },

  spin: async (sessionId: string): Promise<{ session: GameSession; award: Award | null }> => {
    const stored = loadSession(sessionId);
    if (!stored) throw new Error('Session not found');
    if (!connectionOk) throw new Error('Network error');
    if (currentScenario === 'stock-unavailable') {
      return { session: { ...stored }, award: null };
    }
    if (!committedAward) {
      committedAward = makeAward(currentScenario);
    }
    return { session: { ...stored }, award: committedAward };
  },

  getAward: async (): Promise<Award | null> => {
    return committedAward ? { ...committedAward } : null;
  },

  getAdminStats: async (): Promise<AdminStats> => {
    return { ...ADMIN_STATS, kiosks: ADMIN_STATS.kiosks.map((k) => ({ ...k })), recentClaims: ADMIN_STATS.recentClaims.map((c) => ({ ...c })) };
  },

  getAdminPrizes: async (): Promise<typeof ADMIN_PRIZES> => {
    return ADMIN_PRIZES.map((p) => ({ ...p }));
  },

  setScenario: (scenario: string) => {
    currentScenario = scenario;
    committedAward = null;
  },

  getScenario: () => currentScenario,

  setConnectionOk: (ok: boolean) => {
    connectionOk = ok;
  },

  getConnectionOk: () => connectionOk,

  resetForNextPlayer: () => {
    clearSession();
    committedAward = null;
    currentScenario = 'success';
    connectionOk = true;
  },

  peekActiveSession: () => loadSession(''),
};

function validateAnswer(_challenge: Challenge, _answer: unknown): boolean {
  // Offline fixture mode no longer has access to canonical answers; the real
  // backend validates all submissions. Returning false here keeps the bundle
  // free of answer metadata while preserving the rest of the dev fixtures.
  return false;
}

export function getPrizesForWheel(): Prize[] {
  return PRIZES.filter((p) => p.active);
}

export function getPrizeById(id: string): Prize | undefined {
  return PRIZES.find((p) => p.id === id);
}

export async function createSession(
  alias: string,
  consent: boolean,
  accessibilityMode: AccessibilityMode
): Promise<GameSession> {
  return fixtureApi.createSession(alias, consent, accessibilityMode);
}

export { SCENARIOS };
