import { Landing, landingMetadata } from "./Landing";

/**
 * The public page in English, at /landing.
 *
 * English keeps the bare path rather than moving to /landing/en. Every link to
 * this page that exists in the world points here, and a second URL holding the
 * same page is a duplicate that a search engine has to be told to ignore. The
 * other three languages live at /landing/de, /sl and /pl, and all four name
 * each other in `hreflang`.
 */
export const metadata = landingMetadata("en");

export default function LandingPage() {
  return <Landing lang="en" />;
}
