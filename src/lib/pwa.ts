/**
 * Working out how, and whether, this device can install the app.
 *
 * Kept separate from the component so the branching is testable. There are more
 * cases here than there look, and most of them are invisible during development
 * because they only happen on someone else's phone.
 *
 * The awkward one is iOS. Safari has never implemented `beforeinstallprompt`, so
 * there is no event to wait for and no programmatic way to trigger the install.
 * The only route is the user tapping Share and then "Add to Home Screen", which
 * means the honest thing to show an iPhone is instructions rather than a button
 * that cannot work. Worse, that route exists *only* in Safari: Chrome and
 * Firefox on iOS are Safari's engine wearing a different coat, and their share
 * sheets have no such option at all. Telling a Chrome-on-iOS user to tap Share
 * would send them looking for something that is not there.
 */

export type InstallRoute =
  /** Already running as an installed app. Nothing to offer. */
  | "installed"
  /** A real beforeinstallprompt is available; show a button. */
  | "prompt"
  /** iOS Safari: show the Share → Add to Home Screen instructions. */
  | "ios-safari"
  /** iOS, but not in Safari, where adding to the home screen is impossible. */
  | "ios-other-browser"
  /** Nothing to do, a desktop browser without support, or a native build. */
  | "unsupported";

export interface Environment {
  userAgent: string;
  /** display-mode: standalone, or the iOS-only navigator.standalone flag. */
  standalone: boolean;
  /** True once a beforeinstallprompt event has been captured. */
  hasPromptEvent: boolean;
  /** Running inside the Capacitor shell, where installing makes no sense. */
  isNative: boolean;
}

const isIos = (ua: string) =>
  // iPadOS 13+ reports itself as a Mac, and the only reliable tell from the
  // user agent alone is that it is a Mac with touch, which the caller cannot
  // see here, so treat an explicit iPad/iPhone/iPod as the signal and let the
  // touch check happen at the call site.
  /iphone|ipad|ipod/i.test(ua);

/**
 * Whether this is Safari rather than another browser on iOS.
 *
 * Every iOS browser carries "Safari" and a WebKit version in its user agent, so
 * the test has to be for the absence of the others rather than the presence of
 * Safari. CriOS is Chrome, FxiOS is Firefox, EdgiOS is Edge, OPiOS/OPT is Opera.
 */
const isIosSafari = (ua: string) => isIos(ua) && !/crios|fxios|edgios|opios|opt\//i.test(ua);

export function installRoute(env: Environment): InstallRoute {
  if (env.isNative) return "unsupported";
  if (env.standalone) return "installed";

  // A real prompt beats anything inferred from the user agent.
  if (env.hasPromptEvent) return "prompt";

  if (isIos(env.userAgent)) {
    return isIosSafari(env.userAgent) ? "ios-safari" : "ios-other-browser";
  }

  return "unsupported";
}

/** Read the current environment from the browser. */
export function readEnvironment(hasPromptEvent: boolean): Environment {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: navigator.userAgent,
    standalone:
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      window.matchMedia?.("(display-mode: fullscreen)").matches === true ||
      // Safari's own flag, which predates the standard media query.
      nav.standalone === true,
    hasPromptEvent,
    isNative:
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
        ?.isNativePlatform?.() === true,
  };
}

/** Whether the banner should be shown at all, given what the user has done before. */
export function shouldOffer(route: InstallRoute, dismissedAt: number | null, nowMs: number): boolean {
  if (route === "installed" || route === "unsupported") return false;

  if (dismissedAt != null) {
    const elapsed = nowMs - dismissedAt;
    // A user who said no is not asked again for two months. Nagging is how an
    // install banner becomes the thing people remember about an app.
    //
    // The elapsed >= 0 guard matters: a stored timestamp in the future, a clock
    // that was wrong and got corrected, or a restored backup from a device set
    // ahead, otherwise leaves the difference permanently negative, and the
    // banner suppressed forever.
    if (elapsed >= 0 && elapsed < 60 * 24 * 60 * 60_000) return false;
  }

  return true;
}

export const DISMISS_KEY = "bench-install-dismissed";
