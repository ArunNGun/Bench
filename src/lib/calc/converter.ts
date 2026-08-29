/**
 * A link to a currency converter, filled in already.
 *
 * The thread that produced this asked for automatic conversion with fetched
 * rates, and that was declined for a reason worth restating: the app makes one
 * network request in its life, and "no server, no analytics" is a published
 * claim that a grep over this directory is meant to prove. Live rates would
 * need a request on every open, and the claim would stop being true.
 *
 * (Deliberately not writing the name of that call here, since this file would
 * then answer the grep that exists to find it.)
 *
 * A link is not a request. Nothing leaves this device until somebody chooses to
 * open it, and what leaves then is an amount and two currency codes, which the
 * site needs in order to answer. `rel="noreferrer"` goes on the anchor so it
 * does not also learn which page sent them.
 *
 * The figure it returns is not written back. The person types what they paid,
 * once, and it never changes again, which is exactly what was asked for: "the
 * conversion is only needed once, while adding a new stock."
 */

/** Codes Google's converter recognises, which is every ISO code we offer. */
export function converterUrl(amount: number, from: string, to: string): string | null {
  if (!(amount > 0)) return null;
  if (!from || !to || from === to) return null;

  // Rounded to two places: the query is a starting point, and a figure like
  // 66.66666666666667 in a URL reads as a machine talking to itself.
  const rounded = Math.round(amount * 100) / 100;
  const query = `${rounded} ${from} to ${to}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
