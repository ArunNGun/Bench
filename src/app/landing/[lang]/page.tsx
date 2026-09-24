import { notFound } from "next/navigation";
import { Landing, LANDING_LANGS, landingMetadata } from "../Landing";
import type { Lang } from "@/lib/i18n";

/**
 * The public page in a language that is not English.
 *
 * Three static pages rather than a route that renders anything it is handed.
 * `dynamicParams = false` is what makes /landing/fr a 404 instead of an attempt
 * to render a language the dictionary does not carry, and it is also what the
 * static export needs: with no server to render on demand, the set of pages has
 * to be known when the folder is built.
 */
export const dynamicParams = false;

const OTHERS = LANDING_LANGS.filter((l) => l.lang !== "en");

export function generateStaticParams() {
  return OTHERS.map(({ lang }) => ({ lang }));
}

function known(lang: string): Lang | null {
  return OTHERS.find((l) => l.lang === lang)?.lang ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return landingMetadata(known(lang) ?? "en");
}

export default async function LandingInLanguage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const one = known(lang);
  if (!one) notFound();
  return <Landing lang={one} />;
}
