/**
 * Hosting-platform detection.
 *
 * Signals, in order:
 *   1. `?platform=` override — honored only on a local dev origin, never
 *      as a sole production identifier.
 *   2. Local development → web (no real ad SDK is ever driven).
 *   3. Official domain signals on the page itself, its referrer, or its
 *      parent frame (poki → crazygames → gamedistribution → gamepix).
 *   4. SDK globals already injected by the host.
 *   5. Fallback → web.
 *
 * Exactly one platform is chosen per session; adapters are never stacked.
 */

import type { PlatformId } from "./types";

const POKI_DOMAINS = ["poki.com", "poki.io", "poki-games.com"];
const CRAZY_DOMAINS = ["crazygames.com"];
const GAMEDISTRIBUTION_DOMAINS = ["gamedistribution.com"];
const GAMEPIX_DOMAINS = ["gamepix.com"];

const PLATFORM_IDS: readonly PlatformId[] = [
  "poki",
  "crazygames",
  "gamedistribution",
  "gamepix",
  "web",
];

/** True on a local dev origin; ad SDKs are never driven there. */
export function isLocalDev(): boolean {
  if (typeof window === "undefined") return true;
  const host = window.location?.hostname ?? "";
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === ""
  );
}

function hostnameOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function matchesDomain(host: string, domains: readonly string[]): boolean {
  if (!host) return false;
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function parentHostname(): string {
  try {
    if (window.parent && window.parent !== window) {
      return window.parent.location.hostname.toLowerCase();
    }
  } catch {
    /* cross-origin parent — not readable, not an error */
  }
  return "";
}

/** Dev-only platform override; ignored on any production origin. */
function forcedPlatform(): PlatformId | null {
  if (typeof window === "undefined" || !isLocalDev()) return null;
  try {
    const value = new URLSearchParams(window.location.search).get("platform");
    if (value && (PLATFORM_IDS as readonly string[]).includes(value)) {
      return value as PlatformId;
    }
  } catch {
    /* ignore malformed URLs */
  }
  return null;
}

export function detectPlatform(): PlatformId {
  if (typeof window === "undefined") return "web";

  const forced = forcedPlatform();
  if (forced) return forced;
  if (isLocalDev()) return "web";

  const hosts = [
    window.location?.hostname?.toLowerCase() ?? "",
    hostnameOf(document.referrer),
    parentHostname(),
  ];

  if (hosts.some((host) => matchesDomain(host, POKI_DOMAINS))) return "poki";
  if (hosts.some((host) => matchesDomain(host, CRAZY_DOMAINS))) return "crazygames";
  if (hosts.some((host) => matchesDomain(host, GAMEDISTRIBUTION_DOMAINS))) {
    return "gamedistribution";
  }
  if (hosts.some((host) => matchesDomain(host, GAMEPIX_DOMAINS))) return "gamepix";

  if (window.CrazyGames?.SDK) return "crazygames";
  if (window.PokiSDK) return "poki";

  return "web";
}
