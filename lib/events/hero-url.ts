// ── THE ONE PLACE AN EVENT'S HERO IMAGE IS RESOLVED ──────────────────────────────────────────────
//
// An event's artwork can arrive by two different routes, into two different buckets, reachable by
// two different kinds of URL:
//
//   events.cover_image_path        → PUBLIC  bucket `event-media`      → getPublicUrl()
//   events.poster_path             → PRIVATE bucket `network-contacts` → createSignedUrl()
//   events.details.media.coverPath → PRIVATE bucket `network-contacts` → createSignedUrl()
//
// The first is what a host uploads. The second and third are what the poster scanner captures (the
// original flyer, and its cropped cover). The page's precedence is uploaded cover → full poster →
// cropped cover: the ORIGINAL flyer leads for a scanned event, because the crop is a lossy
// derivative of it.
//
// 🔴 WHY THIS MODULE EXISTS. That precedence used to be hand-rolled at each call site, and the
// three copies drifted: the event page and the claim card resolved all three sources, while the
// per-event OG share card (app/(main)/events/[slug]/opengraph-image.tsx) never selected
// `cover_image_path` at all and ordered the other two backwards. The consequence was invisible from
// inside the app — every page rendered, every test passed — and visible only on somebody else's
// phone: every event whose host UPLOADED a cover shared as the brand TEXT fallback card, because
// the only two paths the card looked at were null. Uploading a cover is the common case, so the
// well-designed poster card was reachable almost only by scanned events.
//
// The precedence is now derived here, and `scripts/check-event-hero-parity.test.ts` fails a PR that
// re-hand-rolls it. To change how a hero resolves, change THIS FILE.

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { POSTER_BUCKET, posterSignedUrl } from './poster-media'
import type { EventDetailsWithMedia } from './details-media'

/** The PUBLIC bucket host-uploaded covers and gallery images live in. */
export const EVENT_MEDIA_BUCKET = 'event-media'

/** The three columns a caller must SELECT for `resolveEventHeroUrl` to see every source. A read that
 *  omits one silently downgrades to a lower-priority image, or to none — which is exactly the defect
 *  this module was extracted to end, so the parity guard asserts every hero call site selects all
 *  three. */
export const EVENT_HERO_COLUMNS = ['cover_image_path', 'poster_path', 'details'] as const

/** Just the fields the hero resolution reads — any wider row satisfies it. */
export type EventHeroSource = {
  cover_image_path?: string | null
  poster_path?: string | null
  details?: EventDetailsWithMedia | null
}

/** The PRIVATE bucket the poster scanner writes to (lib/events/poster-media.ts). */
export type EventHeroBucket = typeof EVENT_MEDIA_BUCKET | 'network-contacts'

/** One candidate hero image: a storage path and the bucket that holds it. The bucket decides how a
 *  URL is built — public (`event-media`) or freshly signed (private). */
export type EventHeroCandidate = { path: string; bucket: EventHeroBucket }

/**
 * THE PRECEDENCE. Every source of an event's artwork, best first:
 *
 *   1. the host's uploaded cover        `cover_image_path`        → PUBLIC  `event-media`
 *   2. the full scanned poster          `poster_path`             → PRIVATE, signed
 *   3. the scanner's cropped cover      `details.media.coverPath` → PRIVATE, signed
 *
 * The original flyer outranks its crop because the crop is a lossy derivative of it. Callers walk
 * the list and take the FIRST candidate that yields a URL, so one unbuildable path degrades the
 * image rather than erasing it.
 *
 * Pure — no client, no I/O — so a caller that already holds signed URLs (the event page batch-signs
 * its whole gallery in one call) can apply the same order without a second round trip.
 */
export function eventHeroCandidates(ev: EventHeroSource | null | undefined): EventHeroCandidate[] {
  if (!ev) return []
  const out: EventHeroCandidate[] = []
  if (ev.cover_image_path) out.push({ path: ev.cover_image_path, bucket: EVENT_MEDIA_BUCKET })
  if (ev.poster_path) out.push({ path: ev.poster_path, bucket: POSTER_BUCKET })
  const cropPath = ev.details?.media?.coverPath
  if (cropPath) out.push({ path: cropPath, bucket: POSTER_BUCKET })
  return out
}

/** Storage access, injectable so the precedence can be tested without a network or a client. */
export type EventHeroDeps = {
  /** Public URL for a path in the `event-media` bucket. Pure string construction — no request. */
  publicUrl: (path: string) => string | null
  /** Short-lived signed URL for a path in the private poster bucket, or null. */
  signedUrl: (path: string) => Promise<string | null>
}

function defaultDeps(): EventHeroDeps {
  return {
    publicUrl: (path) =>
      createAdminClient().storage.from(EVENT_MEDIA_BUCKET).getPublicUrl(path).data?.publicUrl ?? null,
    signedUrl: (path) => posterSignedUrl(path),
  }
}

/**
 * The event's hero image URL, or null when it has no artwork at all — `eventHeroCandidates` walked
 * in order, building each candidate's URL from its bucket and taking the first that resolves.
 *
 * Every surface that shows an event's artwork (the page hero, the per-event share card, the claim
 * card) resolves through here or through `eventHeroCandidates`, so a shared card can never disagree
 * with the page it links to.
 */
export async function resolveEventHeroUrl(
  ev: EventHeroSource | null | undefined,
  deps: EventHeroDeps = defaultDeps(),
): Promise<string | null> {
  for (const c of eventHeroCandidates(ev)) {
    const url = c.bucket === EVENT_MEDIA_BUCKET ? deps.publicUrl(c.path) : await deps.signedUrl(c.path)
    if (url) return url
  }
  return null
}
