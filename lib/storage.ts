/** Personal best persistence, browser-only. */

const BEST_KEY = "perfect-stop:best";
const MUTE_KEY = "perfect-stop:muted";

function readNumber(key: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(key);
    const value = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* storage unavailable — best simply stays in memory */
  }
}

export function readBest(): number {
  return readNumber(BEST_KEY);
}

export function writeBest(value: number): void {
  writeNumber(BEST_KEY, value);
}

export function readMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}
