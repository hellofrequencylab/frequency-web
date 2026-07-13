import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { normalizePrice, type Price } from '@/lib/commerce/types'
import { slugify } from '@/lib/utils'
import {
  asMediaKind,
  asRecordingHostKind,
  asRecordingVisibility,
  effectiveRecordingPrice,
  priceFromJson,
  type Chapter,
  type MediaKind,
  type Recording,
  type RecordingAttachment,
  type RecordingHostKind,
  type RecordingVisibility,
} from './types'

// Airwaves — gated data access for Recordings + the polymorphic attach (ADR-608, P0). SERVICE-ROLE
// only: the three tables are RLS-on/no-policy (deny-all), so every read/write rides the admin client
// behind app-layer authz. WRITES gate on the caller's per-Space capability (canEditProfile: owner /
// admin / editor / platform staff), the same authority the Loom uploader + space-landing publish use.
//
// The tables aren't in lib/database.types.ts yet, so this reaches them through the untyped admin
// handle — the repo's standard pattern for a freshly-added seam (store.ts convention, ADR-246). Pure
// logic (visibility, attach key, price precedence) lives in ./types.ts and is unit-tested there; this
// module is the IO + gate seam only.

// eslint-disable-next-line no-restricted-syntax -- recordings / recording_attachments aren't in lib/database.types.ts yet (types regen is a follow-up integrator step); genuinely untyped table access
const db = () => createAdminClient() as unknown as SupabaseClient

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

// ── Gate ─────────────────────────────────────────────────────────────────────────────────────────

/** Minimal Space row the capability check needs. */
type SpaceGateRow = { id: string; owner_profile_id: string | null; entitlements: unknown }

/** Load the gate-relevant Space columns (untyped seam). null on any miss. */
async function loadSpaceGateRow(spaceId: string): Promise<SpaceGateRow | null> {
  const id = (spaceId ?? '').trim()
  if (!id) return null
  try {
    const { data } = await db()
      .from('spaces')
      .select('id, owner_profile_id, entitlements')
      .eq('id', id)
      .maybeSingle()
    return (data as SpaceGateRow | null) ?? null
  } catch {
    return null
  }
}

/**
 * AUTHORIZE the caller as an editor (owner / admin / editor, or platform staff) of a Space. Returns
 * the Space id on success, or null on any miss (unknown Space, no edit permission, error). The Space
 * id from the client is untrusted — the capability is the authority, so a caller who passes a Space
 * they cannot edit still fails. FAIL-SAFE to null.
 */
async function authorizeSpaceEditor(
  spaceId: string,
  actorProfileId: string | null | undefined,
): Promise<string | null> {
  const pid = (actorProfileId ?? '').trim()
  if (!pid) return null
  const row = await loadSpaceGateRow(spaceId)
  if (!row) return null
  try {
    const caps = await getSpaceCapabilities(
      { id: row.id, ownerProfileId: row.owner_profile_id, entitlements: row.entitlements },
      pid,
    )
    return caps.canEditProfile ? row.id : null
  } catch {
    return null
  }
}

// ── Row mappers (raw jsonb/snake_case -> the canonical camelCase types) ───────────────────────────

function toChapters(raw: unknown): Chapter[] | null {
  if (!Array.isArray(raw)) return null
  const out: Chapter[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const startMs = Number(r.startMs)
    const title = typeof r.title === 'string' ? r.title : ''
    if (!Number.isFinite(startMs) || !title) continue
    const ch: Chapter = { startMs, title }
    if (typeof r.img === 'string' && r.img) ch.img = r.img
    out.push(ch)
  }
  return out.length ? out : null
}

