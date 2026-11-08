/**
 * Official CrazyGames HTML5 SDK v3 adapter.
 * Docs: https://docs.crazygames.com/sdk/intro/
 *
 * Loading order: inject `crazygames-sdk-v3.js` → `await SDK.init()` →
 * read `SDK.environment` → use `ad.requestAd` / `game.*`. The SDK is
 * unusable until init resolves, and every method call on the `disabled`
 * environment throws, so that state is gated before any call.
 *
 * Reward policy: for `rewarded`, `adFinished` is the provider's
 * completion signal (official docs: "give reward here"); `adError`,
 * timeout, or a thrown call never grants.
 *
 * On the `local` environment (localhost / `?useLocalSdk=true`) the SDK
 * only shows a demo overlay — ads are reported unavailable there so a
 * local session never fabricates a successful ad.
 */

import type {
  AdResult,
  CrazyGamesAdType,
  CrazyGamesSDKLike,
  PlatformAdapter,
  PlatformHooks,
} from "../types";

const SCRIPT_URL = "https://sdk.crazygames.com/crazygames-sdk-v3.js";
const INIT_TIMEOUT_MS = 10000;
const AD_TIMEOUT_MS = 60000;

function sdkOf(): CrazyGamesSDKLike | null {
  if (typeof window === "undefined") return null;
  return window.CrazyGames?.SDK ?? null;
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

function reasonOf(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code) return code;
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  if (typeof error === "string" && error) return error;
  return "error";
}

export function createCrazyGamesAdapter(): PlatformAdapter {
  let environment = "";
  let gameplayActive = false;

  const requestAd = (type: CrazyGamesAdType): Promise<AdResult> => {
    const client = sdkOf();
    if (!client?.ad?.requestAd) {
      return Promise.resolve({ success: false, reason: "unavailable" });
    }
    if (environment === "disabled" || environment === "local") {
      return Promise.resolve({ success: false, reason: "unavailable" });
    }

    const requestAd = client.ad.requestAd.bind(client.ad);
    return new Promise<AdResult>((resolve) => {
      let settled = false;
      const finish = (result: AdResult) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(result);
      };
      const timer = window.setTimeout(
        () => finish({ success: false, reason: "timeout" }),
        AD_TIMEOUT_MS,
      );

      try {
        requestAd(type, {
          adStarted: () => {
            /* the game mutes/pauses itself around the ad request */
          },
          adError: (error) => finish({ success: false, reason: reasonOf(error) }),
          adFinished: () => finish({ success: true }),
        });
      } catch (error) {
        finish({ success: false, reason: reasonOf(error) });
      }
    });
  };

  return {
    id: "crazygames",
    scriptUrl: SCRIPT_URL,
    isPresent: () => Boolean(sdkOf()),

    async initialize(hooks: PlatformHooks) {
      const client = sdkOf();
      if (!client) return false;

      try {
        client.game?.loadingStart?.();
      } catch {
        /* ignore */
      }

      try {
        await withTimeout(Promise.resolve(client.init()), INIT_TIMEOUT_MS);
      } catch {
        try {
          client.game?.loadingStop?.();
        } catch {
          /* ignore */
        }
        return false;
      }

      environment = client.environment ?? "";
      if (environment === "disabled") {
        try {
          client.game?.loadingStop?.();
        } catch {
          /* ignore */
        }
        return false;
      }

      try {
        const game = client.game;
        const notify = (muteAudio: boolean | undefined) =>
          hooks.onPlatformMute?.(muteAudio === true);
        if (game?.addSettingsChangeListener) {
          game.addSettingsChangeListener((settings) => notify(settings?.muteAudio));
          notify(game.settings?.muteAudio);
        }
      } catch {
        /* ignore */
      }

      try {
        client.game?.loadingStop?.();
      } catch {
        /* ignore */
      }
      return true;
    },

    gameplayStart() {
      const client = sdkOf();
      if (!client?.game?.gameplayStart || gameplayActive) return;
      gameplayActive = true;
      try {
        client.game.gameplayStart();
      } catch {
        /* never block the game on the SDK */
      }
    },

    gameplayStop() {
      const client = sdkOf();
      if (!client?.game?.gameplayStop || !gameplayActive) return;
      gameplayActive = false;
      try {
        client.game.gameplayStop();
      } catch {
        /* never block the game on the SDK */
      }
    },

    rewardedAd() {
      return requestAd("rewarded");
    },

    interstitialAd() {
      return requestAd("midgame");
    },

    pauseGame() {},
    resumeGame() {},
  };
}
