import { useEffect, useState } from 'react';
import { animations } from '../services/animations';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  const [animationsEnabled, setAnimationsEnabled] = useState(animations.isEnabled());

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(media.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    return animations.subscribe(setAnimationsEnabled);
  }, []);

  return reduced || !animationsEnabled;
}
