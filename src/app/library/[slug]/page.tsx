import { PEPTIDES } from "@/lib/data/peptides";
import { PeptideDetail } from "./PeptideDetail";

/**
 * Every compound in the library is known at build time, so each page can be
 * emitted statically. That is also what lets the whole app ship as a folder of
 * files for the Capacitor build, which has no server to render on demand.
 *
 * User-added peptides are not in this list; they are held on the device and
 * rendered by the client component below.
 */
export function generateStaticParams() {
  return PEPTIDES.map((p) => ({ slug: p.id }));
}

export default async function PeptidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PeptideDetail slug={slug} />;
}
