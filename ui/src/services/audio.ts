type SoundName =
  | 'button'
  | 'correct'
  | 'incorrect'
  | 'hint'
  | 'challengeComplete'
  | 'flagCapture'
  | 'timerWarning30'
  | 'timerWarning10'
  | 'roundExpiry'
  | 'countdown'
  | 'countdownGo'
  | 'wheelSpin'
  | 'wheelTick'
  | 'prizeReveal'
  | 'leaderboardCelebration'
  | 'startRound';

interface AudioState {
  enabled: boolean;
  volume: number;
  context: AudioContext | null;
  masterGain: GainNode | null;
  buffers: Partial<Record<SoundName, AudioBuffer>>;
  loading: boolean;
  error: string | null;
  lastPlayTime: Partial<Record<SoundName, number>>;
  tickCount: number;
  pendingSources: Set<AudioScheduledSourceNode>;
  initialized: boolean;
}

const SOUND_FILES: Record<SoundName, string> = {
  button: '/sounds/kenney/button.wav',
  startRound: '/sounds/kenney/startRound.wav',
  correct: '/sounds/kenney/correct.wav',
  incorrect: '/sounds/kenney/incorrect.wav',
  hint: '/sounds/kenney/hint.wav',
  challengeComplete: '/sounds/kenney/challengeComplete.wav',
  flagCapture: '/sounds/kenney/flagCapture.wav',
  timerWarning30: '/sounds/kenney/timerWarning.wav',
  timerWarning10: '/sounds/kenney/timerWarning.wav',
  roundExpiry: '/sounds/kenney/roundExpiry.wav',
  wheelSpin: '/sounds/kenney/wheelTick.wav',
  wheelTick: '/sounds/kenney/wheelTick.wav',
  prizeReveal: '/sounds/kenney/prizeReveal.wav',
  leaderboardCelebration: '/sounds/kenney/leaderboardCelebration.wav',
  countdown: '/sounds/kenney/countdown.wav',
  countdownGo: '/sounds/kenney/countdownGo.wav',
};

const THROTTLE_MS: Partial<Record<SoundName, number>> = {
  button: 80,
  wheelTick: 40,
  correct: 150,
  incorrect: 150,
  timerWarning30: 900,
  timerWarning10: 900,
  countdown: 1100,
};

const VOLUME_OVERRIDES: Partial<Record<SoundName, number>> = {
  button: 0.6,
  hint: 0.7,
  wheelTick: 0.35,
  timerWarning30: 0.7,
  timerWarning10: 0.8,
  correct: 0.8,
  incorrect: 0.7,
  countdown: 0.55,
  countdownGo: 0.7,
};

const ENABLE_KEY = 'psm-sound-enabled';
const VOLUME_KEY = 'psm-sound-volume';

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLE_KEY) === 'true';
  } catch {
    return false;
  }
}

function readVolume(): number {
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY) || '');
    return Number.isNaN(v) ? 0.6 : Math.max(0, Math.min(1, v));
  } catch {
    return 0.6;
  }
}

function saveEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLE_KEY, String(enabled));
  } catch {
    // ignore
  }
}

function saveVolume(volume: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // ignore
  }
}

const state: AudioState = {
  enabled: readEnabled(),
  volume: readVolume(),
  context: null,
  masterGain: null,
  buffers: {},
  loading: false,
  error: null,
  lastPlayTime: {},
  tickCount: 0,
  pendingSources: new Set(),
  initialized: false,
};

function now(): number {
  return performance.now();
}

function shouldThrottle(name: SoundName): boolean {
  const last = state.lastPlayTime[name];
  const limit = THROTTLE_MS[name];
  if (limit && last && now() - last < limit) return true;
  state.lastPlayTime[name] = now();
  return false;
}

async function loadBuffer(path: string): Promise<AudioBuffer> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  if (!state.context) throw new Error('AudioContext not available');
  return state.context.decodeAudioData(arrayBuffer);
}

async function ensureContext(): Promise<AudioContext | null> {
  if (!state.enabled) return null;
  if (state.context) {
    if (state.context.state === 'suspended') {
      try {
        await state.context.resume();
      } catch {
        // ignore
      }
    }
    return state.context;
  }
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    state.error = 'Web Audio not supported';
    return null;
  }
  state.context = new Ctx();
  state.masterGain = state.context.createGain();
  state.masterGain.gain.value = state.volume;
  state.masterGain.connect(state.context.destination);
  return state.context;
}

async function loadAllBuffers(): Promise<void> {
  if (!state.enabled || state.loading || state.initialized) return;
  const ctx = await ensureContext();
  if (!ctx) return;
  state.loading = true;
  state.error = null;
  const entries = Object.entries(SOUND_FILES) as [SoundName, string][];
  await Promise.all(
    entries.map(async ([name, path]) => {
      try {
        state.buffers[name] = await loadBuffer(path);
      } catch (e) {
        // Log but don't block other sounds
        // eslint-disable-next-line no-console
        console.warn(`Sound load failed: ${path}`, e);
      }
    })
  );
  state.loading = false;
  state.initialized = true;
  if (Object.keys(state.buffers).length === 0) {
    state.error = 'No sounds could be loaded';
  }
}

