import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { describeStartError } from '../startErrors';

// Minimal localStorage mock (session pointer + kiosk credential live there).
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
  get length() { return Object.keys(store).length; },
  key: vi.fn(() => null),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

const backendSession = {
  id: 'sess-1',
  alias: 'SKEE',
  publish_consent: true,
  accessibility_mode: 'standard',
  state: 'ready',
  prepared_at: null,
  started_at: null,
  expires_at: null,
  elapsed_ms: 0,
  score: 0,
  qualified: false,
  challenges: [],
  server_now: '2026-09-23T00:00:00Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('describeStartError', () => {
  it('classifies missing status as connection', () => {
    const info = describeStartError(new Error('network down'));
    expect(info.kind).toBe('connection');
    expect(info.message).toContain('Could not reach');
  });

  it('classifies timeout as connection with timeout copy', () => {
    const e = new Error('timed out') as Error & { isTimeout?: boolean };
    e.isTimeout = true;
    const info = describeStartError(e);
    expect(info.kind).toBe('connection');
    expect(info.message).toContain('in time');
  });

  it('classifies 422 as validation and keeps server detail', () => {
    const e = new Error('Alias must be 2 characters or fewer') as Error & { statusCode?: number };
    e.statusCode = 422;
    const info = describeStartError(e);
    expect(info.kind).toBe('validation');
    expect(info.message).toContain('Alias must be 2');
  });

  it('classifies 409 as conflict', () => {
    const e = new Error('round in progress') as Error & { statusCode?: number };
    e.statusCode = 409;
    expect(describeStartError(e).kind).toBe('conflict');
  });

  it('classifies 503 as unavailable', () => {
    const e = new Error('Event is not open') as Error & { statusCode?: number };
    e.statusCode = 503;
    const info = describeStartError(e);
    expect(info.kind).toBe('unavailable');
    expect(info.message).toContain('Event is not open');
  });

  it('uses friendly unavailable copy when 503 has no detail', () => {
    const e = new Error('Request failed (503)') as Error & { statusCode?: number };
    e.statusCode = 503;
    e.message = '';
    const info = describeStartError(e);
    expect(info.kind).toBe('unavailable');
    expect(info.message).toContain('unavailable');
  });

  it('classifies 500 as server with a friendly message', () => {
    const e = new Error('Internal server error') as Error & { statusCode?: number };
    e.statusCode = 500;
    const info = describeStartError(e);
    expect(info.kind).toBe('server');
    expect(info.message).not.toContain('Internal server error');
    expect(info.message).toContain('try again');
  });
});

describe('api.createSession startup behavior', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps TimeoutError rejections to a retryable connection error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }));
    try {
      await api.createSession('SKEE', true, 'standard', true);
      expect.unreachable('createSession should throw');
    } catch (e) {
      const err = e as Error & { statusCode?: number; isTimeout?: boolean };
      expect(err.isTimeout).toBe(true);
      expect(err.statusCode).toBeUndefined();
      expect(describeStartError(err).kind).toBe('connection');
    }
  });

  it('first attempt uses force_new; recovery retry does not blindly create another session', async () => {
    const bodies: Array<{ force_new: boolean }> = [];
    const fetchMock = vi.fn(async (_url: unknown, opts?: RequestInit) => {
      bodies.push(JSON.parse(String(opts?.body)));
      return jsonResponse(backendSession);
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.createSession('SKEE', true, 'standard', true);
    await api.createSession('SKEE', true, 'standard', false);

    expect(bodies[0].force_new).toBe(true);
    expect(bodies[1].force_new).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('non-ok response carries statusCode so callers can classify it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'Internal server error' }, 500)));
    try {
      await api.createSession('SKEE', true, 'standard', true);
      expect.unreachable('createSession should throw');
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      expect(err.statusCode).toBe(500);
      const info = describeStartError(err);
      expect(info.kind).toBe('server');
    }
  });

  it('prepare and begin requests are bounded by a timeout signal', async () => {
    const signals: Array<AbortSignal | undefined | null> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, opts?: RequestInit) => {
      signals.push(opts?.signal);
      return jsonResponse(backendSession);
    }));
    await api.prepare('sess-1');
    await api.startRound('sess-1');
    expect(signals).toHaveLength(2);
    for (const signal of signals) {
      expect(signal).toBeTruthy();
      expect(signal!.aborted).toBe(false);
    }
  });
});
