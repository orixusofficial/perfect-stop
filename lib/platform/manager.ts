/**
 * Platform manager — the single entry point every game surface uses.
 *
 * Guarantees:
 *   - one detected platform and one adapter per session;
 *   - at most one SDK script load and one `initialize()` attempt per
 *     adapter (script-load failures may retry; adapter init never runs
 *     twice);
 *   - gameplayStart/gameplayStop are applied from a desired-state model
 *     so consecutive duplicate events are impossible;
 *   - only one ad can be in flight; pause/resume and platform-mute
 *     changes are broadcast to subscribers.
 */

import { detectPlatform } from "./detect";
import type { AdResult, PlatformAdapter, PlatformId } from "./types";
import { createCrazyGamesAdapter } from "./adapters/crazygames";
import { createGameDistributionAdapter } from "./adapters/gamedistribution";
import { createGamePixAdapter } from "./adapters/gamepix";
import { createPokiAdapter } from "./adapters/poki";
import { createWebAdapter } from "./adapters/web";

const SCRIPT_TIMEOUT_MS = 10000;

function loadScript(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(false);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${url}"]`,
    );
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve(true);
        return;
      }
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }

    const el = document.createElement("script");
    el.src = url;
    el.async = true;
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(ok);
    };
    const timer = window.setTimeout(() => done(false), SCRIPT_TIMEOUT_MS);
    el.addEventListener("load", () => {
      el.dataset.loaded = "true";
      done(true);
    });
    el.addEventListener("error", () => done(false));
    document.head.appendChild(el);
  });
}

class PlatformManager {
  private detected: PlatformId | null = null;
  private adapter: PlatformAdapter | null = null;
  private initPromise: Promise<boolean> | null = null;
  private ready = false;
  private booted = false;
  private gameplayDesired = false;
  private gameplayActive = false;
  private adInFlight = false;
  private platformMuted = false;

  private readonly muteListeners = new Set<(muted: boolean) => void>();
  private readonly pauseListeners = new Set<() => void>();
  private readonly resumeListeners = new Set<() => void>();

  /** Detected platform id, resolved once per session. */
  platform(): PlatformId {
    if (!this.detected) this.detected = detectPlatform();
    return this.detected;
  }

  private buildAdapter(): PlatformAdapter {
    switch (this.platform()) {
      case "poki":
        return createPokiAdapter();
      case "crazygames":
        return createCrazyGamesAdapter();
      case "gamedistribution":
        return createGameDistributionAdapter();
      case "gamepix":
        return createGamePixAdapter();
      default:
        return createWebAdapter();
    }
  }

  private getAdapter(): PlatformAdapter {
    if (!this.adapter) this.adapter = this.buildAdapter();
    return this.adapter;
  }

  /**
   * Load the adapter's SDK script (when needed) and initialize exactly
   * once. Script-load failures may retry on the next call; once
   * `adapter.initialize()` has been attempted the result is cached so
   * the SDK is never initialized twice.
   */
  initialize(): Promise<boolean> {
    if (this.initPromise) return this.initPromise;

    let adapterInitAttempted = false;
    const pending = (async (): Promise<boolean> => {
      const adapter = this.getAdapter();
      try {
        if (adapter.scriptUrl && !adapter.isPresent()) {
          const loaded = await loadScript(adapter.scriptUrl);
          if (!loaded && !adapter.isPresent()) return false;
        }
        adapterInitAttempted = true;
        const ok = await adapter.initialize({
          onPlatformMute: (muted) => this.setPlatformMute(muted),
        });
        this.ready = ok;
        if (ok) this.applyGameplay();
        return ok;
      } catch {
        return false;
      }
    })();

    this.initPromise = pending.then((ok) => {
      if (!ok && !adapterInitAttempted) this.initPromise = null;
      return ok;
    });
    return this.initPromise;
  }

