/**
 * Whether this build was made for a server somebody already runs.
 *
 * Bench is a local-first app that can optionally be pointed at a sync server
 * you set up yourself. That is the right default and it stays the default. But
 * it is the wrong shape for the other case, which is a person who runs one
 * server for a few people they know: those people should not be asked for an
 * address, should not be offered a setup token, and should not be able to
 * switch syncing off and quietly stop being backed up.
 *
 * Rather than fork the app for that, the difference is two build-time
 * variables. With neither set this is today's Bench, unchanged in every screen.
 * With them set the same code knows where the server is and insists on an
 * account.
 *
 *   NEXT_PUBLIC_SYNC_URL=https://bench.example
 *   NEXT_PUBLIC_REQUIRE_ACCOUNT=1
 *
 * They are read here and nowhere else. Next inlines `process.env.NEXT_PUBLIC_*`
 * at build time only where the whole expression is written out literally, so
 * reading them anywhere else would mean writing them out again and eventually
 * getting one of them wrong.
 */

export interface HostedConfig {
  /** Where the sync server is. No trailing slash. */
  url: string;
  /**
   * Whether an account is the point of the build rather than an option.
   *
   * True means the app is being served from behind that server's login, so
   * there is no such thing as using it signed out, and the panel says so.
   */
  required: boolean;
}

/**
 * The pair of variables turned into an answer, or null for an ordinary build.
 *
 * An address with no requirement is a real and useful middle state: the server
 * is filled in, and somebody who wants to use the app without an account still
 * can. A requirement with no address is meaningless, so it is ignored rather
 * than half-obeyed.
 */
export function hostedFrom(
  url: string | undefined,
  required: string | undefined): HostedConfig | null {
  const trimmed = (url ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  const flag = (required ?? "").trim().toLowerCase();
  return { url: trimmed, required: flag === "1" || flag === "true" || flag === "yes" };
}

export const HOSTED = hostedFrom(
  process.env.NEXT_PUBLIC_SYNC_URL,
  process.env.NEXT_PUBLIC_REQUIRE_ACCOUNT);

/** Shorthand for the common question, which is whether an account is compulsory. */
export const accountRequired = () => HOSTED?.required === true;
