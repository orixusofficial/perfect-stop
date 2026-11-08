/**
 * Platform SDK smoke test — run with: npx --yes tsx scripts/platform-smoke.ts
 *
 * Covers: detection matrix (local/web, domain + referrer signals, dev-only
 * override, SDK-global fallback) and manager behavior with a mocked
 * CrazyGames v3 SDK (single init, gameplay dedupe, rewarded success,
 * rewarded failure, single in-flight ad, platform mute broadcast).
 */

import { detectPlatform, isLocalDev } from "../lib/platform/detect";
import { platformManager } from "../lib/platform/manager";
import type { CrazyGamesSDKLike } from "../lib/platform/types";

type MockWindow = {
  location: { hostname: string; search: string };
  parent?: MockWindow;
  CrazyGames?: { SDK?: CrazyGamesSDKLike };
  PokiSDK?: object;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
};

type MockDocument = { referrer: string };

const g = globalThis as unknown as {
  window?: MockWindow;
  document?: MockDocument;
};

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${label}`);
  }
}

function setEnv(hostname: string, referrer = "", search = ""): void {
  g.window = {
    location: { hostname, search },
    setTimeout,
    clearTimeout,
  };
  g.document = { referrer };
}

function resetSignals(): void {
  const w = g.window;
  if (w) {
    delete w.CrazyGames;
    delete w.PokiSDK;
    delete w.parent;
  }
}

console.log("detect: local development");
setEnv("localhost");
assert(detectPlatform() === "web", "localhost → web");
assert(isLocalDev() === true, "localhost is local dev");

console.log("detect: official domain signals");
setEnv("www.poki.com");
assert(detectPlatform() === "poki", "poki.com host → poki");
setEnv("game-cdn.poki.io", "https://www.poki.com/en/g/x");
assert(detectPlatform() === "poki", "poki.io host → poki");
setEnv("example.com", "https://www.crazygames.com/game/x");
assert(detectPlatform() === "crazygames", "crazygames referrer → crazygames");
setEnv("game.crazygames.com");
assert(detectPlatform() === "crazygames", "crazygames host → crazygames");
setEnv("example.com", "https://html5.gamedistribution.com/x");
assert(
  detectPlatform() === "gamedistribution",
  "gamedistribution referrer → gamedistribution",
);
setEnv("example.com", "https://www.gamepix.com/play/x");
assert(detectPlatform() === "gamepix", "gamepix referrer → gamepix");
setEnv("example.com", "https://itch.io");
assert(detectPlatform() === "web", "no signal → web");

console.log("detect: parent frame signal");
{
  setEnv("games.example.com");
  const parent: MockWindow = {
    location: { hostname: "www.crazygames.com", search: "" },
    setTimeout,
    clearTimeout,
  };
  g.window!.parent = parent;
  assert(detectPlatform() === "crazygames", "parent crazygames.com → crazygames");
  resetSignals();
}

console.log("detect: SDK globals");
setEnv("some-cdn.example.com");
g.window!.PokiSDK = {};
assert(detectPlatform() === "poki", "injected PokiSDK → poki");
resetSignals();
g.window!.CrazyGames = { SDK: {} as CrazyGamesSDKLike };
assert(detectPlatform() === "crazygames", "injected CrazyGames SDK → crazygames");
resetSignals();

console.log("detect: dev-only platform override");
setEnv("localhost", "", "?platform=crazygames");
assert(detectPlatform() === "crazygames", "localhost ?platform=crazygames honored");
setEnv("www.itch.io", "", "?platform=crazygames");
assert(detectPlatform() === "web", "query param ignored on production origin");
setEnv("localhost", "", "?platform=evil");
assert(detectPlatform() === "web", "unknown override value ignored");

console.log("manager: mocked CrazyGames v3 session");

let initCalls = 0;
let gameplayStarts = 0;
let gameplayStops = 0;
let loadingStarts = 0;
let loadingStops = 0;
const settingsListeners: Array<(settings: { muteAudio?: boolean }) => void> = [];
const adQueue: Array<"finished" | "error"> = [];

const mockSdk: CrazyGamesSDKLike = {
  environment: "crazygames",
  init: async () => {
    initCalls += 1;
  },
  ad: {
    requestAd: (_type, callbacks) => {
      const behavior = adQueue.shift() ?? "finished";
      queueMicrotask(() => {
        if (behavior === "finished") callbacks?.adFinished?.();
        else callbacks?.adError?.({ code: "unfilled", message: "No ad available" });
      });
    },
  },
  game: {
    gameplayStart: () => {
      gameplayStarts += 1;
    },
    gameplayStop: () => {
      gameplayStops += 1;
    },
    loadingStart: () => {
      loadingStarts += 1;
    },
    loadingStop: () => {
      loadingStops += 1;
    },
    settings: { muteAudio: false },
    addSettingsChangeListener: (listener) => {
      settingsListeners.push(listener);
    },
  },
};

async function main(): Promise<void> {
  setEnv("localhost", "", "?platform=crazygames");
  g.window!.CrazyGames = { SDK: mockSdk };

  const muteLog: boolean[] = [];
  platformManager.subscribePlatformMute((muted) => muteLog.push(muted));

  platformManager.boot();
  const first = await platformManager.initialize();
  const second = await platformManager.initialize();
  assert(first === true && second === true, "initialize resolves true and is cached");
  assert(initCalls === 1, `SDK init called exactly once (got ${initCalls})`);
  assert(loadingStarts === 1 && loadingStops === 1, "loadingStart/Stop fired once each");
  assert(platformManager.platform() === "crazygames", "manager routed to crazygames");

  platformManager.gameplayStart();
  platformManager.gameplayStart();
  assert(gameplayStarts === 1, `duplicate gameplayStart suppressed (got ${gameplayStarts})`);
  platformManager.gameplayStop();
  platformManager.gameplayStop();
  assert(gameplayStops === 1, `duplicate gameplayStop suppressed (got ${gameplayStops})`);
  platformManager.gameplayStart();
  assert(gameplayStarts === 2, "gameplayStart can fire again after a stop");

  const rewardOk = await platformManager.rewardedAd();
  assert(rewardOk.success === true, "rewarded ad success on adFinished");

  adQueue.push("error");
  const rewardFail = await platformManager.rewardedAd();
  assert(
    rewardFail.success === false && rewardFail.reason === "unfilled",
    `rewarded ad failure on adError (got ${rewardFail.reason})`,
  );

  adQueue.push("finished");
  const [concurrentA, concurrentB] = await Promise.all([
    platformManager.rewardedAd(),
    platformManager.rewardedAd(),
  ]);
  const busyCount = [concurrentA, concurrentB].filter(
    (r) => r.reason === "busy",
  ).length;
  const okCount = [concurrentA, concurrentB].filter((r) => r.success).length;
  assert(busyCount === 1 && okCount === 1, "only one ad in flight at a time");

  for (const listener of settingsListeners) listener({ muteAudio: true });
  assert(platformManager.isPlatformMuted() === true, "platform mute flag set");
  assert(muteLog[muteLog.length - 1] === true, "mute subscriber notified");
  for (const listener of settingsListeners) listener({ muteAudio: false });
  assert(platformManager.isPlatformMuted() === false, "platform mute cleared");

  assert(initCalls === 1, "no duplicate SDK initialization after ad calls");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
