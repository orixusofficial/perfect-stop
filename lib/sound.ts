/**
 * Tiny Web Audio sound kit — no audio files, everything is synthesised.
 * The engine is created lazily on the first sound, i.e. after a user gesture.
 */

export type SoundKind =
  | "click"
  | "start"
  | "hit"
  | "perfect"
  | "miss"
  | "gameOver"
  | "newBest";

type ToneOptions = {
  freq: number;
  /** Optional end frequency for a slide. */
  to?: number;
  duration?: number;
  type?: OscillatorType;
  gain?: number;
  /** Delay in seconds. */
  delay?: number;
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  muted = false;

  private audio(): AudioContext | null {
    if (typeof window === "undefined") return null;

    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
    }

    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private tone({
    freq,
    to,
    duration = 0.14,
    type = "triangle",
    gain = 0.16,
    delay = 0,
  }: ToneOptions): void {
    const ctx = this.audio();
    if (!ctx || this.muted) return;

    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, start);
    if (to !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(30, to),
        start + duration,
      );
    }

    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(envelope);
    envelope.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  play(kind: SoundKind, score = 0): void {
    if (this.muted) return;

    switch (kind) {
      case "click":
        this.tone({ freq: 660, duration: 0.07, type: "square", gain: 0.07 });
        break;
      case "start":
        this.tone({ freq: 520, duration: 0.1, gain: 0.14 });
        this.tone({ freq: 780, duration: 0.14, delay: 0.08, gain: 0.14 });
        break;
      case "hit": {
        // Pitch climbs with the score for a satisfying streak feeling.
        const pitch = 470 * Math.pow(1.055, Math.min(score, 32));
        this.tone({ freq: pitch, duration: 0.13, gain: 0.17 });
        this.tone({
          freq: pitch * 1.5,
          duration: 0.1,
          delay: 0.05,
          gain: 0.1,
          type: "sine",
        });
        break;
      }
      case "perfect":
        this.tone({ freq: 880, duration: 0.1, type: "sine", gain: 0.14 });
        this.tone({
          freq: 1320,
          duration: 0.18,
          delay: 0.07,
          type: "sine",
          gain: 0.12,
        });
        break;
      case "miss":
        this.tone({
          freq: 300,
          to: 90,
          duration: 0.4,
          type: "sawtooth",
          gain: 0.13,
        });
        break;
      case "gameOver":
        [440, 370, 294, 220].forEach((freq, index) => {
          this.tone({
            freq,
            duration: 0.2,
            delay: index * 0.11,
            type: "triangle",
            gain: 0.13,
          });
        });
        break;
      case "newBest":
        [523, 659, 784, 1047].forEach((freq, index) => {
          this.tone({
            freq,
            duration: 0.16,
            delay: index * 0.09,
            type: "sine",
            gain: 0.15,
          });
        });
        break;
    }
  }
}

/** Shared sound engine used across the app. */
export const sfx = new SoundEngine();
