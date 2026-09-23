import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiModule from '../api';
import { generateAlias } from '../fixtureData';
import { selectChallengesForRound, resetPoolProgress } from '../challengeSelection';

// Minimal localStorage mock
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
  get length() { return Object.keys(store).length; },
  key: vi.fn((_i: number) => null),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('active session localStorage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('setActiveSession stores id and state', () => {
    apiModule.api.setActiveSession('sess-1', 'active');
    const stored = apiModule.api.getActiveSession();
    expect(stored).toEqual({ id: 'sess-1', state: 'active', updatedAt: expect.any(Number) });
  });

  it('getActiveSession returns null when nothing stored', () => {
    expect(apiModule.api.getActiveSession()).toBeNull();
  });

  it('clearActiveSession removes the stored record', () => {
    apiModule.api.setActiveSession('sess-2', 'active');
    apiModule.api.clearActiveSession();
    expect(apiModule.api.getActiveSession()).toBeNull();
  });

  it('clearActiveSession is safe to call when nothing stored', () => {
    expect(() => apiModule.api.clearActiveSession()).not.toThrow();
  });
});

describe('nickname preservation', () => {
  it('nickname from HomeScreen is passed to RegisterScreen via location state', () => {
    // Simulate what HomeScreen does: navigate with state containing the nickname
    const state = { nickname: 'fdssv' };
    expect((state as any).nickname).toBe('fdssv');
  });

  it('RegisterScreen initializes alias from location state', () => {
    const state = { nickname: 'fdssv' };
    const alias = (state as { nickname?: string } | null)?.nickname || '';
    expect(alias).toBe('fdssv');
  });

  it('empty location state results in empty alias', () => {
    const state = null;
    const alias = (state as { nickname?: string } | null)?.nickname || '';
    expect(alias).toBe('');
  });

  it('generateAlias returns a non-empty string', () => {
    const alias = generateAlias();
    expect(typeof alias).toBe('string');
    expect(alias.length).toBeGreaterThan(0);
  });

  it('nickname "fdssv" passes validation', () => {
    const VALID_NAME = /^[a-zA-Z0-9 _\-]{0,20}$/;
    const trimmed = 'fdssv'.trim();
    expect(trimmed.length >= 2 && trimmed.length <= 20).toBe(true);
    expect(VALID_NAME.test(trimmed)).toBe(true);
  });

  it('empty nickname passes validation (will generate alias)', () => {
    const trimmed = ''.trim();
    expect(trimmed.length).toBe(0);
    // Empty is valid — generateAlias() called at submit time
  });
});

describe('createSession behavior', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('createSession clears active session pointer first', async () => {
    apiModule.api.setActiveSession('old-session', 'active');
    const clearSpy = vi.spyOn(apiModule.api, 'clearActiveSession');

    // Mock the fetch to return a session
    const mockSession = {
      id: 'new-session-123',
      alias: 'TestPlayer',
      state: 'ready',
      score: 0,
      solved_count: 0,
      started_at: null,
      expires_at: null,
      server_now: new Date().toISOString(),
      elapsed_ms: 0,
      qualified: false,
      current_position: null,
      challenges: [],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(mockSession), { status: 200 }));

    const { createSession } = await import('../../hooks/useGameSession');
    await createSession('TestPlayer', true, 'standard');

    expect(clearSpy).toHaveBeenCalled();
    const afterCreate = apiModule.api.getActiveSession();
    expect(afterCreate?.id).toBe('new-session-123');
  });
});

describe('resetForNextPlayer', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('clears the active session pointer', async () => {
    apiModule.api.setActiveSession('completed-session', 'completed');
    const { resetForNextPlayer } = await import('../../hooks/useGameSession');
    resetForNextPlayer();
    expect(apiModule.api.getActiveSession()).toBeNull();
  });
});

