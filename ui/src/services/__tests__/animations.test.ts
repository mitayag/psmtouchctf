import { describe, expect, it } from 'vitest';
import { animations } from '../animations';

describe('animations preference', () => {
  it('starts enabled', () => {
    expect(animations.isEnabled()).toBe(true);
  });

  it('can be disabled and emits to subscribers', () => {
    let seen = animations.isEnabled();
    const unsubscribe = animations.subscribe((v) => {
      seen = v;
    });
    animations.setEnabled(false);
    expect(animations.isEnabled()).toBe(false);
    expect(seen).toBe(false);
    unsubscribe();
    animations.setEnabled(true);
    expect(seen).toBe(false); // unsubscribed
  });
});
