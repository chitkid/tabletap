/** Two short sine notes. Built on the user's gesture (the Sound toggle) so autoplay policy allows it. */
export function createChime(): { play(): void } {
  const Ctx = typeof window === 'undefined' ? undefined : window.AudioContext;
  if (!Ctx) return { play() {} };
  const ctx = new Ctx();
  const note = (freq: number, at: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.2, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.13);
  };
  return {
    play() {
      void ctx.resume();
      const t = ctx.currentTime;
      note(880, t);
      note(1320, t + 0.13);
    },
  };
}
