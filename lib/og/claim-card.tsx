import { coverPlaceholderDataUrl } from "@/lib/og/local-image";
import type { CoverPlaceholderPath } from "@/lib/spaces/cover-placeholder";
import { stageCardResponse } from "@/lib/og/stage-card";
import { SITE_NAME } from "@/lib/site";


// SHARED CLAIM-LINK OG CARD (SEO/AIO). The share card a scraper renders for a seeded entity's claim
// link (/spaces/claim/<token>, /events/claim/<token>, /listings/claim/<token>) — NOT the generic site
// card. It is a MARKETING PITCH aimed at the real owner: the entity's own cover as the background so
// they recognize it, the pitch line "Claim your <noun> on Frequency", the entity DESIGNATOR pill top
// left (Coach / Practitioner / Business / Non Profit / Event), and the Frequency watermark top right.
//
// One place builds the card so every claim route reads the same visual language as the rest of the
// site's OG cards (the spaces + events cards). Voice canon: plain imperative, no em or en dashes.
//
// The look is the shared Stage card (lib/og/stage-card.tsx). This module only turns a claim link's
// facts into its strings: the designator pill, the entity's name, and the pitch line in serif italic.

export const CLAIM_OG_SIZE = { width: 1200, height: 630 } as const;

interface ClaimCardInput {
  /** The entity's own name (the business / event / listing title). */
  name: string;
  /** The DESIGNATOR pill, top left: "Coach", "Practitioner", "Business", "Non Profit", "Event". */
  pill: string;
  /** The pitch noun: "business", "event", "nonprofit", "listing". Fills "Claim your <noun> on ...". */
  noun: string;
  /** A remote cover to fetch + inline (the entity's own image), if any. */
  coverUrl?: string | null;
  /** A local placeholder under public/ used when there is no remote cover (deterministic per
   *  entity). ⚠️ Typed to the CLOSED placeholder set, not `string`: every one of these is read
   *  from disk by a literal-pathed reader in lib/og/local-image.ts, and a path outside the set has
   *  no reader. Callers pass `coverPlaceholderFor(id)` or one of the set's own literals. */
  placeholderRelPath: CoverPlaceholderPath;
  /** A remote logo/avatar to fetch + inline into the chip, if any. */
  logoUrl?: string | null;
  /** The operator's own accent as a literal hex (Satori cannot resolve token names); tints the initials chip. */
  accent?: string | null;
  /** `events.theme.coverFocus` ("x% y%"), so the shared crop matches the page hero. */
  coverFocus?: string | null;
}

/**
 * Build the claim-link OG card. Fetches the entity's own cover + logo (fail-safe to a local
 * placeholder / initials chip) and composes the pitch card. Never throws on a missing image, so a
 * crawler's card fetch can never hang or crash.
 *
 * Returns a **JPEG** Response, not the raw ImageResponse. next/og emits lossless PNG, and this card
 * is a photograph across the full canvas — 1,776KB as PNG against 151KB as JPEG, on the one link a
 * business owner opens from an email. See lib/og/deliver.ts for the measurements and the caching.
 */
export async function claimCardResponse(
  input: ClaimCardInput,
): Promise<Response> {
  const name = input.name.trim() || "Your business";
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return stageCardResponse({
    kicker: input.pill,
    title: name,
    line: `Claim your ${input.noun} on ${SITE_NAME}`,
    coverUrl: input.coverUrl,
    coverFocus: input.coverFocus,
    coverPlaceholder: await coverPlaceholderDataUrl(input.placeholderRelPath),
    logoUrl: input.logoUrl,
    initials,
    accent: input.accent,
  });
}
