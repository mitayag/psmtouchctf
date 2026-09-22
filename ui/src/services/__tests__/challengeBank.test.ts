import { describe, expect, it } from 'vitest';
import { CHALLENGE_BANK, getAllChallenges, getChallengeById, getChallengesByType } from '../challengeBank';

describe('challengeBank', () => {
  it('contains exactly 20 challenges', () => {
    expect(CHALLENGE_BANK.length).toBe(20);
  });

  it('has 7 phishing, 7 logs, and 6 decode challenges', () => {
    expect(getChallengesByType('phishing').length).toBe(7);
    expect(getChallengesByType('logs').length).toBe(7);
    expect(getChallengesByType('decode').length).toBe(6);
  });

  it('has unique IDs for every challenge', () => {
    const ids = getAllChallenges().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every challenge has required metadata', () => {
    for (const c of CHALLENGE_BANK) {
      expect(c.id).toBeTruthy();
      expect(c.type).toMatch(/^(phishing|logs|decode)$/);
      expect(c.title).toBeTruthy();
      expect(c.instruction).toBeTruthy();
      expect(c.hint).toBeTruthy();
    }
  });

  it('does not leak correct flags for evidence/log challenges', () => {
    for (const c of CHALLENGE_BANK) {
      if (c.data.kind === 'phishing') {
        for (const e of c.data.evidence) {
          expect('correct' in e).toBe(false);
        }
      }
      if (c.data.kind === 'logs') {
        for (const l of c.data.logs) {
          expect('correct' in l).toBe(false);
        }
      }
    }
  });

  it('does not leak answers for decode challenges', () => {
    for (const c of CHALLENGE_BANK) {
      if (c.data.kind === 'decode') {
        expect('answer' in c.data).toBe(false);
        expect(c.data.placeholder).toBeTruthy();
      }
    }
  });

  it('getChallengeById returns the correct challenge', () => {
    const c = getChallengeById('decode-base64');
    expect(c).toBeDefined();
    expect(c?.type).toBe('decode');
    expect(c?.data.kind).toBe('decode');
  });

  it('decode challenges keep helpful scaffolding without answers', () => {
    for (const c of CHALLENGE_BANK) {
      if (c.data.kind === 'decode') {
        expect(c.data.tokens.length).toBeGreaterThan(0);
        expect(c.data.prompt).toBeTruthy();
      }
    }
  });
});
