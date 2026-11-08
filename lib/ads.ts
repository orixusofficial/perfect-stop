/**
 * Advertising facade used by the game.
 *
 * Delegates to the platform manager (`lib/platform/`), which detects the
 * hosting environment and routes to exactly one adapter. The exported
 * names keep the original API so game components do not change:
 *
 * - `showRewardedAd()` resolves `success: true` only when the provider
 *   confirms the reward (Poki's `rewardedBreak()` boolean, CrazyGames'
 *   `adFinished`); a skipped/failed/blocked/local ad never grants.
 * - `pokiBoot` / `pokiGameplayStart` / `pokiGameplayStop` emit the
 *   lifecycle events of the detected platform, guarded against double
 *   fires — on non-Poki platforms they drive that platform's SDK instead.
 * - Local development never drives a real ad SDK.
 */

import { isLocalDev } from "./platform/detect";
import { platformManager } from "./platform/manager";

export type RewardedAdResult = {
  success: boolean;
  reason?: string;
};

export { isLocalDev };

/** Fire once at boot: init the detected platform SDK, then signal loaded. */
export function pokiBoot(): void {
  platformManager.boot();
}

export function pokiGameplayStart(): void {
  platformManager.gameplayStart();
}

export function pokiGameplayStop(): void {
  platformManager.gameplayStop();
}

/** True when the detected platform is expected to serve rewarded ads. */
export function hasRewardedAd(): boolean {
  return platformManager.hasRewardedAd();
}

/**
 * Show a rewarded ad. Resolves `success: true` only when the provider
 * confirms the reward. Missing SDK (including localhost), skipped or
 * failed ads resolve `success: false` — this never fabricates a reward.
 */
export async function showRewardedAd(): Promise<RewardedAdResult> {
  return platformManager.rewardedAd();
}

/** Show a midgame/interstitial ad; `success` means the ad completed. */
export async function showInterstitialAd(): Promise<RewardedAdResult> {
  return platformManager.interstitialAd();
}

/** Platform-driven audio mute (e.g. CrazyGames `settings.muteAudio`). */
export function isPlatformMuted(): boolean {
  return platformManager.isPlatformMuted();
}

export function subscribePlatformMute(
  listener: (muted: boolean) => void,
): () => void {
  return platformManager.subscribePlatformMute(listener);
}
