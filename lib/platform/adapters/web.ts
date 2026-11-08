/** Generic web / local development — no advertising SDK, no ads. */

import type { AdResult, PlatformAdapter } from "../types";

const UNAVAILABLE: AdResult = { success: false, reason: "unavailable" };

export function createWebAdapter(): PlatformAdapter {
  return {
    id: "web",
    isPresent: () => true,
    async initialize() {
      return true;
    },
    gameplayStart() {},
    gameplayStop() {},
    async rewardedAd() {
      return UNAVAILABLE;
    },
    async interstitialAd() {
      return UNAVAILABLE;
    },
    pauseGame() {},
    resumeGame() {},
  };
}
