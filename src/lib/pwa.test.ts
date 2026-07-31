import { describe, expect, it } from "vitest";
import { installRoute, shouldOffer, type Environment } from "./pwa";

const UA = {
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  iosFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/133.0 Mobile/15E148 Safari/605.1.15",
  iosEdge:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/131.0 Mobile/15E148 Safari/605.1.15",
  ipadSafari:
    "Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 16; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  desktopChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

const env = (over: Partial<Environment> = {}): Environment => ({
  userAgent: UA.androidChrome,
  standalone: false,
  hasPromptEvent: false,
  isNative: false, ...over,
});

describe("installRoute", () => {
  it("offers a button once the browser has given us a prompt event", () => {
    expect(installRoute(env({ hasPromptEvent: true }))).toBe("prompt");
  });

  it("says nothing when already installed", () => {
    expect(installRoute(env({ standalone: true }))).toBe("installed");
    // Even with a prompt event hanging around.
    expect(installRoute(env({ standalone: true, hasPromptEvent: true }))).toBe("installed");
  });

  it("says nothing inside the native shell", () => {
    expect(installRoute(env({ isNative: true }))).toBe("unsupported");
    expect(installRoute(env({ isNative: true, hasPromptEvent: true }))).toBe("unsupported");
  });

  it("shows instructions on iOS Safari, which has no prompt API", () => {
    expect(installRoute(env({ userAgent: UA.iosSafari }))).toBe("ios-safari");
    expect(installRoute(env({ userAgent: UA.ipadSafari }))).toBe("ios-safari");
  });

  it("distinguishes other iOS browsers, where Add to Home Screen does not exist", () => {
    // These are Safari's engine in a different wrapper, and their share sheets
    // have no Add to Home Screen, sending someone there is a dead end.
    for (const ua of [UA.iosChrome, UA.iosFirefox, UA.iosEdge]) {
      expect(installRoute(env({ userAgent: ua })), ua).toBe("ios-other-browser");
    }
  });

  it("says nothing useful on a desktop browser with no prompt", () => {
    expect(installRoute(env({ userAgent: UA.macSafari }))).toBe("unsupported");
    expect(installRoute(env({ userAgent: UA.desktopChrome }))).toBe("unsupported");
  });

  it("does not mistake desktop Safari for iOS Safari", () => {
    // Both carry "Safari" and a Version/ token; only the iOS ones name a device.
    expect(installRoute(env({ userAgent: UA.macSafari }))).not.toBe("ios-safari");
  });

  it("treats an installed iOS app as installed, not as needing instructions", () => {
    expect(installRoute(env({ userAgent: UA.iosSafari, standalone: true }))).toBe("installed");
  });
});

describe("shouldOffer", () => {
  const NOW = Date.UTC(2026, 6, 31, 12);
  const DAY = 86_400_000;

  it("offers on a route that can act", () => {
    expect(shouldOffer("prompt", null, NOW)).toBe(true);
    expect(shouldOffer("ios-safari", null, NOW)).toBe(true);
    expect(shouldOffer("ios-other-browser", null, NOW)).toBe(true);
  });

  it("never offers when installed or unsupported", () => {
    expect(shouldOffer("installed", null, NOW)).toBe(false);
    expect(shouldOffer("unsupported", null, NOW)).toBe(false);
  });

  it("stays quiet for two months after a dismissal", () => {
    expect(shouldOffer("prompt", NOW - 1 * DAY, NOW)).toBe(false);
    expect(shouldOffer("prompt", NOW - 59 * DAY, NOW)).toBe(false);
  });

  it("comes back after long enough", () => {
    expect(shouldOffer("prompt", NOW - 61 * DAY, NOW)).toBe(true);
  });

  it("is not fooled by a dismissal timestamp in the future", () => {
    // A clock that jumped would otherwise suppress the banner indefinitely.
    expect(shouldOffer("prompt", NOW + 400 * DAY, NOW)).toBe(true);
  });
});
