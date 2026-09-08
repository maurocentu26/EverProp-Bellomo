/**
 * Corporate notification chime using Web Audio API.
 * Synthesizes a dual-tone harmonic (D5 + A5) with exponential decay.
 * No external audio files needed.
 */

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioCtx();
    }
    // Resume if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      void audioContext.resume();
    }
    return audioContext;
  } catch {
    return null;
  }
}

export function playCorporateNotificationChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const duration = 0.35;

    // D5 (587.33 Hz) — primary tone
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);

    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    // A5 (880 Hz) — harmonic
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.08, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    // Play
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
  } catch {
    // Silently fail — audio is non-critical
  }
}
