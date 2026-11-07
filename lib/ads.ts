/**
 * Rewarded ads through the official Poki HTML5 SDK, with fallbacks for
 * other portals.
 *
 * Poki: `PokiSDK.rewardedBreak()` resolves `true` only when the viewer
 * watched the full video — that boolean is the single source of truth
 * for granting the reward, and a skipped/failed/blocked ad never grants.
 * Local development never drives the SDK: outside the Poki platform
 * `rewardedBreak()` never settles, so localhost reports ads as
 * unavailable instead of hanging the UI.
 *
 * The lifecycle helpers (`pokiBoot`, `pokiGameplayStart/Stop`) emit the
 * SDK events the Poki Inspector verifies, guarding against double fires.
 */

export type RewardedAdResult = {
  success: boolean;
  reason?: string;
};

type PokiSDKLike = {
  init?: () => Promise<unknown>;
  rewardedBreak?: (onStart?: () => void) => Promise<boolean>;
  gameLoadingFinished?: () => void;
  gameplayStart?: () => void;
  gameplayStop?: () => void;
};

type RewardedAdWindow = Window & {
  PokiSDK?: PokiSDKLike;
  CrazyGames?: {
    SDK?: {
      rewardedAd?: {
        show?: () => Promise<{ status?: string }>;
      };
    };
  };
  ysdk?: {
    adv?: {
      showRewardedVideo?: (options: {
        callbacks?: {
          onOpen?: () => void;
          onRewarded?: () => void;
          onClose?: () => void;
          onError?: (error?: unknown) => void;
        };
      }) => void;
    };
  };
  showRewardedAd?: () => Promise<boolean>;
};

const INIT_TIMEOUT_MS = 10000;

function adWindow(): RewardedAdWindow | null {
  return typeof window === "undefined" ? null : (window as RewardedAdWindow);
}

/** True on a local dev origin; the Poki SDK is never driven there. */
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

/** The Poki SDK when it may be used: loaded and not on a local origin. */
function poki(): PokiSDKLike | null {
  const w = adWindow();
  if (!w || isLocalDev()) return null;
  return w.PokiSDK ?? null;
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

/**
 * Initialise the SDK once (cached). Resolves false when the SDK is
 * absent, init fails, or init never settles — callers must then treat
 * ads as unavailable rather than risk a hung rewardedBreak().
 */
let initPromise: Promise<boolean> | null = null;

function ensurePokiInit(): Promise<boolean> {
  if (initPromise) return initPromise;
  const sdk = poki();
  if (!sdk) return Promise.resolve(false);
  if (!sdk.init) return Promise.resolve(true);
  const pending = (async () => {
    try {
      await withTimeout(Promise.resolve(sdk.init!()), INIT_TIMEOUT_MS);
      return true;
    } catch {
      return false;
    }
  })();
  // Cache success; let a failed init retry on the next ad request.
  initPromise = pending.then((ok) => {
    if (!ok) initPromise = null;
    return ok;
  });
  return initPromise;
}

/** Fire once at boot: init the SDK, then signal the game finished loading. */
let booted = false;

export function pokiBoot(): void {
  if (booted || isLocalDev()) return;
  booted = true;
  void ensurePokiInit().then(() => {
    try {
      poki()?.gameLoadingFinished?.();
    } catch {
      /* never block the game on the SDK */
    }
  });
}

// Guard so gameplayStart/gameplayStop never fire twice in a row — the
// Poki requirements reject consecutive duplicate events.
let gameplayActive = false;

export function pokiGameplayStart(): void {
  const sdk = poki();
  if (!sdk?.gameplayStart || gameplayActive) return;
  gameplayActive = true;
  try {
    sdk.gameplayStart();
  } catch {
    /* ignore SDK errors */
  }
}

export function pokiGameplayStop(): void {
  const sdk = poki();
  if (!sdk?.gameplayStop || !gameplayActive) return;
  gameplayActive = false;
  try {
    sdk.gameplayStop();
  } catch {
    /* ignore SDK errors */
  }
}

/** True when at least one supported provider is present and usable. */
export function hasRewardedAd(): boolean {
  const w = adWindow();
  if (!w) return false;
  return Boolean(
    poki()?.rewardedBreak ||
      w.CrazyGames?.SDK?.rewardedAd?.show ||
      w.ysdk?.adv?.showRewardedVideo ||
      w.showRewardedAd,
  );
}

/**
 * Show a rewarded ad. Resolves `success: true` only when the provider
 * confirms the reward: Poki's `rewardedBreak()` boolean is authoritative.
 * Missing SDK (including localhost), skipped or failed ads resolve
 * `success: false` — this never fabricates a reward.
 */
export async function showRewardedAd(): Promise<RewardedAdResult> {
  const w = adWindow();
  if (!w) return { success: false, reason: "unavailable" };

  try {
    const pokiAd = poki();
    if (pokiAd?.rewardedBreak) {
      const ready = await ensurePokiInit();
      if (!ready) return { success: false, reason: "unavailable" };
      const success = await pokiAd.rewardedBreak();
      return success === true
        ? { success: true }
        : { success: false, reason: "not-completed" };
    }

    if (w.CrazyGames?.SDK?.rewardedAd?.show) {
      const result = await w.CrazyGames.SDK.rewardedAd.show();
      return result?.status === "done"
        ? { success: true }
        : { success: false, reason: result?.status ?? "not-completed" };
    }

    const ysdk = w.ysdk;
    if (ysdk?.adv?.showRewardedVideo) {
      const show = ysdk.adv.showRewardedVideo;
      return await new Promise<RewardedAdResult>((resolve) => {
        let granted = false;
        let settled = false;
        const finish = (reason: string) => {
          if (settled) return;
          settled = true;
          resolve(granted ? { success: true } : { success: false, reason });
        };
        show({
          callbacks: {
            onRewarded: () => {
              granted = true;
            },
            onClose: () => finish("closed"),
            onError: () => finish("error"),
          },
        });
      });
    }

    if (w.showRewardedAd) {
      const success = await w.showRewardedAd();
      return success
        ? { success: true }
        : { success: false, reason: "not-completed" };
    }
  } catch (error) {
    return {
      success: false,
      reason: error instanceof Error ? error.message : "error",
    };
  }

  return { success: false, reason: "unavailable" };
}
