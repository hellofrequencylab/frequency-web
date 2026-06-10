// The poster-crop media convention for the Poster Events capture UI.
//
// The engine's `events.details` JSONB persists whatever the actions hand it
// (lib/events/event-drafts.ts), but coerceEventDetails() strips unknown keys
// from every ROW — so per-row crop paths can't ride on the rows themselves.
// Instead, the capture UI stores them in ONE parallel `media` object inside
// details, keyed by the row's index in its array:
//
//   details.media = {
//     coverPath: 'authUserId/uuid.jpg',          // the cropped event cover
//     lineup:  { '0': 'authUserId/a.jpg', ... }, // lineup[i] → its crop
//     gallery: { '1': 'authUserId/b.jpg', ... }, // imageRegions[i] → its crop
//   }
//
// All paths live in the PRIVATE network-contacts bucket under the uploader's
// auth-user folder ({authUserId}/{uuid}.jpg — same convention as the card
// scanner). Readers render them via short-lived signed URLs only. The editor
// keeps indices honest: it re-derives `media` from the row order on every save.
// Framework-free so server actions, pages, and the client editor share it.

import type { EventDetails } from './types'

export interface DetailsMedia {
  /** Crop of the model's cover box (or the whole poster) — the event cover. */
  coverPath?: string
  /** lineup row index (as a string key) → that act's cropped photo path. */
  lineup?: Record<string, string>
  /** imageRegions row index (as a string key) → that region's crop path. */
  gallery?: Record<string, string>
}

/** events.details as persisted by the capture UI: the engine's harvest plus
 *  the parallel media object above. */
export type EventDetailsWithMedia = EventDetails & { media?: DetailsMedia }

/** A plausible storage path inside the given owner folder: `{owner}/{file}`,
 *  safe charset, sane length. Everything else is rejected. */
export function isOwnedStoragePath(raw: unknown, ownerId: string): raw is string {
  if (typeof raw !== 'string' || !ownerId) return false
  if (raw.length > 200) return false
  if (!raw.startsWith(`${ownerId}/`)) return false
  return /^[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(raw)
}

/** Validate an untrusted media object: keep only paths inside the owner's own
 *  storage folder, with numeric row keys. Returns undefined when nothing valid
 *  survives (so empty objects never pollute the JSONB). */
export function coerceDetailsMedia(raw: unknown, ownerId: string): DetailsMedia | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const m = raw as Record<string, unknown>
  const out: DetailsMedia = {}

  if (isOwnedStoragePath(m.coverPath, ownerId)) out.coverPath = m.coverPath

  for (const [key, field] of [
    ['lineup', 'lineup'],
    ['gallery', 'gallery'],
  ] as const) {
    const src = m[key]
    if (!src || typeof src !== 'object') continue
    const clean: Record<string, string> = {}
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (!/^\d{1,3}$/.test(k)) continue
      if (isOwnedStoragePath(v, ownerId)) clean[k] = v
    }
    if (Object.keys(clean).length) out[field] = clean
  }

  return Object.keys(out).length ? out : undefined
}

/** Every storage path referenced by a details object (cover + row crops) —
 *  used to sign URLs in one batch and to clean up when a draft is deleted. */
export function detailsMediaPaths(details: EventDetailsWithMedia | null | undefined): string[] {
  const media = details?.media
  if (!media) return []
  const out: string[] = []
  if (media.coverPath) out.push(media.coverPath)
  for (const v of Object.values(media.lineup ?? {})) out.push(v)
  for (const v of Object.values(media.gallery ?? {})) out.push(v)
  return out
}
