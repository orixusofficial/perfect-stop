/**
 * Pure game rules for Perfect Stop.
 * Everything here is deterministic math — no DOM, no React, easy to test.
 */

/** Track coordinate space: 0 = left edge, 100 = right edge. */
export const TRACK_START = 0;
export const TRACK_END = 100;

/**
 * Difficulty is keyed to the level (= successful stops in the run), not the
 * score, so theme/level announcements always land on every integer level.
 *
 * Phases (continuous piecewise curves — no spikes at the boundaries):
 *   L1–5   very easy  — large zone, slow drift
 *   L6–10  easy       — slightly faster
 *   L11–15 beginner+  — progressively challenging but reachable
 *   L16–25 ramp       — steady speed-up and shrink
 *   L26+   hard mode  — steeper ramp, small zone, capped
 */
export const MAX_SPEED = 155; // percent of track per second
export const MIN_ZONE_WIDTH = 9; // percent of track

export type GameTheme = "playful" | "orange" | "red";

/** Visual theme for a given level. */
export function themeForLevel(level: number): GameTheme {
  if (level >= 26) return "red";
  if (level >= 16) return "orange";
  return "playful";
}

/** Gap (percent) kept between a fresh zone and the indicator. */
const ZONE_SPACING = 14;
const EDGE_MARGIN = 4;

export type Round = {
  /** Left edge of the target zone, in track percent. */
  zoneStart: number;
  /** Width of the target zone, in track percent. */
  zoneWidth: number;
};

export type Verdict = {
  hit: boolean;
  kind: "perfect" | "great" | "good" | "miss";
  /** 1 = dead centre of the zone, 0 = zone edge. */
  precision: number;
};

/** Indicator speed (track %/s) for a level. Continuous across phase bounds. */
export function speedForLevel(level: number): number {
  const l = Math.max(1, level);
  let speed: number;
  if (l <= 5) speed = 44 + 2.0 * (l - 1); //        L1–5   44 → 52
  else if (l <= 10) speed = 52 + 2.2 * (l - 5); //  L6–10  52 → 63
  else if (l <= 15) speed = 63 + 2.6 * (l - 10); // L11–15 63 → 76
  else if (l <= 25) speed = 76 + 3.2 * (l - 15); // L16–25 76 → 108
  else speed = 108 + 4.0 * (l - 25); //             L26+   108 → cap
  return Math.min(MAX_SPEED, speed);
}

/** Target zone width (track %) for a level. Continuous across phase bounds. */
export function zoneWidthForLevel(level: number): number {
  const l = Math.max(1, level);
  let width: number;
  if (l <= 5) width = 32 - 1.0 * (l - 1); //        L1–5   32 → 28
  else if (l <= 10) width = 28 - 0.8 * (l - 5); //  L6–10  28 → 24
  else if (l <= 15) width = 24 - 1.0 * (l - 10); // L11–15 24 → 19
  else if (l <= 25) width = 19 - 0.5 * (l - 15); // L16–25 19 → 14
  else width = 14 - 0.45 * (l - 25); //             L26+   14 → floor
  return Math.max(MIN_ZONE_WIDTH, width);
}

/** Judge a stop position against the current round. */
export function judge(pos: number, round: Round): Verdict {
  const center = round.zoneStart + round.zoneWidth / 2;
  const half = round.zoneWidth / 2;
  const distance = Math.abs(pos - center);

  if (distance > half) {
    return { hit: false, kind: "miss", precision: 0 };
  }

  const precision = 1 - distance / half;
  const kind =
    precision > 0.8 ? "perfect" : precision > 0.5 ? "great" : "good";
  return { hit: true, kind, precision };
}

/** Spawn the next target zone, comfortably away from the indicator. */
export function nextRound(level: number, fromPos: number): Round {
  const zoneWidth = zoneWidthForLevel(level);
  const minStart = EDGE_MARGIN;
  const maxStart = TRACK_END - zoneWidth - EDGE_MARGIN;

  let zoneStart = minStart;
  for (let attempt = 0; attempt < 24; attempt++) {
    zoneStart = minStart + Math.random() * (maxStart - minStart);
    const center = zoneStart + zoneWidth / 2;
    if (Math.abs(center - fromPos) > zoneWidth / 2 + ZONE_SPACING) break;
  }

  return { zoneStart, zoneWidth };
}

/** A starting zone for a fresh run (level 1). */
export function openingRound(): Round {
  return nextRound(1, TRACK_END / 2);
}

/** Random indicator position that is never already inside a zone. */
export function openingPos(round: Round): number {
  const center = round.zoneStart + round.zoneWidth / 2;
  for (let attempt = 0; attempt < 24; attempt++) {
    const pos = 6 + Math.random() * 88;
    if (Math.abs(pos - center) > round.zoneWidth / 2 + 18) return pos;
  }
  return center < 50 ? 90 : 10;
}

export const VERDICT_LABEL: Record<Verdict["kind"], string> = {
  perfect: "PERFECT!",
  great: "GREAT!",
  good: "NICE!",
  miss: "MISS!",
};

/** Points awarded for each successful stop. */
export const POINTS: Record<Verdict["kind"], number> = {
  perfect: 2,
  great: 1,
  good: 1,
  miss: 0,
};
