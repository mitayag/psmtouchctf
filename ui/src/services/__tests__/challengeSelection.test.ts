import { beforeEach, describe, expect, it } from 'vitest';
import { resetPoolProgress, selectChallengesForRound, loadPoolProgress } from '../challengeSelection';

describe('challengeSelection', () => {
  beforeEach(() => {
    resetPoolProgress();
  });

  it('selects one challenge of each type per round', () => {
    const round = selectChallengesForRound();
    expect(round.challenges.length).toBe(3);
    const types = round.challenges.map((c) => c.type).sort();
    expect(types).toEqual(['decode', 'logs', 'phishing']);
  });

  it('assigns unique positions 1, 2, 3 to the selected challenges', () => {
    const round = selectChallengesForRound();
    const positions = round.challenges.map((c) => c.position).sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3]);
  });

  it('does not repeat a challenge within the same round', () => {
    const round = selectChallengesForRound();
    const ids = round.challenges.map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('rotates through each type pool before reshuffling', () => {
    const seenPhishing = new Set<string>();
    const seenLogs = new Set<string>();
    const seenDecode = new Set<string>();

    for (let i = 0; i < 7; i++) {
      const round = selectChallengesForRound();
      for (const c of round.challenges) {
        if (c.type === 'phishing') seenPhishing.add(c.id);
        if (c.type === 'logs') seenLogs.add(c.id);
        if (c.type === 'decode') seenDecode.add(c.id);
      }
    }

    expect(seenPhishing.size).toBe(7);
    expect(seenLogs.size).toBe(7);
    expect(seenDecode.size).toBe(6);
  });

  it('persists pool progress to localStorage', () => {
    selectChallengesForRound();
    const progress = loadPoolProgress();
    expect(progress.phishing.index).toBeGreaterThan(0);
    expect(progress.logs.index).toBeGreaterThan(0);
    expect(progress.decode.index).toBeGreaterThan(0);
  });

  it('avoids immediately repeating the last challenge when reshuffling a pool', () => {
    // Exhaust a small pool (decode has 6) and verify the new pool does not start with the previous last item.
    let lastDecodeId: string | null = null;
    for (let i = 0; i < 12; i++) {
      const round = selectChallengesForRound();
      const decode = round.challenges.find((c) => c.type === 'decode')!;
      if (i === 5) lastDecodeId = decode.id;
      if (i === 6) {
        expect(decode.id).not.toBe(lastDecodeId);
        break;
      }
    }
  });
});
