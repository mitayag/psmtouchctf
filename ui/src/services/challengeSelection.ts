import type { Challenge } from '../types';
import { getChallengeById, getChallengesByType } from './challengeBank';

const POOL_KEY = 'psm-touchctf-challenge-pools';
const SESSION_KEY = 'psm-touchctf-active-session';

export type PoolProgress = Record<
  Challenge['type'],
  { pool: string[]; index: number; lastUsedId: string | null; recentIds: string[] }
>;

const emptyPool = (): { pool: string[]; index: number; lastUsedId: string | null; recentIds: string[] } => ({ pool: [], index: 0, lastUsedId: null, recentIds: [] });

function shuffle<T>(array: T[]): T[] {
  const items = array.slice();
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function getDefaultProgress(): PoolProgress {
  return { phishing: emptyPool(), logs: emptyPool(), decode: emptyPool() };
}

export function loadPoolProgress(): PoolProgress {
  try {
    const raw = localStorage.getItem(POOL_KEY);
    if (raw) return JSON.parse(raw) as PoolProgress;
  } catch {
    // ignore corrupted storage
  }
  return getDefaultProgress();
}

export function savePoolProgress(progress: PoolProgress): void {
  try {
    localStorage.setItem(POOL_KEY, JSON.stringify(progress));
  } catch {
    // ignore storage errors
  }
}

export function resetPoolProgress(): void {
  try {
    localStorage.removeItem(POOL_KEY);
  } catch {
    // ignore
  }
}

function drawNext(progress: PoolProgress, type: Challenge['type']): { id: string; progress: PoolProgress } {
  const allIds = getChallengesByType(type).map((c) => c.id);
  const poolState = { ...progress[type], pool: progress[type].pool.slice(), recentIds: [...(progress[type].recentIds || [])] };

  if (poolState.pool.length === 0 || poolState.index >= poolState.pool.length) {
    let newPool = shuffle(allIds);
    // Avoid recently used challenges when reshuffling
    if (poolState.recentIds.length > 0 && newPool.length > 1) {
      const recent = poolState.recentIds.slice(-3);
      const nonRecent = newPool.filter((id) => !recent.includes(id));
      const recentInPool = newPool.filter((id) => recent.includes(id));
      if (nonRecent.length > 0) {
        newPool = [...shuffle(nonRecent), ...shuffle(recentInPool)];
      }
    }
    // Also avoid immediately repeating the last-used challenge
    if (poolState.lastUsedId && newPool.length > 1 && newPool[0] === poolState.lastUsedId) {
      const swapIndex = Math.floor(Math.random() * (newPool.length - 1)) + 1;
      [newPool[0], newPool[swapIndex]] = [newPool[swapIndex], newPool[0]];
    }
    poolState.pool = newPool;
    poolState.index = 0;
  }

  const id = poolState.pool[poolState.index];
  poolState.index += 1;
  poolState.lastUsedId = id;
  poolState.recentIds = [...poolState.recentIds, id].slice(-3);

  return { id, progress: { ...progress, [type]: poolState } };
}

export interface RoundSelection {
  challenges: Challenge[];
  poolProgress: PoolProgress;
}

export function selectChallengesForRound(): RoundSelection {
  let progress = loadPoolProgress();

  const phishing = drawNext(progress, 'phishing');
  progress = phishing.progress;
  const logs = drawNext(progress, 'logs');
  progress = logs.progress;
  const decode = drawNext(progress, 'decode');
  progress = decode.progress;

  const selected = [phishing.id, logs.id, decode.id]
    .map((id) => getChallengeById(id)!)
    .map((c) => ({ ...c }));

  const shuffled = shuffle(selected);
  const withPositions = shuffled.map((c, i) => ({ ...c, position: i + 1 }));

  savePoolProgress(progress);
  return { challenges: withPositions, poolProgress: progress };
}

export function forceSelectChallengeIds(ids: [string, string, string]): RoundSelection {
  const challenges = ids
    .map((id) => getChallengeById(id))
    .filter((c): c is Challenge => Boolean(c))
    .map((c, i) => ({ ...c, position: i + 1 }));
  return { challenges, poolProgress: loadPoolProgress() };
}

export function getChallengeForPosition(sessionChallenges: { challengeId: string; position: number }[], position: number): Challenge | undefined {
  const mapping = sessionChallenges.find((c) => c.position === position);
  if (!mapping) return undefined;
  const challenge = getChallengeById(mapping.challengeId);
  return challenge ? { ...challenge, position } : undefined;
}

// ─────────────────────────────────────────────────────────────
// Session persistence helpers (Phase 1 prototype only)
// ─────────────────────────────────────────────────────────────

import type { GameSession } from '../types';

export function saveSession(session: GameSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore storage errors
  }
}

export function loadSession(sessionId: string): GameSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameSession;
    if (parsed.id !== sessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function loadActiveSession(): GameSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GameSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
