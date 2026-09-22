import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccessibilityMode, Award, Challenge, GameSession } from '../types';
import { api } from '../services/api';
import { fixtureApi } from '../services/fixtureApi';

export function useGameSession(sessionId: string | undefined) {
  const [session, setSession] = useState<GameSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef(sessionId);
  const abortControllersRef = useRef<AbortController[]>([]);

  // Keep a ref in sync so async callbacks can ignore stale responses.
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Reset session state when sessionId changes to prevent stale data from
  // a previous session leaking into the new one (timer inheritance bug).
  useEffect(() => {
    setSession(null);
    setLoading(true);
    setError(null);
  }, [sessionId]);

  const isCurrent = useCallback((id: string | undefined) => id === sessionIdRef.current, []);

  const abortPending = useCallback(() => {
    abortControllersRef.current.forEach((c) => {
      try {
        c.abort();
      } catch {
        // ignore
      }
    });
    abortControllersRef.current = [];
  }, []);

  const trackAbort = useCallback((controller: AbortController) => {
    abortControllersRef.current.push(controller);
    const cleanup = () => {
      abortControllersRef.current = abortControllersRef.current.filter((c) => c !== controller);
    };
    controller.signal.addEventListener('abort', cleanup, { once: true });
    return cleanup;
  }, []);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const controller = new AbortController();
    trackAbort(controller);
    try {
      const s = await api.getSession(sessionId, controller.signal);
      if (!isCurrent(sessionId)) return;
      if (!s) {
        setError('Session not found');
      } else {
        setSession(s);
        setError(null);
      }
    } catch (e) {
      if (!isCurrent(sessionId)) return;
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message);
      }
    } finally {
      if (isCurrent(sessionId)) {
        setLoading(false);
      }
    }
  }, [sessionId, isCurrent, trackAbort]);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(() => {
      // Stop polling once the round is finalized to prevent stale responses
      // and unnecessary network traffic.
      if (sessionIdRef.current && session?.state && ['completed', 'expired', 'abandoned'].includes(session.state)) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }
      refresh();
    }, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      abortPending();
    };
  }, [refresh, session?.state, abortPending]);

  const start = useCallback(async () => {
    if (!sessionId) throw new Error('No session');
    // Do NOT use trackAbort here — the polling useEffect cleanup calls
    // abortPending() when deps change, which would kill this critical
    // one-shot request mid-flight and freeze the ReadyScreen.
    const controller = new AbortController();
    try {
      const s = await api.startRound(sessionId, controller.signal);
      if (!isCurrent(sessionId)) return;
      setSession(s);
      setError(null);
    } finally {
      // No-op: controller is intentionally not tracked so it survives
      // the polling effect's abortPending() cleanup cycle.
    }
  }, [sessionId, isCurrent]);

  const prepare = useCallback(async () => {
    if (!sessionId) throw new Error('No session');
    const controller = new AbortController();
    try {
      const s = await api.prepare(sessionId, controller.signal);
      if (!isCurrent(sessionId)) return;
      setSession(s);
      setError(null);
    } finally {
      // Not tracked — same reasoning as start().
    }
  }, [sessionId, isCurrent]);

  const submitAnswer = useCallback(
    async (position: number, answer: unknown) => {
      if (!sessionId) return { correct: false, message: 'No session' };
      const controller = new AbortController();
      trackAbort(controller);
      try {
        const result = await api.submitAnswer(sessionId, position, answer, controller.signal);
        if (!isCurrent(sessionId)) return { correct: false, message: 'Session changed', attemptsRemaining: 0 };
        await refresh();
        return {
          correct: result.correct,
          message: result.feedback || (result.correct ? 'Correct!' : 'Incorrect'),
          attemptsRemaining: result.attemptsRemaining,
        };
      } catch (e) {
        if (!isCurrent(sessionId)) return { correct: false, message: 'Session changed' };
        return { correct: false, message: (e as Error).message };
      }
    },
    [sessionId, refresh, isCurrent, trackAbort]
  );

  const useHint = useCallback(
    async (position: number) => {
      if (!sessionId) return;
      const controller = new AbortController();
      trackAbort(controller);
      try {
        const s = await api.useHint(sessionId, position, controller.signal);
        if (!isCurrent(sessionId)) return;
        setSession(s);
      } catch (e) {
        if (!isCurrent(sessionId)) return;
        setError((e as Error).message);
      }
    },
    [sessionId, isCurrent, trackAbort]
  );

  const skip = useCallback(
    async (position: number) => {
      if (!sessionId) return;
      const controller = new AbortController();
      trackAbort(controller);
      try {
        const s = await api.skipChallenge(sessionId, position, controller.signal);
        if (!isCurrent(sessionId)) return;
        setSession(s);
      } catch (e) {
        if (!isCurrent(sessionId)) return;
        setError((e as Error).message);
      }
    },
    [sessionId, isCurrent, trackAbort]
  );

  const captureFlag = useCallback(async () => {
    if (!sessionId) return null;
    const controller = new AbortController();
    trackAbort(controller);
    try {
      const result = await api.captureFlag(sessionId, controller.signal);
      if (!isCurrent(sessionId)) return null;
      setSession(result.session);
      return result.session;
    } catch (e) {
      if (!isCurrent(sessionId)) return null;
      setError((e as Error).message);
      return null;
    }
  }, [sessionId, isCurrent, trackAbort]);

  const abandon = useCallback(async () => {
    if (!sessionId) return;
    const controller = new AbortController();
    trackAbort(controller);
    try {
      const s = await api.abandon(sessionId, controller.signal);
      if (!isCurrent(sessionId)) return;
      setSession(s);
    } catch (e) {
      if (!isCurrent(sessionId)) return;
      setError((e as Error).message);
    }
  }, [sessionId, isCurrent, trackAbort]);

  const spin = useCallback(async (): Promise<Award | null> => {
    if (!sessionId) return null;
    const controller = new AbortController();
    trackAbort(controller);
    try {
      const result = await api.spin(sessionId, controller.signal);
      if (!isCurrent(sessionId)) return null;
      setSession(result.session);
      return result.award;
    } catch (e) {
      if (!isCurrent(sessionId)) return null;
      setError((e as Error).message);
      return null;
    }
  }, [sessionId, isCurrent, trackAbort]);

  const getAward = useCallback(async (): Promise<Award | null> => {
    if (!sessionId) return null;
    return api.getAward(sessionId);
  }, [sessionId]);

  return {
    session,
    loading,
    error,
    refresh,
    start,
    prepare,
    submitAnswer,
    useHint,
    skip,
    captureFlag,
    abandon,
    spin,
    getAward,
  };
}