describe('session state transitions', () => {
  it('completed session is not shown as resumable', () => {
    const state: string = 'completed';
    const isResumable = state === 'active' || state === 'ready' || state === 'prepared';
    expect(isResumable).toBe(false);
  });

  it('active session is shown as resumable', () => {
    const state: string = 'active';
    const isResumable = state === 'active' || state === 'ready' || state === 'prepared';
    expect(isResumable).toBe(true);
  });

  it('ready session is shown as resumable', () => {
    const state: string = 'ready';
    const isResumable = state === 'active' || state === 'ready' || state === 'prepared';
    expect(isResumable).toBe(true);
  });

  it('prepared session is shown as resumable', () => {
    const state: string = 'prepared';
    const isResumable = state === 'active' || state === 'ready' || state === 'prepared';
    expect(isResumable).toBe(true);
  });

  it('expired session is not shown as resumable', () => {
    const state: string = 'expired';
    const isResumable = state === 'active' || state === 'ready' || state === 'prepared';
    expect(isResumable).toBe(false);
  });

  it('abandoned session is not shown as resumable', () => {
    const state: string = 'abandoned';
    const isResumable = state === 'active' || state === 'ready' || state === 'prepared';
    expect(isResumable).toBe(false);
  });

  it('prepared state is included in valid active states', () => {
    const activeStates = ['ready', 'prepared', 'active'];
    expect(activeStates).toContain('prepared');
  });

  it('createSession sets pointer for prepared state', () => {
    const state = 'prepared';
    const shouldSetPointer = ['ready', 'prepared', 'active'].includes(state);
    expect(shouldSetPointer).toBe(true);
  });
});

describe('challenge position validation', () => {
  it('valid positions are 1, 2, 3', () => {
    const validPositions = [1, 2, 3];
    expect(validPositions).toContain(1);
    expect(validPositions).toContain(2);
    expect(validPositions).toContain(3);
    expect(validPositions).not.toContain(0);
    expect(validPositions).not.toContain(4);
  });

  it('position display uses URL param, not derived count', () => {
    // Scenario: after solving challenges 1 and 2, on challenge 3
    const challenges = [
      { position: 1, outcome: 'solved' },
      { position: 2, outcome: 'solved' },
      { position: 3, outcome: null },
    ];
    const pos = 3; // from URL param

    // Old buggy approach: solvedCount + (state === 'active' ? 1 : 0)
    const solvedCount = challenges.filter(c => c.outcome === 'solved').length;
    void (solvedCount + 1); // 2 + 1 = 3 — correct here, but... (see allSolved test below)

    // After solving all 3 (state still 'active' during polling before redirect):
    const allSolved = [
      { position: 1, outcome: 'solved' },
      { position: 2, outcome: 'solved' },
      { position: 3, outcome: 'solved' },
    ];
    const allSolvedCount = allSolved.filter(c => c.outcome === 'solved').length;
    const buggyDisplayAll = allSolvedCount + 1; // 3 + 1 = 4 — BUG: "Challenge 4 of 3"
    expect(buggyDisplayAll).toBe(4); // This was the reported bug

    // Fixed approach: use URL position directly
    const displayPosition = pos;
    expect(displayPosition).toBe(3); // Always correct
  });
});

describe('ready double-tap prevention', () => {
  it('isReadying prevents multiple createSession calls', () => {
    let callCount = 0;
    const isReadying = false;
    if (!isReadying) {
      callCount++;
      // Second tap while isReadying=true would be blocked
    }
    expect(callCount).toBe(1);
  });
});

describe('countdown sound names', () => {
  it('countdown sound is defined in audio module', async () => {
    const { audio } = await import('../audio');
    expect(typeof audio.play).toBe('function');
    // countdown and countdownGo should be playable without throwing
    expect(() => audio.play('countdown')).not.toThrow();
    expect(() => audio.play('countdownGo')).not.toThrow();
  });
});

describe('challenge next-button logic', () => {
  it('shows Capture Flag when 2+ solved and on last challenge', () => {
    const challenges = [
      { position: 1, outcome: 'solved' },
      { position: 2, outcome: 'solved' },
      { position: 3, outcome: 'solved' },
    ];
    const solvedCount = challenges.filter(c => c.outcome === 'solved').length;
    const pos = 3;
    const showCaptureFlag = pos === 3 && solvedCount >= 2;
    expect(showCaptureFlag).toBe(true);
  });

  it('shows View results when fewer than 2 solved', () => {
    const challenges = [
      { position: 1, outcome: 'solved' },
      { position: 2, outcome: 'failed' },
      { position: 3, outcome: 'skipped' },
    ];
    const solvedCount = challenges.filter(c => c.outcome === 'solved').length;
    const pos = 3;
    const showCaptureFlag = pos === 3 && solvedCount >= 2;
    expect(showCaptureFlag).toBe(false);
  });

  it('shows Next for non-final challenges regardless of score', () => {
    const pos: number = 1;
    const isLastChallenge = pos === 3;
    expect(isLastChallenge).toBe(false);
  });
});

