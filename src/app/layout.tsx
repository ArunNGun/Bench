import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AppFrame } from "@/components/AppFrame";
import { ServiceWorker } from "@/components/ServiceWorker";
import { SyncRunner } from "@/components/SyncRunner";
import { InstallPrompt } from "@/components/InstallPrompt";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { Analytics } from "@vercel/analytics/next";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Bench, peptide log",
  description:
    "Personal peptide protocol, dosing and inventory tracker. Runs entirely on this device.",
  applicationName: "Bench",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Bench" },
  /*
   * The manifest link is written by hand below rather than declared here.
   *
   * Next's metadata field emits it without a `crossorigin` attribute, and a
   * manifest fetched without one is fetched without cookies. On an ordinary
   * deployment that is invisible. Behind a proxy that requires a session, which
   * is what the self-hosted build sits behind, the request is turned away, the
   * browser sees no manifest, and the site is simply never offered for install.
   * The failure is silent: no error, no console message, just a menu entry that
   * never appears.
   */
  // Apple ignores the manifest's icons entirely and reads this link instead, so
  // without it an installed iOS app gets a blurry screenshot of the page as its
  // home-screen icon.
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // A single value rather than a pair of media queries. The app picks its own
  // theme and defaults to light, so keying the browser chrome off the system
  // preference would leave a dark address bar above a light page. ThemeToggle
  // rewrites this whenever the theme changes.
  themeColor: "#f4f6fa",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Settles the theme before first paint. Without this the page renders in one
 * theme for a frame and then flips, which is jarring on every load.
 *
 * A first-time visitor gets light, deliberately, rather than inheriting the
 * system preference. Someone arriving from the landing page has just been
 * looking at a light page, and the charts and the syringe were drawn against a
 * light background first. The attribute is always written, so the
 * prefers-color-scheme fallback in globals.css only ever applies for the moment
 * before this runs. Anyone who wants dark is one tap away, and that choice is
 * remembered from then on.
 */
const themeScript = `
(function(){try{
  var s=localStorage.getItem('bench-theme');
  document.documentElement.setAttribute('data-theme',s==='dark'?'dark':'light');
}catch(e){document.documentElement.setAttribute('data-theme','light');}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Next's metadata API emits only the standardised mobile-web-app-capable.
          Safari respects display:standalone from the manifest from iOS 16.4, but
          anything older needs this Apple-prefixed one to open full screen rather
          than in a Safari chrome, and iOS users on old versions are exactly the
          ones who will not be updating.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/*
          `use-credentials` is the whole point of writing this by hand.
          Without it the manifest is fetched with no cookies, which is fine on a
          public deployment and fatal behind a login: the proxy answers the
          redirect it answers to any stranger, the browser concludes there is no
          manifest, and never offers to install the app. Nothing is logged and
          nothing is shown, so it reads as the browser having changed its mind.

          Harmless where there is no login. A same-origin request needs no CORS
          headers to carry a cookie it would have carried anyway.
        */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${jakarta.variable} ${plexMono.variable} antialiased`}
      >
        <Analytics />
        <ServiceWorker />
        {/* Renders nothing. Here so syncing does not depend on which page is open. */}
        <SyncRunner />
        <AppFrame>{children}</AppFrame>
        <InstallPrompt />
        <UpdatePrompt />
      </body>
    </html>
  );
}
