// utils/soundEffects.js
// REV 82: shared master bus (gain -> compressor -> destination) so rapid
// clicks can't stack additively, and a SINGLE module-level delegated click
// listener — page scripts no longer re-bind it on SPA swaps (which stacked
// N identical oscillators per click after N swaps).

let audioCtx = null;
let masterBus = null;

const initAudioContext = () => {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      /* REV 82: shared bus — voices sum into the compressor, which caps
         additive peaks so rapid clicks stay at a consistent volume. */
      masterBus = audioCtx.createGain();
      masterBus.gain.value = 1;
      const comp = audioCtx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 6;
      comp.attack.value = 0.002;
      comp.release.value = 0.12;
      masterBus.connect(comp);
      comp.connect(audioCtx.destination);
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

const bus = (ctx) => masterBus || ctx.destination;

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
    gain.connect(bus(ctx));

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
    latchGain.connect(bus(ctx));
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
    ringGain.connect(bus(ctx));
    ringOsc.start(t2);
    ringOsc.stop(t2 + 0.08);
  } catch (err) {
    console.warn('Audio unlock playback failed:', err);
  }
};

/* REV 82: SINGLE delegated click listener — bound once at module eval.
   Page scripts must NOT re-bind this on document (SPA swaps re-execute
   page scripts, which stacked N identical oscillators per click). */
if (typeof window !== 'undefined') {
  document.addEventListener('click', function (e) {
    if (!window.SFX || !isSoundEnabled()) return;
    var t = e.target && e.target.closest ? e.target.closest('button, a, [role="button"], input[type="submit"]') : null;
    if (!t) return;
    if (t.closest('.tour-overlay')) return;
    /* Call through the public bridge (not the module-local binding) so the
       exposed window.SFX API stays the single interception point. */
    window.SFX.playButtonClick();
  });
}

// Expose a classic-script bridge for the page scripts.
if (typeof window !== 'undefined') {
  window.SFX = { isSoundEnabled, setSoundEnabled, playButtonClick, playUnlockSound };
}