function mapRecording(r: Record<string, unknown>): Recording {
  return {
    id: String(r.id),
    spaceId: String(r.space_id),
    showId: (r.show_id as string | null) ?? null,
    loomAssetId: String(r.loom_asset_id),
    mediaKind: asMediaKind(r.media_kind) ?? 'audio',
    title: String(r.title ?? ''),
    slug: (r.slug as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    transcript: (r.transcript as string | null) ?? null,
    chapters: toChapters(r.chapters),
    durationSeconds: (r.duration_seconds as number | null) ?? null,
    price: priceFromJson(r.price),
    requiredEntitlement: (r.required_entitlement as string | null) ?? null,
    visibility: asRecordingVisibility(r.visibility),
    publishedAt: (r.published_at as string | null) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  }
}

function mapAttachment(r: Record<string, unknown>): RecordingAttachment {
  return {
    id: String(r.id),
    recordingId: String(r.recording_id),
    hostKind: asRecordingHostKind(r.host_kind) ?? 'space',
    hostId: String(r.host_id),
    price: r.price == null ? null : priceFromJson(r.price),
    requiredEntitlement: (r.required_entitlement as string | null) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: String(r.created_at ?? ''),
  }
}

const RECORDING_SELECT =
  'id, space_id, show_id, loom_asset_id, media_kind, title, slug, description, transcript, chapters, duration_seconds, price, required_entitlement, visibility, published_at, sort_order, created_at, updated_at'
const ATTACHMENT_SELECT =
  'id, recording_id, host_kind, host_id, price, required_entitlement, sort_order, created_at'

// ── CRUD (gated) ───────────────────────────────────────────────────────────────────────────────

/** What a caller supplies to create a Recording. `loomAssetId` is the Loom file id from
 *  copyRecordingToLoom. Price defaults to free (a mode, never 0). */
export interface CreateRecordingInput {
  spaceId: string
  loomAssetId: string
  mediaKind: MediaKind
  title: string
  slug?: string | null
  description?: string | null
  showId?: string | null
  transcript?: string | null
  chapters?: Chapter[] | null
  durationSeconds?: number | null
  price?: Price | null
  requiredEntitlement?: string | null
  visibility?: RecordingVisibility
  publishedAt?: string | null
  sortOrder?: number
}

/**
 * Create a Recording, gated on the caller's edit permission for the Space. The Loom file must already
 * exist (loomAssetId from copyRecordingToLoom). Price is normalized (default free). Returns the new
 * Recording, or a plain error string.
 */
export async function createRecording(
  actorProfileId: string | null | undefined,
  input: CreateRecordingInput,
): Promise<Result<Recording>> {
  const spaceId = await authorizeSpaceEditor(input.spaceId, actorProfileId)
  if (!spaceId) return { ok: false, error: 'You do not have access to add recordings to this space.' }

  const kind = asMediaKind(input.mediaKind)
  if (!kind) return { ok: false, error: 'Choose whether this is audio or video.' }
  const title = (input.title ?? '').trim()
  if (!title) return { ok: false, error: 'Give the recording a title.' }
  const loomAssetId = (input.loomAssetId ?? '').trim()
  if (!loomAssetId) return { ok: false, error: 'The recording file is missing from the Loom.' }

  const slug = input.slug?.trim() ? slugify(input.slug) : slugify(title) || null
  const price = normalizePrice(input.price ?? { mode: 'free' })

  try {
    const { data, error } = await db()
      .from('recordings')
      .insert({
        space_id: spaceId,
        loom_asset_id: loomAssetId,
        media_kind: kind,
        title: title.slice(0, 200),
        slug,
        description: input.description?.trim() || null,
        show_id: input.showId?.trim() || null,
        transcript: input.transcript ?? null,
        chapters: input.chapters ?? null,
        duration_seconds: input.durationSeconds ?? null,
        price,
        required_entitlement: input.requiredEntitlement?.trim() || null,
        visibility: asRecordingVisibility(input.visibility),
        published_at: input.publishedAt ?? null,
        sort_order: input.sortOrder ?? 0,
      })
      .select(RECORDING_SELECT)
      .maybeSingle()
    if (error || !data) return { ok: false, error: 'Could not save the recording. Try again.' }
    return { ok: true, value: mapRecording(data as Record<string, unknown>) }
  } catch {
    return { ok: false, error: 'Could not save the recording. Try again.' }
  }
}

/** One Recording by id, scoped to its Space (service-role read; the caller gates display). null on a
 *  miss. Does NOT itself apply the visibility gate — use canViewRecording (./types.ts) at the surface. */
export async function getRecording(spaceId: string, id: string): Promise<Recording | null> {
  const sid = (spaceId ?? '').trim()
  const rid = (id ?? '').trim()
  if (!sid || !rid) return null
  try {
    const { data } = await db()
      .from('recordings')
      .select(RECORDING_SELECT)
      .eq('space_id', sid)
      .eq('id', rid)
      .maybeSingle()
    return data ? mapRecording(data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** A Space's Recordings, newest first (owner catalog). FAIL-SAFE to []. */
export async function listRecordingsForSpace(spaceId: string, limit = 200): Promise<Recording[]> {
  const sid = (spaceId ?? '').trim()
  if (!sid) return []
  try {
    const { data } = await db()
      .from('recordings')
      .select(RECORDING_SELECT)
      .eq('space_id', sid)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 500))
    return ((data as Array<Record<string, unknown>> | null) ?? []).map(mapRecording)
  } catch {
    return []
  }
}

/** The mutable fields of a Recording (metadata + gate + Show link). All optional; only provided keys
 *  are written. `loomAssetId` / `spaceId` / `mediaKind` are immutable after create (re-upload replaces
 *  the Loom file in place, P2). */
export interface UpdateRecordingInput {
  title?: string
  slug?: string | null
  description?: string | null
  showId?: string | null
  transcript?: string | null
  chapters?: Chapter[] | null
  durationSeconds?: number | null
  price?: Price | null
  requiredEntitlement?: string | null
  visibility?: RecordingVisibility
  publishedAt?: string | null
  sortOrder?: number
}

/** Update a Recording's metadata, gated on edit permission for its Space. Returns the updated row. */
export async function updateRecording(
  actorProfileId: string | null | undefined,
  recordingId: string,
  fields: UpdateRecordingInput,
): Promise<Result<Recording>> {
  const existing = await getRecordingById(recordingId)
  if (!existing) return { ok: false, error: 'That recording no longer exists.' }
  const spaceId = await authorizeSpaceEditor(existing.spaceId, actorProfileId)
  if (!spaceId) return { ok: false, error: 'You do not have access to edit this recording.' }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (fields.title !== undefined) {
    const t = fields.title.trim()
    if (!t) return { ok: false, error: 'Give the recording a title.' }
    patch.title = t.slice(0, 200)
  }
  if (fields.slug !== undefined) patch.slug = fields.slug?.trim() ? slugify(fields.slug) : null
  if (fields.description !== undefined) patch.description = fields.description?.trim() || null
  if (fields.showId !== undefined) patch.show_id = fields.showId?.trim() || null
  if (fields.transcript !== undefined) patch.transcript = fields.transcript ?? null
  if (fields.chapters !== undefined) patch.chapters = fields.chapters ?? null
  if (fields.durationSeconds !== undefined) patch.duration_seconds = fields.durationSeconds ?? null
  if (fields.price !== undefined)
    patch.price = normalizePrice(fields.price ?? { mode: 'free' })
  if (fields.requiredEntitlement !== undefined)
    patch.required_entitlement = fields.requiredEntitlement?.trim() || null
  if (fields.visibility !== undefined) patch.visibility = asRecordingVisibility(fields.visibility)
  if (fields.publishedAt !== undefined) patch.published_at = fields.publishedAt ?? null
  if (fields.sortOrder !== undefined) patch.sort_order = fields.sortOrder

  try {
    const { data, error } = await db()
      .from('recordings')
      .update(patch)
      .eq('id', existing.id)
      .select(RECORDING_SELECT)
      .maybeSingle()
    if (error || !data) return { ok: false, error: 'Could not save your changes. Try again.' }
    return { ok: true, value: mapRecording(data as Record<string, unknown>) }
  } catch {
    return { ok: false, error: 'Could not save your changes. Try again.' }
  }
}

/** Delete a Recording (its attachments cascade), gated on edit permission for its Space. The Loom
 *  file is NOT removed here — a Recording deletion leaves the asset in the Loom (the operator manages
 *  files there). Returns ok or a plain error. */
export async function deleteRecording(
  actorProfileId: string | null | undefined,
  recordingId: string,
): Promise<Result<{ id: string }>> {
  const existing = await getRecordingById(recordingId)
  if (!existing) return { ok: true, value: { id: (recordingId ?? '').trim() } } // already gone
  const spaceId = await authorizeSpaceEditor(existing.spaceId, actorProfileId)
  if (!spaceId) return { ok: false, error: 'You do not have access to delete this recording.' }
  try {
    const { error } = await db().from('recordings').delete().eq('id', existing.id)
    if (error) return { ok: false, error: 'Could not delete the recording. Try again.' }
    return { ok: true, value: { id: existing.id } }
  } catch {
    return { ok: false, error: 'Could not delete the recording. Try again.' }
  }
}

/** A Recording by id alone (no Space scope), for the gate + host resolution. null on a miss. Exported for
 *  the playback resolver (lib/airwaves/playback.ts), which pairs it with the Loom file url + the viewer's
 *  membership to build a gated player payload. Service-role read; every caller applies the visibility gate
 *  (canViewRecording) at its own surface. */
export async function getRecordingById(recordingId: string): Promise<Recording | null> {
  const rid = (recordingId ?? '').trim()
  if (!rid) return null
  try {
    const { data } = await db().from('recordings').select(RECORDING_SELECT).eq('id', rid).maybeSingle()
    return data ? mapRecording(data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// ── The polymorphic attach ────────────────────────────────────────────────────────────────────

/** Attach a Recording to a host (space / journey / journey_item / practice / event / product),
 *  gated on edit permission for the Recording's OWNING Space. Idempotent on (recording, host_kind,
 *  host_id): a repeat updates the override fields rather than erroring. `price` / `requiredEntitlement`
 *  are optional per-attach overrides (null = inherit the Recording). Returns the attach row. */
export async function attachRecording(
  actorProfileId: string | null | undefined,
  input: {
    recordingId: string
    hostKind: RecordingHostKind
    hostId: string
    price?: Price | null
    requiredEntitlement?: string | null
    sortOrder?: number
  },
): Promise<Result<RecordingAttachment>> {
  const hostKind = asRecordingHostKind(input.hostKind)
  if (!hostKind) return { ok: false, error: 'That attachment target is not supported.' }
  const hostId = (input.hostId ?? '').trim()
  if (!hostId) return { ok: false, error: 'Choose where to attach the recording.' }

  const recording = await getRecordingById(input.recordingId)
  if (!recording) return { ok: false, error: 'That recording no longer exists.' }
  const spaceId = await authorizeSpaceEditor(recording.spaceId, actorProfileId)
  if (!spaceId) return { ok: false, error: 'You do not have access to attach this recording.' }

  const price =
    input.price == null ? null : normalizePrice(input.price)

  try {
    const { data, error } = await db()
      .from('recording_attachments')
      .upsert(
        {
          recording_id: recording.id,
          host_kind: hostKind,
          host_id: hostId,
          price,
          required_entitlement: input.requiredEntitlement?.trim() || null,
          sort_order: input.sortOrder ?? 0,
        },
        { onConflict: 'recording_id,host_kind,host_id' },
      )
      .select(ATTACHMENT_SELECT)
      .maybeSingle()
    if (error || !data) return { ok: false, error: 'Could not attach the recording. Try again.' }
    return { ok: true, value: mapAttachment(data as Record<string, unknown>) }
  } catch {
    return { ok: false, error: 'Could not attach the recording. Try again.' }
  }
}

/** Detach a Recording from a host, gated on edit permission for the Recording's owning Space.
 *  Idempotent (a missing attach is a no-op success). */
export async function detachRecording(
  actorProfileId: string | null | undefined,
  input: { recordingId: string; hostKind: RecordingHostKind; hostId: string },
): Promise<Result<{ removed: boolean }>> {
  const hostKind = asRecordingHostKind(input.hostKind)
  if (!hostKind) return { ok: false, error: 'That attachment target is not supported.' }
  const hostId = (input.hostId ?? '').trim()
  if (!hostId) return { ok: false, error: 'Choose which attachment to remove.' }

  const recording = await getRecordingById(input.recordingId)
  if (!recording) return { ok: true, value: { removed: false } } // already gone
  const spaceId = await authorizeSpaceEditor(recording.spaceId, actorProfileId)
  if (!spaceId) return { ok: false, error: 'You do not have access to detach this recording.' }

  try {
    const { error } = await db()
      .from('recording_attachments')
      .delete()
      .eq('recording_id', recording.id)
      .eq('host_kind', hostKind)
      .eq('host_id', hostId)
    if (error) return { ok: false, error: 'Could not remove the attachment. Try again.' }
    return { ok: true, value: { removed: true } }
  } catch {
    return { ok: false, error: 'Could not remove the attachment. Try again.' }
  }
}

/** Every attach for a host (the reverse lookup: "which Recordings hang off THIS practice / journey /
 *  event / product / space?"), ordered by sort_order. Service-role read; the caller resolves the
 *  parent Recording's gate before surfacing. FAIL-SAFE to []. */
export async function listAttachmentsFor(
  hostKind: RecordingHostKind,
  hostId: string,
): Promise<RecordingAttachment[]> {
  const kind = asRecordingHostKind(hostKind)
  const hid = (hostId ?? '').trim()
  if (!kind || !hid) return []
  try {
    const { data } = await db()
      .from('recording_attachments')
      .select(ATTACHMENT_SELECT)
      .eq('host_kind', kind)
      .eq('host_id', hid)
      .order('sort_order', { ascending: true })
      .limit(500)
    return ((data as Array<Record<string, unknown>> | null) ?? []).map(mapAttachment)
  } catch {
    return []
  }
}

/** Every host a Recording is attached to (the forward lookup, for the owner's "used in N places" view
 *  and cascade previews). FAIL-SAFE to []. */
export async function listAttachmentsOfRecording(recordingId: string): Promise<RecordingAttachment[]> {
  const rid = (recordingId ?? '').trim()
  if (!rid) return []
  try {
    const { data } = await db()
      .from('recording_attachments')
      .select(ATTACHMENT_SELECT)
      .eq('recording_id', rid)
      .order('sort_order', { ascending: true })
      .limit(500)
    return ((data as Array<Record<string, unknown>> | null) ?? []).map(mapAttachment)
  } catch {
    return []
  }
}

// Re-export the pure price-precedence helper so callers resolving an attach's effective price have one
// import site for the whole seam.
export { effectiveRecordingPrice }