function playBuffer(name: SoundName, buffer: AudioBuffer) {
  const ctx = state.context;
  const master = state.masterGain;
  if (!ctx || !master) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  const override = VOLUME_OVERRIDES[name] ?? 1;
  gain.gain.value = override;
  source.connect(gain);
  gain.connect(master);
  source.addEventListener('ended', () => state.pendingSources.delete(source), { once: true });
  state.pendingSources.add(source);
  try {
    source.start();
  } catch {
    state.pendingSources.delete(source);
  }
}

function playFallbackTone(name: SoundName) {
  // Minimal oscillator fallback if the WAV file failed to load.
  const ctx = state.context;
  const master = state.masterGain;
  if (!ctx || !master) return;
  const toneDefs: Partial<Record<SoundName, { freq: number | number[]; duration: number; type: OscillatorType; vol: number }>> = {
    button: { freq: 880, duration: 0.08, type: 'sine', vol: 0.15 },
    correct: { freq: [784, 988, 1175], duration: 0.25, type: 'sine', vol: 0.25 },
    incorrect: { freq: 220, duration: 0.25, type: 'triangle', vol: 0.15 },
    hint: { freq: [523, 659], duration: 0.2, type: 'sine', vol: 0.18 },
    challengeComplete: { freq: [523, 659, 784, 1047], duration: 0.35, type: 'sine', vol: 0.25 },
    flagCapture: { freq: [392, 523, 659, 784, 1047], duration: 0.6, type: 'sine', vol: 0.3 },
    timerWarning30: { freq: 880, duration: 0.12, type: 'square', vol: 0.12 },
    timerWarning10: { freq: 1100, duration: 0.15, type: 'square', vol: 0.15 },
    roundExpiry: { freq: [440, 330, 220], duration: 0.5, type: 'sawtooth', vol: 0.2 },
    prizeReveal: { freq: [523, 659, 784, 1047, 1319], duration: 0.7, type: 'sine', vol: 0.3 },
    leaderboardCelebration: { freq: [523, 659, 784, 1047, 1319, 1568], duration: 0.9, type: 'sine', vol: 0.25 },
    countdown: { freq: 880, duration: 0.15, type: 'sine', vol: 0.35 },
    countdownGo: { freq: [1047, 1319, 1568], duration: 0.35, type: 'sine', vol: 0.4 },
  };
  const def = toneDefs[name];
  if (!def) return;
  const freqs = Array.isArray(def.freq) ? def.freq : [def.freq];
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = def.type;
    osc.frequency.value = f;
    const start = ctx.currentTime + i * 0.02;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(def.vol, start + 0.01);
    gain.gain.setValueAtTime(def.vol, start + def.duration - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, start + def.duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + def.duration + 0.05);
    state.pendingSources.add(osc);
    osc.addEventListener('ended', () => state.pendingSources.delete(osc), { once: true });
  });
}

export const audio = {
  isEnabled(): boolean {
    return state.enabled;
  },

  getVolume(): number {
    return state.volume;
  },

  isLoading(): boolean {
    return state.loading;
  },

  getError(): string | null {
    return state.error;
  },

  async enable(): Promise<boolean> {
    state.enabled = true;
    saveEnabled(true);
    await loadAllBuffers();
    return state.error === null && Object.keys(state.buffers).length > 0;
  },

  disable() {
    state.enabled = false;
    saveEnabled(false);
    this.stopAll();
    if (state.context && state.context.state !== 'closed') {
      void state.context.suspend();
    }
  },

  setEnabled(enabled: boolean): void {
    if (enabled) {
      void this.enable();
    } else {
      this.disable();
    }
  },

  setVolume(value: number): void {
    state.volume = Math.max(0, Math.min(1, value));
    saveVolume(state.volume);
    if (state.masterGain) {
      try {
        state.masterGain.gain.setValueAtTime(state.volume, state.masterGain.context.currentTime);
      } catch {
        // ignore
      }
    }
  },

  stopAll(): void {
    state.pendingSources.forEach((src) => {
      try {
        src.stop();
      } catch {
        // ignore
      }
    });
    state.pendingSources.clear();
  },

  async test(): Promise<boolean> {
    const ok = await this.enable();
    if (ok) this.play('button');
    return ok;
  },

  play(name: SoundName): void {
    if (!state.enabled) return;
    if (shouldThrottle(name)) return;
    void ensureContext().then(() => {
      if (name === 'wheelTick') {
        state.tickCount += 1;
      }
      const buffer = state.buffers[name];
      if (buffer) {
        playBuffer(name, buffer);
      } else {
        playFallbackTone(name);
      }
    });
  },
};

export type { SoundName };
