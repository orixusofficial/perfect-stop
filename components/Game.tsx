"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ParticleLayer, { type ParticleHandle } from "./ParticleLayer";
import {
  POINTS,
  VERDICT_LABEL,
  judge,
  nextRound,
  openingPos,
  openingRound,
  speedForLevel,
  themeForLevel,
  type Round,
  type Verdict,
} from "@/lib/game";
import { readBest, readMuted, writeBest, writeMuted } from "@/lib/storage";
import { sfx } from "@/lib/sound";
import { music } from "@/lib/music";
import {
  isLocalDev,
  isPlatformMuted,
  pokiBoot,
  pokiGameplayStart,
  pokiGameplayStop,
  showRewardedAd,
  subscribePlatformMute,
} from "@/lib/ads";

type Screen = "home" | "playing" | "over" | "skins";

type Feedback = {
  id: number;
  label: string;
  kind: Verdict["kind"];
  pos: number;
};

const INITIAL_ROUND: Round = { zoneStart: 36, zoneWidth: 26 };

const FEEDBACK_STYLE: Record<Verdict["kind"], string> = {
  perfect: "border-[var(--ps-fb-perfect-deep)] bg-[var(--ps-fb-perfect)] text-[var(--ps-card-ink)] shadow-[0_0_20px_rgba(253,224,71,0.6)]",
  great: "border-mint-deep bg-mint-deep text-white shadow-[0_0_20px_rgba(16,185,129,0.6)]",
  good: "border-sky-deep bg-sky-deep text-white shadow-[0_0_20px_rgba(56,189,248,0.6)]",
  miss: "border-candy-deep bg-candy-deep text-white shadow-[0_0_20px_rgba(251,113,133,0.6)]",
};

const HIT_LOCK_MS = 280;
const RUN_START_LOCK_MS = 550;

type Announcement = {
  id: number;
  level: number;
  title: string;
  subtitle: string;
};

const THEME_ANNOUNCEMENT: Record<
  "orange" | "red",
  { title: string; subtitle: string }
