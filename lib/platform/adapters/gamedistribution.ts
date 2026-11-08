/**
 * GameDistribution — detected but not integrated yet.
 *
 * The platform is recognized by its official domains so a session hosted
 * there never falls through to another provider's SDK; until the official
 * SDK adapter is implemented, every ad call fails closed as unavailable.
 */

import type { AdResult, PlatformAdapter } from "../types";

const UNAVAILABLE: AdResult = { success: false, reason: "unavailable" };

export function createGameDistributionAdapter(): PlatformAdapter {
  return {
    id: "gamedistribution",
    isPresent: () => false,
    async initialize() {
      return false;
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
