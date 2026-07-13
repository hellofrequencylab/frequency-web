// Airwaves — the canonical typed contract for the audio / video / podcast platform (ADR-608, P0).
//
// THIS IS THE SHARED TYPE MODULE every other Airwaves surface (the block, the player, the Loom
// manager, the RSS feed, the owner console) imports. Kept dependency-free apart from the pure Price
// primitive (lib/commerce/types.ts), so a client island and a server action can both import it with
// no server-only / next/headers leakage. The pure helpers (attach key, visibility resolution, price
// mapping) live here alongside the types and are unit-tested in ./types.test.ts, mirroring how
// lib/commerce/types.ts pairs the Price shapes with their pure functions.
//
// Member-facing names (Airwaves / Recording / Episode / Show) are PROPOSED until the Vision Steward
// locks them in docs/NAMING.md; the schema/code names here are descriptive and safe to use now.

import { normalizePrice, type Price } from '@/lib/commerce/types'

// ── Enumerations (each with a default-deny narrower) ─────────────────────────────────────────────

/** A Recording is audio or video. Mirrors recordings.media_kind (CHECK). */
export type MediaKind = 'audio' | 'video'
export const MEDIA_KINDS: readonly MediaKind[] = ['audio', 'video']

/** How widely a Recording is exposed. Mirrors recordings.visibility (CHECK). The DB + app gate walls
 *  only `private` to Space members; `space` vs `public` finer gating rides the player + Price. */
export type RecordingVisibility = 'public' | 'space' | 'private'
export const RECORDING_VISIBILITIES: readonly RecordingVisibility[] = ['public', 'space', 'private']

/** The host types a Recording can attach to (requirement #3). Mirrors recording_attachments.host_kind
 *  (CHECK). `journey_item` is a specific lesson block; `space` is the whole Space surface. */
export type RecordingHostKind = 'space' | 'journey' | 'journey_item' | 'practice' | 'event' | 'product'
export const RECORDING_HOST_KINDS: readonly RecordingHostKind[] = [
  'space',
  'journey',
  'journey_item',
  'practice',
  'event',
  'product',
]

/** A Show's lifecycle. Mirrors podcast_shows.status (CHECK). */
export type ShowStatus = 'draft' | 'published' | 'archived'
export const SHOW_STATUSES: readonly ShowStatus[] = ['draft', 'published', 'archived']

/** Whether a Show's feed is the public one or a private tokenized feed (P4). Mirrors
 *  podcast_shows.feed_visibility (CHECK). */
export type FeedVisibility = 'public' | 'private'
export const FEED_VISIBILITIES: readonly FeedVisibility[] = ['public', 'private']

/** Narrow an arbitrary value to a MediaKind, or null (default-deny). PURE. */
export function asMediaKind(raw: unknown): MediaKind | null {
  return typeof raw === 'string' && (MEDIA_KINDS as readonly string[]).includes(raw)
    ? (raw as MediaKind)
    : null
}

/** Narrow an arbitrary value to a RecordingVisibility, defaulting to `space` (the table default).
 *  PURE — a stored/garbage value never resolves to a wider exposure than intended. */
export function asRecordingVisibility(raw: unknown): RecordingVisibility {
  return typeof raw === 'string' && (RECORDING_VISIBILITIES as readonly string[]).includes(raw)
    ? (raw as RecordingVisibility)
    : 'space'
}

/** Narrow an arbitrary value to a RecordingHostKind, or null (default-deny). PURE. */
export function asRecordingHostKind(raw: unknown): RecordingHostKind | null {
  return typeof raw === 'string' && (RECORDING_HOST_KINDS as readonly string[]).includes(raw)
    ? (raw as RecordingHostKind)
    : null
}

/** Narrow an arbitrary value to a ShowStatus, defaulting to `draft`. PURE. */
export function asShowStatus(raw: unknown): ShowStatus {
  return typeof raw === 'string' && (SHOW_STATUSES as readonly string[]).includes(raw)
    ? (raw as ShowStatus)
    : 'draft'
}

/** Narrow an arbitrary value to a FeedVisibility, defaulting to `public`. PURE. */
export function asFeedVisibility(raw: unknown): FeedVisibility {
  return typeof raw === 'string' && (FEED_VISIBILITIES as readonly string[]).includes(raw)
    ? (raw as FeedVisibility)
    : 'public'
}

// ── The core entities ────────────────────────────────────────────────────────────────────────────

/** One chapter marker inside a Recording (podcast:chapters). `startMs` is the offset from the start. */
export interface Chapter {
  startMs: number
  title: string
  img?: string
}

/** The media atom. Mirrors public.recordings column-for-column (camelCased). `price` is always a
 *  resolved Price (never raw jsonb); a null stored price reads as `{ mode: 'free' }`. */
