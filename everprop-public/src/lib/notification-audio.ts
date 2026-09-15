/** Soft three-note notification chime, synthesized locally without audio files. */
let audioContext: AudioContext | null = null;
let playing = false;

export function playCorporateNotificationChime(): void {
  if (typeof window === 'undefined' || playing) return;
  playing = true;
  void playChime().finally(() => { playing = false; });
}

async function playChime(): Promise<void> {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext || audioContext.state === 'closed') audioContext = new AudioCtx();
    const ctx = audioContext;
    if (ctx.state === 'suspended') await ctx.resume();
    if (ctx.state !== 'running') return;

    const start = ctx.currentTime + 0.02;
    // A gentle ascending phrase lasting 2.2 seconds; avoid stacked alerts.
    const notes = [
      { frequency: 523.25, offset: 0, duration: 0.8 },
      { frequency: 659.25, offset: 0.55, duration: 0.85 },
      { frequency: 783.99, offset: 1.1, duration: 1.1 },
    ];
    await Promise.all(notes.map(({ frequency, offset, duration }) => new Promise<void>((resolve) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = start + offset;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.12, at + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, at + duration - 0.04);
      gain.gain.linearRampToValueAtTime(0, at + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        resolve();
      };
      oscillator.start(at);
      oscillator.stop(at + duration);
    })));
  } catch {
    // Audio availability must not interrupt delivery of the visible notification.
  }
}
