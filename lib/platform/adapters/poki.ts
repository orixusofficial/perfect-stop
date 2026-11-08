/**
 * Official Poki HTML5 SDK adapter.
 *
 * Preserves the original integration: `init()` with a timeout, a single
 * `gameLoadingFinished()` after init, guarded `gameplayStart/Stop` events,
 * and `rewardedBreak()` — its boolean is the only source of truth for the
 * reward; a skipped/failed/blocked ad never grants.
 */

import type { AdResult, PlatformAdapter } from "../types";

const INIT_TIMEOUT_MS = 10000;
const SCRIPT_URL = "https://game-cdn.poki.com/scripts/v2/poki-sdk.js";

function pokiWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function createPokiAdapter(): PlatformAdapter {
  let gameplayActive = false;

  const sdk = () => pokiWindow()?.PokiSDK ?? null;

  return {
    id: "poki",
    scriptUrl: SCRIPT_URL,
    isPresent: () => Boolean(pokiWindow()?.PokiSDK),

    async initialize() {
      const client = sdk();
      if (!client) return false;
      if (!client.init) return true;
      try {
        await withTimeout(Promise.resolve(client.init()), INIT_TIMEOUT_MS);
        return true;
      } catch {
        return false;
      }
    },

    gameplayStart() {
      const client = sdk();
      if (!client?.gameplayStart || gameplayActive) return;
      gameplayActive = true;
      try {
        client.gameplayStart();
      } catch {
        /* never block the game on the SDK */
      }
    },

    gameplayStop() {
      const client = sdk();
      if (!client?.gameplayStop || !gameplayActive) return;
      gameplayActive = false;
      try {
        client.gameplayStop();
      } catch {
        /* never block the game on the SDK */
      }
    },

    async rewardedAd(): Promise<AdResult> {
      const client = sdk();
      if (!client?.rewardedBreak) return { success: false, reason: "unavailable" };
      try {
        const success = await client.rewardedBreak();
        return success === true
          ? { success: true }
          : { success: false, reason: "not-completed" };
      } catch (error) {
        return {
          success: false,
          reason: error instanceof Error ? error.message : "error",
        };
      }
    },

    async interstitialAd(): Promise<AdResult> {
      // No midgame API is wired for Poki yet; fail closed instead of
      // inventing an untested call on the production platform.
      return { success: false, reason: "unsupported" };
    },

    pauseGame() {},
    resumeGame() {},

    loadingFinished() {
      try {
        sdk()?.gameLoadingFinished?.();
      } catch {
        /* never block the game on the SDK */
      }
    },
  };
}
