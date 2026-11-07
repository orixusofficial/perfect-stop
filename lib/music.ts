/**
 * Looping background music for Perfect Stop.
 *
 * Two HTMLAudioElement voices (one per track) are created once and reused for
 * the page lifetime so no duplicate instances ever exist. Track changes are
 * instant hard cuts (no fades), pause/resume is instant, and playback is
 * unlocked from the first user gesture to satisfy browser autoplay policies.
 */

export type TrackId = "base" | "intense";

type Voice = {
  el: HTMLAudioElement;
  /** Mirror of the element's volume (kept for inspection). */
  volume: number;
};

const TRACK_SRC: Record<TrackId, string> = {
  base: "/audio/music1-15.mp3",
  intense: "/audio/music16-plus.mp3",
};

/** Background music sits at ~22% so it stays atmospheric (spec: 20–25%). */
const MUSIC_VOLUME = 0.22;
/** Slightly slower playback keeps the mood calm (spec: ~0.85). */
const PLAYBACK_RATE = 0.85;
const TRACK_IDS: readonly TrackId[] = ["base", "intense"];

class MusicPlayer {
  private voices: Partial<Record<TrackId, Voice>> = {};
  private current: TrackId | null = null;
  private desired: TrackId = "base";
  private muted = false;
  private paused = false;
  private unlocked = false;
  /** True once playback is actually running; gestures become no-ops after. */
  private started = false;

  /** Create both audio elements ahead of time so the first gesture is snappy. */
  preload(): void {
    if (typeof window === "undefined") return;
    this.voice("base");
    this.voice("intense");
  }

  /**
   * Start playback from the first user gesture (autoplay policy). One-shot:
   * once audio is running, later gestures never touch the player — music only
   * changes through setMuted/setTrack/setPaused, so unrelated button clicks
   * can never restart or glitch it.
   */
  unlock(): void {
    if (typeof window === "undefined" || this.started) return;
    this.unlocked = true;
    if (this.paused) return; // the visibility resume starts it instead
    this.startCurrent();
  }

  /**
   * Select the track for the current phase. No-op while the requested track
   * is already selected, so ordinary level changes never restart the music.
   * The switch itself is an instant hard cut — no crossfade.
   */
  setTrack(track: TrackId): void {
    if (track === this.desired) return;
    this.desired = track;
    if (!this.unlocked) return; // applied when the first gesture arrives
    this.current = track;

    // Instant cut: silence and pause every other voice, then start the new one.
    for (const id of TRACK_IDS) {
      if (id === track) continue;
      const voice = this.voices[id];
      if (!voice) continue;
      voice.el.pause();
      this.writeVol(voice, 0);
    }
    const incoming = this.voice(track);
    this.writeVol(incoming, this.muted ? 0 : MUSIC_VOLUME);
    incoming.el.playbackRate = PLAYBACK_RATE;
    if (this.paused) return; // stays silent; setPaused(false) resumes it
    if (incoming.el.paused) {
      void incoming.el
        .play()
        .then(() => {
          this.started = true;
          // A pause() issued while this play() was still pending (common on
          // slow mobile starts) may not have cancelled it — re-assert.
          if (this.paused) incoming.el.pause();
        })
        .catch(() => {});
    }
  }

  /** Mute silences the music instantly (it keeps looping for instant resume). */
  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    for (const id of TRACK_IDS) {
      const voice = this.voices[id];
      if (!voice) continue;
      this.writeVol(voice, muted || id !== this.current ? 0 : MUSIC_VOLUME);
    }
  }

  /**
   * Pause/resume playback instantly — used for the game-over screen and
   * hidden tabs. No fades, no delays; elements are paused in place so the
   * position is preserved and no restart occurs on resume.
   */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      for (const id of TRACK_IDS) {
        const voice = this.voices[id];
        if (voice) voice.el.pause();
      }
      return;
    }
    if (!this.unlocked) return; // first gesture will unlock later
    this.startCurrent();
  }

  /** Release every audio resource; a later preload/unlock starts cleanly. */
  dispose(): void {
    for (const id of TRACK_IDS) {
      const voice = this.voices[id];
      if (!voice) continue;
      voice.el.pause();
      voice.el.removeAttribute("src");
      try {
        voice.el.load();
      } catch {
        /* element already torn down */
      }
      voice.el.remove();
    }
    this.voices = {};
    this.current = null;
    this.unlocked = false;
    this.started = false;
    this.paused = false;
  }

  private startCurrent(): void {
    const id = (this.current ?? this.desired) as TrackId;
    this.current = id;
    const voice = this.voice(id);
    voice.el.playbackRate = PLAYBACK_RATE;
    this.writeVol(voice, this.muted ? 0 : MUSIC_VOLUME);
    if (voice.el.paused) {
      void voice.el
        .play()
        .then(() => {
          this.started = true;
          // Re-assert pause if it was requested while play() was pending;
          // otherwise music keeps playing after the Pause button.
          if (this.paused) voice.el.pause();
        })
        .catch(() => {
          // Autoplay refused — the next gesture retries this initial start.
        });
    } else {
      this.started = true;
    }
  }

  private writeVol(voice: Voice, value: number): void {
    voice.volume = value;
    voice.el.volume = value;
    // el.muted silences reliably on every browser (incl. iOS Safari, where
    // volume writes can be ignored before the first user gesture).
    voice.el.muted = value <= 0;
  }

  private voice(id: TrackId): Voice {
    let voice = this.voices[id];
    if (!voice) {
      const el = new Audio(TRACK_SRC[id]);
      el.loop = true;
      el.preload = "auto";
      el.volume = 0;
      el.playbackRate = PLAYBACK_RATE;
      // Keep the element in the document: some mobile browsers suspend
      // detached media, and it keeps the player inspectable.
      el.setAttribute("aria-hidden", "true");
      el.style.display = "none";
      document.body.appendChild(el);
      voice = { el, volume: 0 };
      this.voices[id] = voice;
    }
    return voice;
  }
}

/** Shared music player used across the app. */
export const music = new MusicPlayer();
