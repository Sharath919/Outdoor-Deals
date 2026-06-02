let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

export function playChime(frequency = 528, duration = 0.3, volume = 0.1) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    osc.type = 'sine';
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    /* autoplay policy */
  }
}

export function playHoverWhoosh() {
  playChime(396, 0.12, 0.02);
}

export function playSelectChime() {
  playChime(528, 0.28, 0.1);
}

export function playShuffleSound() {
  try {
    const ctx = getCtx();
    const count = 6;
    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 180 + Math.random() * 120;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.04;
      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.start(t);
      osc.stop(t + 0.09);
    }
  } catch {
    /* ignore */
  }
}

export function playAllSelectedChime(step: number) {
  playChime(528 + step * 40, 0.22, 0.08);
}

export function playRevealFlip() {
  playChime(440, 0.15, 0.06);
  setTimeout(() => playChime(220, 0.2, 0.08), 120);
}

export const SOUNDS_STORAGE_KEY = 'limansa_sounds_enabled';

export function isSoundsEnabled(): boolean {
  return localStorage.getItem(SOUNDS_STORAGE_KEY) === 'true';
}

export function setSoundsEnabled(on: boolean) {
  localStorage.setItem(SOUNDS_STORAGE_KEY, on ? 'true' : 'false');
}