export function useActiveChallenge(sessionId: string | undefined, position: number) {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);

  // Reset challenge state when sessionId changes to prevent stale data.
  useEffect(() => {
    setChallenge(null);
    setLoading(true);
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      if (!sessionId) return;
      try {
        const s = await api.getSession(sessionId, controller.signal);
        if (cancelled) return;
        const c = s?.challenges.find((ch) => ch.position === position);
        if (c) {
          const mapped = await api.getChallenge(sessionId, position, controller.signal);
          setChallenge(mapped || (c as unknown as Challenge));
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionId, position]);

  return { challenge, loading };
}

export async function createSession(
  alias: string,
  consent: boolean,
  accessibilityMode: AccessibilityMode,
  forceNew = false,
): Promise<GameSession> {
  // Clear any stale pointer before creating a fresh session.
  api.clearActiveSession();
  const session = await api.createSession(alias, consent, accessibilityMode, forceNew);

  // Set the active-session pointer for ready, prepared, or active sessions.
  if (['ready', 'prepared', 'active'].includes(session.state)) {
    api.setActiveSession(session.id, session.state);
  }

  return session;
}

export function resetForNextPlayer() {
  api.clearActiveSession();
}

// Development-only helpers still use fixtureApi
export const devApi = fixtureApi;