export interface Recording {
  id: string
  /** The owning Space — the gate anchor. */
  spaceId: string
  /** Set = this Recording is an Episode in that Show; null = library-only. */
  showId: string | null
  /** The file, in The Loom (library_assets). */
  loomAssetId: string
  mediaKind: MediaKind
  title: string
  slug: string | null
  description: string | null
  transcript: string | null
  chapters: Chapter[] | null
  durationSeconds: number | null
  /** The unified Price primitive (ADR-607). Default free. */
  price: Price
  /** A premium-tier entitlement key gate (e.g. 'space_airwaves_premium'), or null. */
  requiredEntitlement: string | null
  visibility: RecordingVisibility
  publishedAt: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** A Show = one RSS feed owned by a Space. Mirrors public.podcast_shows. */
export interface Show {
  id: string
  spaceId: string
  slug: string
  title: string
  description: string | null
  author: string | null
  coverAssetId: string | null
  itunesCategory: string
  explicit: boolean
  language: string
  ownerName: string | null
  ownerEmail: string | null
  feedVisibility: FeedVisibility
  status: ShowStatus
  createdAt: string
  updatedAt: string
}

/** A polymorphic attach: one Recording -> one host. Mirrors public.recording_attachments. `price` /
 *  `requiredEntitlement` are per-attach OVERRIDES; null means inherit the Recording's own. */
export interface RecordingAttachment {
  id: string
  recordingId: string
  hostKind: RecordingHostKind
  hostId: string
  /** null = inherit recordings.price. */
  price: Price | null
  /** null = inherit recordings.required_entitlement. */
  requiredEntitlement: string | null
  sortOrder: number
  createdAt: string
}

// ── Pure helpers: attach key ─────────────────────────────────────────────────────────────────────

/** The stable attach key `${recordingId}:${hostKind}:${hostId}` — the app-layer mirror of the
 *  DB unique index (recording_id, host_kind, host_id). Use it to dedupe attaches client-side before a
 *  round-trip. PURE. */
export function attachmentKey(recordingId: string, hostKind: RecordingHostKind, hostId: string): string {
  return `${recordingId}:${hostKind}:${hostId}`
}

/** The attach key for an existing RecordingAttachment row. PURE. */
export function attachmentKeyOf(a: Pick<RecordingAttachment, 'recordingId' | 'hostKind' | 'hostId'>): string {
  return attachmentKey(a.recordingId, a.hostKind, a.hostId)
}

// ── Pure helpers: visibility resolution ──────────────────────────────────────────────────────────
//
// The coarse gate reuses the private-Journey predicate exactly (20260711080000_spaces_visibility_aware_rls):
// a Recording is admitted when it is NOT private, OR the viewer owns/actively-belongs-to the Space.
// `space` vs `public` is a finer, app-layer concern (the player resolves entitlement + Price on top);
// this helper is the single DB-parity floor that walls `private` to members.

/** Can a viewer SEE a Recording at the visibility floor? PURE. `isSpaceMember` is the resolved
 *  is_space_member(space_id) for this viewer. A non-private Recording is always visible; a private one
 *  needs membership. This mirrors the `visibility <> 'private' OR is_space_member(space_id)` predicate. */
export function canViewRecording(
  recording: Pick<Recording, 'visibility'>,
  isSpaceMember: boolean,
): boolean {
  return recording.visibility !== 'private' || isSpaceMember
}

/** Is a Recording published AND publicly visible (the RSS / public-page floor)? PURE. A Recording is
 *  publicly listable only when visibility is `public` and it carries a `published_at` in the past. */
export function isRecordingPublic(
  recording: Pick<Recording, 'visibility' | 'publishedAt'>,
  now: Date = new Date(),
): boolean {
  if (recording.visibility !== 'public') return false
  if (!recording.publishedAt) return false
  const at = Date.parse(recording.publishedAt)
  return Number.isFinite(at) && at <= now.getTime()
}

// ── Pure helpers: price mapping ──────────────────────────────────────────────────────────────────

/** Read a raw stored jsonb price into a clean Price. A null / absent / garbage blob reads as free
 *  (free is a MODE, never a 0), so a stored Recording always resolves to a usable Price. PURE. */
export function priceFromJson(raw: unknown): Price {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { mode: 'free' }
  return normalizePrice(raw as Record<string, unknown>)
}

/** The EFFECTIVE Price a viewer pays for a Recording at a given host: the per-attach override when the
 *  attach sets one, else the Recording's own Price. Both are normalized. An attach with no price
 *  (null) inherits. PURE — the single place the override precedence is decided. */
export function effectiveRecordingPrice(
  recordingPrice: Price,
  attachPrice: Price | null | undefined,
): Price {
  return attachPrice ? normalizePrice(attachPrice) : normalizePrice(recordingPrice)
}

/** The EFFECTIVE required-entitlement gate for a Recording at a given host: the per-attach override
 *  when set, else the Recording's own. A blank string reads as no gate. PURE. */
export function effectiveRequiredEntitlement(
  recordingEntitlement: string | null | undefined,
  attachEntitlement: string | null | undefined,
): string | null {
  const attach = (attachEntitlement ?? '').trim()
  if (attach) return attach
  const own = (recordingEntitlement ?? '').trim()
  return own || null
}