  /** Fire once at boot: initialize the SDK, then signal loading finished. */
  boot(): void {
    if (this.booted) return;
    this.booted = true;
    void this.initialize().then(() => {
      // Match the original Poki behaviour: the loading signal is sent
      // whenever the SDK global is present, even if init failed, so the
      // platform's loading metrics are never left hanging.
      try {
        const adapter = this.getAdapter();
        if (adapter.isPresent()) adapter.loadingFinished?.();
      } catch {
        /* never block the game on the SDK */
      }
    });
  }

  private applyGameplay(): void {
    if (!this.ready || !this.adapter) return;
    if (this.gameplayDesired === this.gameplayActive) return;
    try {
      if (this.gameplayDesired) {
        this.adapter.gameplayStart();
        this.gameplayActive = true;
      } else {
        this.adapter.gameplayStop();
        this.gameplayActive = false;
      }
    } catch {
      /* never block the game on the SDK */
    }
  }

  /** Queue a gameplay-start; applied immediately when the SDK is ready. */
  gameplayStart(): void {
    this.gameplayDesired = true;
    this.applyGameplay();
  }

  /** Queue a gameplay-stop; applied immediately when the SDK is ready. */
  gameplayStop(): void {
    this.gameplayDesired = false;
    this.applyGameplay();
  }

  /** True when the detected platform is expected to serve ads. */
  hasRewardedAd(): boolean {
    if (typeof window === "undefined") return false;
    return this.platform() !== "web";
  }

  /**
   * Show a rewarded ad through the active adapter. Resolves
   * `success: true` only when the provider confirms completion —
   * missing SDK, local development, skipped or failed ads resolve
   * `success: false`. Never fabricates a reward.
   */
  async rewardedAd(): Promise<AdResult> {
    return this.showAd("rewarded");
  }

  /** Show a midgame/interstitial ad through the active adapter. */
  async interstitialAd(): Promise<AdResult> {
    return this.showAd("interstitial");
  }

  private async showAd(kind: "rewarded" | "interstitial"): Promise<AdResult> {
    if (this.adInFlight) return { success: false, reason: "busy" };

    const ready = await this.initialize();
    if (!ready) return { success: false, reason: "unavailable" };
    if (this.adInFlight) return { success: false, reason: "busy" };

    this.adInFlight = true;
    try {
      this.pauseGame();
      const adapter = this.getAdapter();
      const result =
        kind === "rewarded" ? await adapter.rewardedAd() : await adapter.interstitialAd();
      return result ?? { success: false, reason: "unavailable" };
    } catch (error) {
      return {
        success: false,
        reason: error instanceof Error ? error.message : "error",
      };
    } finally {
      this.adInFlight = false;
      this.resumeGame();
    }
  }

  pauseGame(): void {
    try {
      this.getAdapter().pauseGame();
    } catch {
      /* ignore */
    }
    for (const listener of this.pauseListeners) {
      try {
        listener();
      } catch {
        /* ignore listener errors */
      }
    }
  }

  resumeGame(): void {
    try {
      this.getAdapter().resumeGame();
    } catch {
      /* ignore */
    }
    for (const listener of this.resumeListeners) {
      try {
        listener();
      } catch {
        /* ignore listener errors */
      }
    }
  }

  onPause(listener: () => void): () => void {
    this.pauseListeners.add(listener);
    return () => this.pauseListeners.delete(listener);
  }

  onResume(listener: () => void): () => void {
    this.resumeListeners.add(listener);
    return () => this.resumeListeners.delete(listener);
  }

  isPlatformMuted(): boolean {
    return this.platformMuted;
  }

  subscribePlatformMute(listener: (muted: boolean) => void): () => void {
    this.muteListeners.add(listener);
    return () => this.muteListeners.delete(listener);
  }

  private setPlatformMute(muted: boolean): void {
    if (this.platformMuted === muted) return;
    this.platformMuted = muted;
    for (const listener of this.muteListeners) {
      try {
        listener(muted);
      } catch {
        /* ignore listener errors */
      }
    }
  }
}

export const platformManager = new PlatformManager();
