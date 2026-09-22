const STORAGE_KEY = 'psm-touchctf-animations';

let enabled = true;

try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'false') enabled = false;
} catch {
  // ignore
}

const listeners = new Set<(enabled: boolean) => void>();

export const animations = {
  isEnabled(): boolean {
    return enabled;
  },
  setEnabled(value: boolean) {
    enabled = value;
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // ignore
    }
    listeners.forEach((fn) => fn(value));
  },
  subscribe(fn: (enabled: boolean) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