> = {
  orange: { title: "Emergency mode", subtitle: "Orange alert — stay sharp!" },
  red: { title: "Red alert", subtitle: "Hard mode — one slip and it's over" },
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function Game() {
  const [screen, setScreen] = useState<Screen>("home");
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [best, setBest] = useState(0);
  const [muted, setMuted] = useState(false);
  const [round, setRound] = useState<Round>(INITIAL_ROUND);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [announce, setAnnounce] = useState<Announcement | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [adBusy, setAdBusy] = useState(false);
    const [adNote, setAdNote] = useState<string | null>(null);
    const [selectedSkin, setSelectedSkin] = useState("pointer-1");
    const [htmlText, setHtmlText] = useState<Record<string, string>>({});
    useEffect(() => {
      if (typeof window === "undefined") return;
      const saved = localStorage.getItem("ps-pointer-skin");
      if (saved) setSelectedSkin(saved);
    }, []);
    // pointer-2/3/4 are HTML documents, not SVG images, so they cannot be
    // rendered with  (Next serves .svg as image/svg+xml). Fetch their text
    // once and render them in an isolated iframe via srcDoc.
    useEffect(() => {
      let cancelled = false;
      Promise.all(
        ["pointer-2", "pointer-3", "pointer-4"].map(async (id) => {
          try {
            const res = await fetch(`./pointers/${id}.svg`);
            return [id, await res.text()] as [string, string];
          } catch {
            return [id, ""] as [string, string];
          }
        }),
      ).then((entries) => {
        if (!cancelled) setHtmlText(Object.fromEntries(entries));
      });
      return () => {
        cancelled = true;
      };
    }, []);

  const cardRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<ParticleHandle>(null);
  const adBusyRef = useRef(false);

  const phaseRef = useRef<Screen>("home");
  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const bestRef = useRef(0);
  const roundRef = useRef<Round>(INITIAL_ROUND);
  const simRef = useRef({ pos: 18, dir: 1, speed: speedForLevel(1), lockUntil: 0 });
  const endTimerRef = useRef<number | null>(null);

  const setPhase = useCallback((next: Screen) => {
    phaseRef.current = next;
    setScreen(next);
  }, []);

  /* ------------------------------- effects ------------------------------- */

  // Hydration-safe boot: load saved best/mute and randomise the attract mode.
  useEffect(() => {
    const storedBest = readBest();
    const storedMuted = readMuted();
    const opening = openingRound();
    const pos = openingPos(opening);

    pokiBoot();
    bestRef.current = storedBest;
    sfx.muted = storedMuted;
    music.setMuted(storedMuted);
    roundRef.current = opening;
    simRef.current.pos = pos;
    simRef.current.dir = Math.random() < 0.5 ? -1 : 1;
    simRef.current.speed = speedForLevel(1);
    if (indicatorRef.current) {
      indicatorRef.current.style.left = `${pos}%`;
    }

    const id = requestAnimationFrame(() => {
      setBest(storedBest);
      setMuted(storedMuted);
      setRound(opening);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Platform-driven mute (e.g. CrazyGames settings.muteAudio) always wins
  // over the in-game toggle; re-apply whenever either side changes.
  useEffect(() => {
    const apply = () => {
      const effective = readMuted() || isPlatformMuted();
      sfx.muted = effective;
      music.setMuted(effective);
      setMuted(effective);
    };
    apply();
    return subscribePlatformMute(apply);
  }, []);

  // Keep the document theme in sync with the current level phase. Deferred
  // one frame so the level popup paints first and the full-document theme
  // recalculation lands in its own frame instead of one combined hitch.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      document.documentElement.dataset.theme = themeForLevel(level);
    });
    return () => cancelAnimationFrame(id);
  }, [level]);

  // Switch the soundtrack instantly when entering or leaving level 16+.
  useEffect(() => {
    music.setTrack(level >= 16 ? "intense" : "base");
  }, [level]);

  // Music pauses instantly on the game-over screen and while the tab is
  // hidden; it resumes as soon as gameplay (or the tab) is back.
  useEffect(() => {
    music.setPaused(screen === "over" || document.visibilityState === "hidden");
  }, [screen]);

  // Autoplay policy: begin music on the first user gesture, pause it when
  // the tab hides, and release the audio resources on unmount.
  useEffect(() => {
    music.preload();
    const onGesture = () => music.unlock();
    const onVisibility = () => {
      music.setPaused(
        document.visibilityState === "hidden" || phaseRef.current === "over",
      );
    };
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      document.removeEventListener("visibilitychange", onVisibility);
      music.dispose();
    };
  }, []);

  // Fade the level announcement away.
  useEffect(() => {
    if (!announce) return;
    const id = announce.id;
    const timer = window.setTimeout(() => {
      setAnnounce((current) => (current && current.id === id ? null : current));
    }, 2300);
    return () => window.clearTimeout(timer);
  }, [announce]);

  // Animation loop — runs during attract mode and while playing, stops on game over.
  useEffect(() => {
    if (screen === "over") return;

    let raf = 0;
    let last = performance.now();

    const step = (time: number) => {
      const dt = Math.min(0.05, (time - last) / 1000);
      last = time;

      const sim = simRef.current;
      sim.pos += sim.dir * sim.speed * dt;
      if (sim.pos >= 100) {
        sim.pos = 100;
        sim.dir = -1;
      } else if (sim.pos <= 0) {
        sim.pos = 0;
        sim.dir = 1;
      }

      if (indicatorRef.current) {
        indicatorRef.current.style.left = `${sim.pos}%`;
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [screen]);

  // Fade the floating verdict label away.
  useEffect(() => {
    if (!feedback) return;
    const id = feedback.id;
    const timer = window.setTimeout(() => {
      setFeedback((current) => (current && current.id === id ? null : current));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(
    () => () => {
      if (endTimerRef.current) window.clearTimeout(endTimerRef.current);
    },
    [],
  );

  /* ------------------------------ feedback ------------------------------- */

  const shakeCard = useCallback(() => {
    if (prefersReducedMotion()) return;
    cardRef.current?.animate(
      [
        { transform: "translateX(0px)" },
        { transform: "translateX(-10px)" },
        { transform: "translateX(9px)" },
        { transform: "translateX(-6px)" },
        { transform: "translateX(4px)" },
        { transform: "translateX(0px)" },
      ],
      { duration: 420, easing: "ease-out" },
    );
  }, []);

  const burstAtIndicator = useCallback(
    (kind: Verdict["kind"], options?: { count?: number; power?: number }) => {
      const card = cardRef.current;
      const track = trackRef.current;
      if (!card || !track) return;

      const cardBox = card.getBoundingClientRect();
      const trackBox = track.getBoundingClientRect();
      const x =
        trackBox.left - cardBox.left + (trackBox.width * simRef.current.pos) / 100;
      const y = trackBox.top - cardBox.top + trackBox.height / 2;

      particlesRef.current?.burstByKind(x, y, kind, options);
    },
    [],
  );

  /* ------------------------------- actions ------------------------------- */

  const endRun = useCallback(() => {
    const final = scoreRef.current;
    const isBest = final > bestRef.current;

    if (isBest) {
      bestRef.current = final;
      setBest(final);
      writeBest(final);
    }

    setNewBest(isBest);
    setPhase("over");
    pokiGameplayStop();

    if (endTimerRef.current) window.clearTimeout(endTimerRef.current);
    endTimerRef.current = window.setTimeout(() => {
      if (isBest) {
        sfx.play("newBest");
        particlesRef.current?.celebrate();
      } else {
        sfx.play("gameOver");
      }
    }, 400);
  }, [setPhase]);

  const resolveStop = useCallback(() => {
    if (phaseRef.current !== "playing") return;

    const now = performance.now();
    const sim = simRef.current;
    if (now < sim.lockUntil) return;
    sim.lockUntil = now + HIT_LOCK_MS;

    const verdict = judge(sim.pos, roundRef.current);

    if (!verdict.hit) {
      burstAtIndicator("miss", { count: 30, power: 300 });
      sfx.play("miss");
      shakeCard();
      endRun();
      return;
    }

    scoreRef.current += POINTS[verdict.kind];
    setScore(scoreRef.current);

    levelRef.current += 1;
    const nextLevel = levelRef.current;
    setLevel(nextLevel);
    if (nextLevel === 16 || nextLevel === 26) {
      const theme = nextLevel === 16 ? "orange" : "red";
      setAnnounce({ id: now, level: nextLevel, ...THEME_ANNOUNCEMENT[theme] });
    }

    setFeedback({
      id: now,
      label: VERDICT_LABEL[verdict.kind],
      kind: verdict.kind,
      pos: Math.min(88, Math.max(12, sim.pos)),
    });

    burstAtIndicator(verdict.kind, {
      ...(verdict.kind === "perfect"
        ? { count: 44, power: 430 }
        : { count: 26, power: 330 }),
    });
    sfx.play(verdict.kind === "perfect" ? "perfect" : "hit", scoreRef.current);

    const next = nextRound(nextLevel, sim.pos);
    roundRef.current = next;
    setRound(next);
    sim.speed = speedForLevel(nextLevel);
  }, [burstAtIndicator, endRun, shakeCard]);

  const startRun = useCallback(() => {
    if (endTimerRef.current) window.clearTimeout(endTimerRef.current);

    const opening = openingRound();
    roundRef.current = opening;
    setRound(opening);

    const pos = openingPos(opening);
    const sim = simRef.current;
    sim.pos = pos;
    sim.dir = Math.random() < 0.5 ? -1 : 1;
    sim.speed = speedForLevel(1);
    sim.lockUntil = performance.now() + RUN_START_LOCK_MS;
    if (indicatorRef.current) {
      indicatorRef.current.style.left = `${pos}%`;
    }

    scoreRef.current = 0;
    setScore(0);
    levelRef.current = 1;
    setLevel(1);
    setFeedback(null);
    setAnnounce(null);
    setNewBest(false);
    setAdNote(null);
    setPhase("playing");
    pokiGameplayStart();
    sfx.play("start");
  }, [setPhase]);

  // Resume after a rewarded ad: keep score/level, only reset the playfield.
  const resumeRun = useCallback(() => {
    if (endTimerRef.current) window.clearTimeout(endTimerRef.current);

    const opening = openingRound();
    roundRef.current = opening;
    setRound(opening);

    const pos = openingPos(opening);
    const sim = simRef.current;
    sim.pos = pos;
    sim.dir = Math.random() < 0.5 ? -1 : 1;
    sim.speed = speedForLevel(levelRef.current);
    sim.lockUntil = performance.now() + RUN_START_LOCK_MS;
    if (indicatorRef.current) {
      indicatorRef.current.style.left = `${pos}%`;
    }

    setFeedback(null);
    setAnnounce(null);
    setNewBest(false);
    setPhase("playing");
    pokiGameplayStart();
    sfx.play("start");
  }, [setPhase]);

  // Rewarded continue: mute audio and lock every control while the ad
  // plays; the run resumes only when the SDK confirms the reward.
  const continueRun = useCallback(async () => {
    if (adBusyRef.current || phaseRef.current !== "over") return;
    adBusyRef.current = true;
    setAdBusy(true);
    setAdNote(null);

    const wasMuted = sfx.muted;
    sfx.muted = true;
    music.setMuted(true);

    let granted = false;
    let reason: string | undefined;
    try {
      const result = await showRewardedAd();
      granted = result.success;
      reason = result.reason;
    } finally {
      sfx.muted = wasMuted;
      music.setMuted(wasMuted);
      adBusyRef.current = false;
      setAdBusy(false);
    }

    if (granted) {
      if (phaseRef.current === "over") resumeRun();
      return;
    }

    // No reward. Local dev shows why; on the Poki platform their SDK
    // owns player-facing ad messaging, so we stay silent there.
    if (isLocalDev()) {
      setAdNote(
        reason === "unavailable"
          ? "Ads unavailable"
          : "Ad not watched — no reward",
      );
    }
  }, [resumeRun]);

  const goHome = useCallback(() => {
    if (endTimerRef.current) window.clearTimeout(endTimerRef.current);

    const opening = openingRound();
    roundRef.current = opening;
    setRound(opening);

    const pos = openingPos(opening);
    simRef.current.pos = pos;
    simRef.current.dir = Math.random() < 0.5 ? -1 : 1;
    simRef.current.speed = speedForLevel(1);
    simRef.current.lockUntil = 0;
    if (indicatorRef.current) {
      indicatorRef.current.style.left = `${pos}%`;
    }

    scoreRef.current = 0;
    setScore(0);
    levelRef.current = 1;
    setLevel(1);
    setFeedback(null);
    setAnnounce(null);
    setNewBest(false);
    setAdNote(null);
    setPhase("home");
    pokiGameplayStop();
    sfx.play("click");
  }, [setPhase]);

  const toggleMute = useCallback(() => {
    const next = !readMuted();
    writeMuted(next);
    const effective = next || isPlatformMuted();
    sfx.muted = effective;
    music.setMuted(effective);
    setMuted(effective);
    if (!effective) sfx.play("click");
  }, []);

  const handleTrackPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (phaseRef.current !== "playing") return;
      event.preventDefault();
      resolveStop();
    },
    [resolveStop],
  );

  // Keyboard controls.
  useEffect(() => {
    if (screen !== "playing") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code !== "Space" && event.code !== "Enter") return;
      event.preventDefault();
      resolveStop();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen, resolveStop]);

  /* -------------------------------- render -------------------------------- */

  return (
    <section
      aria-label="Perfect Stop game"
      className="w-full max-w-2xl"
      id="game"
    >
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-[34px] border-[3px] border-[var(--ps-card-border)] bg-[var(--ps-card)] p-4 shadow-[0_16px_0_var(--ps-card-hard),0_40px_70px_-30px_var(--ps-card-shadow)] backdrop-blur-xl sm:p-6"
      >
        <ParticleLayer ref={particlesRef} />

        {/* background environment blobs behind the playfield */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <div className="ps-bg-blob a" />
          <div className="ps-bg-blob b" />
          <div className="ps-bg-blob c" />
        </div>

        <div className={`relative z-10 flex flex-col gap-4 sm:gap-5 ${screen === "skins" ? "invisible pointer-events-none" : ""}`}>
          {/* HUD */}
          <div className="flex items-center justify-between gap-3">
            <div className="ps-chip">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ps-card-faint)]">
                Score
              </span>
              <span
                key={score}
                className="animate-ps-bump inline-block text-2xl font-bold tabular-nums text-[var(--ps-card-accent)]"
              >
                {score}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="ps-chip">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ps-card-faint)]">
                  Best
                </span>
                <span className="text-2xl font-bold tabular-nums text-[var(--ps-card-ink)]">
                  {best}
                </span>
              </div>
              <button
                type="button"
                onClick={toggleMute}
                disabled={adBusy}
                aria-label={muted ? "Unmute sounds" : "Mute sounds"}
                className="ps-chip cursor-pointer px-3 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <SoundIcon muted={muted} />
              </button>
            </div>
          </div>

          {/* Playfield + overlays */}
          <div className="relative flex flex-1 flex-col">
            <div className="relative flex flex-1 items-center">
              <div className="relative w-full">
                <div
                  ref={trackRef}
                  onPointerDown={handleTrackPointer}
                  className="relative h-24 w-full cursor-pointer touch-none select-none overflow-hidden rounded-[24px] border-4 border-[var(--ps-track-border)] bg-[var(--ps-track-bg)] shadow-[inset_0_5px_0_var(--ps-chip-shadow)] sm:h-28"
                >
                  {/* track rails — subtle parallel lines that sell speed */}
                  <div className="ps-track-stripes absolute inset-0 rounded-[20px] opacity-50 pointer-events-none" />
                  {/* current level — compact pill so the HUD stays one row */}
                  {screen === "playing" && (
                    <div className="absolute bottom-1.5 left-2 z-40 rounded-full border border-[var(--ps-chip-border)] bg-[var(--ps-chip-bg)] px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-[var(--ps-card-soft)] uppercase backdrop-blur">
                      Lv {level}
                    </div>
                  )}
                  {/* target zone */}
                  <div
                    key={`${round.zoneStart}:${round.zoneWidth}`}
                    style={{
                      left: `${round.zoneStart}%`,
                      width: `${round.zoneWidth}%`,
                    }}
                    className="animate-ps-zone absolute inset-y-1.5 origin-center rounded-[16px] border-2 border-[var(--ps-accent)]/70 bg-[var(--ps-accent)]/40 shadow-[0_0_26px_rgba(124,58,237,0.45)]"
                  >
                    <div className="absolute inset-0 rounded-[14px] border-2 border-dashed border-white/80" />
                    <div className="absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2 rounded-full bg-[var(--ps-accent)]/80" />
                  </div>

                  {/* moving indicator */}
                  <div
                    ref={indicatorRef}
                    className="absolute inset-y-0 left-0 w-0"
                  >
                    <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2">
                      <PointerArt id={selectedSkin} box={84} htmlText={htmlText} />
                    </div>
                  </div>

                  {/* verdict label */}
                  {feedback && (
                    <div
                      key={feedback.id}
                      style={{ left: `clamp(15%, ${feedback.pos}%, 85%)` }}
                      className={`absolute top-2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border-2 px-3 py-1 text-[11px] font-bold uppercase tracking-wider shadow-lg ${FEEDBACK_STYLE[feedback.kind]} animate-ps-fb-${feedback.kind}`}
                    >
                      {feedback.label}
                      {POINTS[feedback.kind] > 0 && (
                        <span className="ml-1 opacity-90">
                          +{POINTS[feedback.kind]}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* controls — fixed height keeps the card stable across screens */}
            <div className="ps-controls flex h-[104px] flex-col items-center justify-center gap-2">
              {screen === "playing" ? (
                <>
                  <button
                    type="button"
                    onClick={resolveStop}
                    className="ps-btn ps-btn-sun min-w-[210px] text-xl"
                  >
                    STOP
                  </button>
                  <p className="text-xs font-medium text-[var(--ps-card-soft)]">
                    press{" "}
                    <kbd className="rounded-md border border-[var(--ps-chip-border)] bg-[var(--ps-track-bg)] px-1.5 py-0.5 font-sans text-[11px] font-bold text-[var(--ps-card-soft)]">
                      Space
                    </kbd>{" "}
                    or tap the track
                  </p>
                </>
              ) : null}
            </div>

            {/* home screen */}
            {screen === "home" && (
              <div className="ps-panel animate-ps-pop absolute inset-0 z-20 flex flex-col items-center justify-center gap-4">
                <span className="rounded-full bg-[var(--ps-accent-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ps-card-accent)]">
                  Reflex arcade
                </span>
                <h2 className="text-2xl font-bold text-[var(--ps-card-ink)] sm:text-3xl">
                  Stop inside the zone
                </h2>
                <ul className="flex max-w-sm flex-wrap items-center justify-center gap-2 text-[11px] font-semibold text-[var(--ps-card-soft)]">
                  <li className="ps-chip !py-1.5 !text-[11px]">
                    <Dot className="bg-sky" /> Watch the bounce
                  </li>
                  <li className="ps-chip !py-1.5 !text-[11px]">
                    <Dot className="bg-mint-deep" /> Stop in the zone
                  </li>
                  <li className="ps-chip !py-1.5 !text-[11px]">
                    <Dot className="bg-sun-deep" /> Faster every round
                  </li>
                </ul>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setScreen("skins")}
                    className="ps-btn ps-btn-ghost"
                  >
                    Skins
                  </button>
                  <button
                    type="button"
                    onClick={startRun}
                    className="ps-btn ps-btn-primary"
                  >
                    <PlayIcon /> Play
                  </button>
                </div>
                <p className="text-xs font-medium text-[var(--ps-card-faint)]">
                  One miss ends the run — beat your best!
                </p>
              </div>
            )}

            {/* game over screen */}
            {screen === "over" && (
              <div className="ps-panel animate-ps-pop absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
                <h2 className="text-2xl font-bold text-[var(--ps-card-ink)] sm:text-3xl">
                  {newBest ? "New personal best!" : "Run over"}
                </h2>

                <div className="flex items-end justify-center gap-8">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ps-card-faint)]">
                      Score
                    </p>
                    <p className="text-5xl font-bold leading-none text-[var(--ps-card-accent)]">
                      {score}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ps-card-faint)]">
                      Best
                    </p>
                    <p className="text-3xl font-bold leading-none text-[var(--ps-card-soft)]">
                      {best}
                    </p>
                  </div>
                </div>

                {newBest && (
                  <span className="animate-ps-wiggle rounded-full bg-[var(--ps-highlight)] px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--ps-card-ink)] shadow-[0_4px_0_var(--ps-highlight-deep)]">
                    You beat your record
                  </span>
                )}

                <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={startRun}
                    disabled={adBusy}
                    className="ps-btn ps-btn-mint !px-6 !py-3 !text-base disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshIcon /> Play again
                  </button>
                  <button
                    type="button"
                    onClick={goHome}
                    disabled={adBusy}
                    className="ps-btn ps-btn-ghost !px-6 !py-3 !text-base disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Home
                  </button>
                  <button
                    type="button"
                    onClick={continueRun}
                    disabled={adBusy}
                    className="ps-btn ps-btn-ghost ps-continue !gap-1 !px-3 !py-2 !text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <AdIcon />
                    <span className="hidden sm:inline">
                      Watch Ad to Continue
                    </span>
                    <span className="sm:hidden">Watch Ad</span>
                  </button>
                </div>
                {adNote && (
                  <p
                    role="status"
                    className="text-xs font-medium text-[var(--ps-card-faint)]"
                  >
                    {adNote}
                  </p>
                )}
              </div>
            )}

            {/* theme-transition flash + level announcement */}
            {announce && (
              <div
                aria-hidden
                key={`flash-${announce.id}`}
                className="animate-ps-flash pointer-events-none absolute inset-0 z-40 rounded-[26px] bg-[var(--ps-accent)] will-change-opacity"
              />
            )}
            {announce && (
              <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center px-4">
                <div
                  key={announce.id}
                  className="ps-announcement animate-ps-announce will-change-transform rounded-3xl border-4 border-[var(--ps-card-accent)] bg-[var(--ps-overlay-strong)] px-8 py-6 text-center shadow-[0_12px_0_var(--ps-card-hard),0_30px_60px_-24px_var(--ps-card-shadow)]"
                >
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ps-card-faint)]">
                    Level {announce.level}
                  </p>
                  <p className="mt-1 text-3xl font-bold text-[var(--ps-card-accent)] sm:text-4xl">
                    {announce.title}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--ps-card-soft)]">
                    {announce.subtitle}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* skins screen */}
        {screen === "skins" && (
          <div className="ps-panel-skins animate-ps-pop">
            <div className="ps-skins-header">
              <button
                type="button"
                onClick={() => setScreen("home")}
                className="ps-skins-back"
              >
                <span aria-hidden="true">←</span> Back
              </button>
              <h2 className="ps-skins-heading">Skins</h2>
            </div>
            <div className="ps-skins-body">
              <div className="ps-skins-grid">
                {["pointer-1", "pointer-2", "pointer-3", "pointer-4", "pointer-5", "pointer-6", "pointer-7", "pointer-8"].map(
                  (id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setSelectedSkin(id);
                        localStorage.setItem("ps-pointer-skin", id);
                      }}
                      className={`ps-skins-card ${selectedSkin === id ? "is-active" : ""}`}
                    >
                      <div className="ps-skins-preview">
                        <PointerArt id={id} box={44} htmlText={htmlText} />
                      </div>
                      <span className="ps-skins-label">Skin {id.slice(-1)}</span>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------ pointer skins ----------------------------- */

// Three of the supplied assets (pointer-2/3/4) are complete HTML documents,
// not SVG images, so they cannot render inside an <img>. Those are shown in a
// scaled, isolated <iframe>; the rest are drawn with a plain <img>.
const HTML_POINTERS = new Set(["pointer-2", "pointer-3", "pointer-4"]);

// Intrinsic design size of each asset, used to scale it into a fixed box
// while preserving aspect ratio.
const POINTER_NATIVE: Record<string, [number, number]> = {
  "pointer-1": [35, 96],
  "pointer-2": [120, 120],
  "pointer-3": [120, 120],
  "pointer-4": [120, 120],
  "pointer-5": [120, 120],
  "pointer-6": [120, 120],
  "pointer-7": [120, 120],
  "pointer-8": [120, 120],
};

function PointerArt({ id, box, htmlText }: { id: string; box: number; htmlText: Record<string, string> }) {
  const [nw, nh] = POINTER_NATIVE[id] ?? [120, 120];
  const src = `./pointers/${id}.svg`;
  const html = htmlText[id];

  if (HTML_POINTERS.has(id) && html) {
    const scale = Math.min(box / nw, box / nh);
    return (
      <div
        style={{ width: box, height: box }}
        className="pointer-events-none flex items-center justify-center overflow-hidden"
      >
        <iframe
          srcDoc={html}
          title={`Pointer ${id.slice(-1)}`}
          scrolling="no"
          tabIndex={-1}
          aria-hidden
          className="border-0 bg-transparent"
          style={{
            width: nw,
            height: nh,
            flex: "none",
            transform: `scale(${scale})`,
            pointerEvents: "none",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{ width: box, height: box }}
      className="pointer-events-none flex items-center justify-center overflow-hidden"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
      />
    </div>
  );
}

/* --------------------------------- icons --------------------------------- */

function Dot({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${className}`}
    />
  );
}

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="currentColor"
    >
      <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.1-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="currentColor"
    >
      <path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z" />
    </svg>
  );
}

function AdIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Zm7.1.35v11.3a.6.6 0 0 0 .92.51l6.1-5.65a.6.6 0 0 0 0-.92l-6.1-5.65a.6.6 0 0 0-.92.51Z"
      />
    </svg>
  );
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5 text-[var(--ps-card-ink)]"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M11 5 6.5 9H3v6h3.5L11 19V5Z"
        fill="currentColor"
        strokeWidth={0}
      />
      {muted ? (
        <path d="m16 9.5 5 5m0-5-5 5" />
      ) : (
        <>
          <path d="M15.5 9a4.5 4.5 0 0 1 0 6" />
          <path d="M18.5 6.5a8.5 8.5 0 0 1 0 11" />
        </>
      )}
    </svg>
  );
}
