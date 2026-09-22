import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, loadActiveSession, loadSession, saveSession } from '../challengeSelection';
import type { GameSession } from '../../types';

function makeSession(id: string): GameSession {
  return {
    id,
    alias: 'TestPlayer',
    consent: true,
    accessibilityMode: 'standard',
    state: 'active',
    startedAt: new Date(Date.now() - 30_000).toISOString(),
    expiresAt: new Date(Date.now() + 150_000).toISOString(),
    serverNow: new Date().toISOString(),
    challenges: [
      { challengeId: 'phishing-password-reset', position: 1, outcome: 'solved', attempts: 1, hintUsed: false, selectedAnswer: ['ev-from'], points: 100 },
      { challengeId: 'logs-brute-force', position: 2, outcome: null, attempts: 0, hintUsed: false, selectedAnswer: null, points: 0 },
      { challengeId: 'decode-base64', position: 3, outcome: null, attempts: 0, hintUsed: false, selectedAnswer: null, points: 0 },
    ],
    flagCaptured: false,
    flagValue: null,
    score: 100,
    breakdown: { challengePoints: 100, captureBonus: 0, timeBonus: 0, deductions: 0 },
    qualified: false,
    qualificationReason: '',
    elapsedMs: 30_000,
  };
}

describe('session persistence', () => {
  beforeEach(() => {
    clearSession();
  });

  it('saves and loads a session by ID', () => {
    const session = makeSession('fixture-abc123');
    saveSession(session);
    expect(loadSession('fixture-abc123')).toEqual(session);
  });

  it('returns null when loading a session with a mismatched ID', () => {
    const session = makeSession('fixture-abc123');
    saveSession(session);
    expect(loadSession('fixture-other')).toBeNull();
  });

  it('loadActiveSession returns the stored session regardless of ID', () => {
    const session = makeSession('fixture-xyz789');
    saveSession(session);
    expect(loadActiveSession()).toEqual(session);
  });

  it('clearSession removes the stored session', () => {
    const session = makeSession('fixture-clear');
    saveSession(session);
    clearSession();
    expect(loadActiveSession()).toBeNull();
    expect(loadSession('fixture-clear')).toBeNull();
  });
});
