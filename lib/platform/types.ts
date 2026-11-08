/** Universal platform SDK types shared by every adapter. */

export type PlatformId =
  | "poki"
  | "crazygames"
  | "gamedistribution"
  | "gamepix"
  | "web";

export type AdResult = {
  success: boolean;
  reason?: string;
};

/** Callbacks the manager hands to an adapter during initialize(). */
export type PlatformHooks = {
  /** Report platform-driven audio mute (e.g. CrazyGames `settings.muteAudio`). */
  onPlatformMute?: (muted: boolean) => void;
};

export type PokiSDKLike = {
  init?: () => Promise<unknown>;
  rewardedBreak?: (onStart?: () => void) => Promise<boolean>;
  gameLoadingFinished?: () => void;
  gameplayStart?: () => void;
  gameplayStop?: () => void;
};

export type CrazyGamesAdType = "midgame" | "rewarded";

export type CrazyGamesAdCallbacks = {
  adStarted?: () => void;
  adError?: (error: unknown) => void;
  adFinished?: () => void;
};

export type CrazyGamesSettings = {
  disableChat?: boolean;
  muteAudio?: boolean;
};

/** HTML5 CrazyGames SDK v3 surface (https://docs.crazygames.com/sdk/intro/). */
export type CrazyGamesSDKLike = {
  init: () => Promise<void>;
  /** "local" | "crazygames" | "disabled" */
  environment?: string;
  ad?: {
    requestAd?: (type: CrazyGamesAdType, callbacks?: CrazyGamesAdCallbacks) => void;
  };
  game?: {
    gameplayStart?: () => void;
    gameplayStop?: () => void;
    loadingStart?: () => void;
    loadingStop?: () => void;
    settings?: CrazyGamesSettings;
    addSettingsChangeListener?: (listener: (settings: CrazyGamesSettings) => void) => void;
    removeSettingsChangeListener?: (listener: (settings: CrazyGamesSettings) => void) => void;
  };
};

declare global {
  interface Window {
    PokiSDK?: PokiSDKLike;
    CrazyGames?: { SDK?: CrazyGamesSDKLike };
  }
}

/**
 * One hosting platform. Implement only what the provider's official SDK
 * supports; unsupported calls must fail closed (never fabricate a reward).
 */
export type PlatformAdapter = {
  readonly id: PlatformId;
  /** SDK script to inject when the global is not already present. */
  readonly scriptUrl?: string;
  /** True when the platform's SDK global is already on the page. */
  isPresent(): boolean;
  /** Async SDK setup; resolves false when the platform is unusable. */
  initialize(hooks: PlatformHooks): Promise<boolean>;
  gameplayStart(): void;
  gameplayStop(): void;
  rewardedAd(): Promise<AdResult>;
  interstitialAd(): Promise<AdResult>;
  pauseGame(): void;
  resumeGame(): void;
  /** Platform "game finished loading" signal, when supported. */
  loadingFinished?(): void;
};