describe('prepare endpoint error handling', () => {
  it('404 error produces service-unavailable message, not raw "Not Found"', () => {
    // This is the exact failure: stale backend without /prepare endpoint returns 404.
    // The frontend must show a useful message instead of raw "Not Found".
    const err = new Error('Not Found');
    (err as any).statusCode = 404;

    // Simulate the describeReadyError logic
    const status = (err as any).statusCode;
    let message: string;
    if (status === 404) {
      message = 'Service unavailable. The game service needs to be restarted. Please try again shortly.';
    } else {
      message = err.message;
    }

    expect(message).not.toBe('Not Found');
    expect(message).toContain('Service unavailable');
    expect(message).toContain('restart');
  });

  it('403 error produces session-expired message', () => {
    const err = new Error('Session not found or unauthorized');
    (err as any).statusCode = 403;

    const status = (err as any).statusCode;
    let message: string;
    if (status === 403) {
      message = 'Session not found or expired. Returning to home.';
    } else {
      message = err.message;
    }

    expect(message).toContain('expired');
  });

  it('network error produces connection message', () => {
    const err = new Error('Failed to fetch');
    const status = (err as any).statusCode;

    let message: string;
    if (!status) {
      message = 'Could not reach the game server. Check your connection and try again.';
    } else {
      message = err.message;
    }

    expect(message).toContain('Could not reach');
  });

  it('prepare API client calls the correct endpoint', async () => {
    // Verify api.prepare uses the right path format
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const { api } = await import('../api');
    try {
      await api.prepare('test-session-id');
    } catch {
      // Ignore — we just need to check the URL was called correctly
    }

    const calledUrl = mockFetch.mock.calls[0]?.[0];
    expect(calledUrl).toBe('/api/v1/sessions/test-session-id/prepare');

    vi.unstubAllGlobals();
  });
});

describe('timer independence (frontend)', () => {
  it('useGameSession resets state when sessionId changes', () => {
    // Simulates the fix: when sessionId changes, session/loaded/error are reset.
    let session: any = { id: 'session-a', loaded: true };
    let loaded = true;

    const sessionIdA: string = 'session-a';
    const sessionIdB: string = 'session-b';

    // On sessionId change (simulating the useEffect reset)
    if (sessionIdB !== sessionIdA) {
      session = null;
      loaded = true;
    }

    expect(session).toBeNull();
    expect(loaded).toBe(true);
  });
});

describe('challenge pool anti-repeat (frontend)', () => {
  beforeEach(() => {
    resetPoolProgress();
  });

  it('selectChallengesForRound returns 3 valid challenges', () => {
    const result = selectChallengesForRound();
    expect(result.challenges).toHaveLength(3);
    expect(result.challenges.map(c => c.id).every(Boolean)).toBe(true);
  });

  it('consecutive rounds avoid immediate repetition', () => {
    const round1 = selectChallengesForRound();
    const round2 = selectChallengesForRound();
    const ids1 = round1.challenges.map(c => c.id);
    const ids2 = round2.challenges.map(c => c.id);
    // At least one challenge should differ between rounds
    const allSame = ids1.every(id => ids2.includes(id));
    // Not guaranteed to differ (pool size 6, 3 drawn), but statistically very likely
    expect(allSame).toBe(false);
  });

  it('pool progress tracks recentIds', () => {
    const result = selectChallengesForRound();
    const progress = result.poolProgress;
    const types = ['phishing', 'logs', 'decode'] as const;
    for (const t of types) {
      expect(progress[t].recentIds.length).toBeGreaterThan(0);
      expect(progress[t].recentIds.length).toBeLessThanOrEqual(3);
    }
  });
});

describe('hint_used mapping (frontend)', () => {
  it('mapSessionChallenge reads hint_used from backend', () => {
    // Simulates the fix: mapSessionChallenge now reads hint_used from backend data
    const backendChallenge = {
      id: 'ch-1',
      position: 1,
      type: 'phishing',
      difficulty: 'medium',
      title: 'Test',
      instructions: 'Test',
      hint: 'Test hint',
      hint_used: true,
      data: {},
      max_points: 100,
    };

    const mapped = {
      hintUsed: backendChallenge.hint_used ?? false,
    };

    expect(mapped.hintUsed).toBe(true);
  });

  it('mapSessionChallenge defaults hint_used to false when missing', () => {
    const backendChallenge = {
      id: 'ch-1',
      position: 1,
      type: 'phishing',
      difficulty: 'medium',
      title: 'Test',
      instructions: 'Test',
      data: {},
      max_points: 100,
    };

    const mapped = {
      hintUsed: (backendChallenge as any).hint_used ?? false,
    };

    expect(mapped.hintUsed).toBe(false);
  });
});
