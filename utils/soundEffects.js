// utils/soundEffects.js
let audioCtx = null;

const initAudioContext = () => {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (err) {
      console.warn('AudioContext unavailable:', err);
      return null;
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    const resumeResult = audioCtx.resume();
    if (resumeResult && typeof resumeResult.catch === 'function') {
      resumeResult.catch(() => {});
    }
  }
  return audioCtx;
};

// Global unlock on first user gesture
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    initAudioContext();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });
}

export const isSoundEnabled = () => {
  if (typeof window === 'undefined') return true;
  const saved = localStorage.getItem('arc_sound_enabled');
  return saved === null ? true : saved === 'true';
};

export const setSoundEnabled = (enabled) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('arc_sound_enabled', String(enabled));
};

export const playButtonClick = () => {
  if (!isSoundEnabled()) return;
  try {
    const ctx = initAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.04);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.04);
  } catch (err) {
    console.warn('Audio click playback failed:', err);
  }
};

export const playUnlockSound = () => {
  if (!isSoundEnabled()) return;
  try {
    const ctx = initAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Stage 1: Mechanical Latch
    const latchOsc = ctx.createOscillator();
    const latchGain = ctx.createGain();
    latchOsc.type = 'square';
    latchOsc.frequency.setValueAtTime(320, now);
    latchOsc.frequency.exponentialRampToValueAtTime(90, now + 0.035);
    latchGain.gain.setValueAtTime(0.25, now);
    latchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    latchOsc.connect(latchGain);
    latchGain.connect(ctx.destination);
    latchOsc.start(now);
    latchOsc.stop(now + 0.035);

    // Stage 2: Resonant Release
    const ringOsc = ctx.createOscillator();
    const ringGain = ctx.createGain();
    const t2 = now + 0.045;
    ringOsc.type = 'sine';
    ringOsc.frequency.setValueAtTime(580, t2);
    ringOsc.frequency.exponentialRampToValueAtTime(920, t2 + 0.08);
    ringGain.gain.setValueAtTime(0.3, t2);
    ringGain.gain.exponentialRampToValueAtTime(0.001, t2 + 0.08);
    ringOsc.connect(ringGain);
    ringGain.connect(ctx.destination);
    ringOsc.start(t2);
    ringOsc.stop(t2 + 0.08);
  } catch (err) {
    console.warn('Audio unlock playback failed:', err);
  }
};

// Expose a classic-script bridge for the page scripts.
if (typeof window !== 'undefined') {
  window.SFX = { isSoundEnabled, setSoundEnabled, playButtonClick, playUnlockSound };
}