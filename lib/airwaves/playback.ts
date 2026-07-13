import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import type { PlayerRecording } from '@/components/airwaves/player'
import { getRecordingById } from './recordings'
import { canViewRecording, type MediaKind } from './types'

// Airwaves P1 — the PLAYBACK RESOLVER (ADR-608). The single server seam that turns a Recording id into a
// gated player payload for the embed block (§6a) and the library/host surfaces. It composes three reads and
// the pure gate:
//   1. the Recording row (metadata + the gate: visibility + owning space),
//   2. the Loom file url (library_assets.url via loom_asset_id — the actual media src),
//   3. the viewer's membership of the owning Space (is_space_member analog), then
//   4. canViewRecording (lib/airwaves/types, unit-tested): a private Recording needs membership.
//
// It NEVER hands a media url to an un-entitled viewer — a walled Recording resolves to `locked`, so the
// client island renders a locked card, never a playable src (the §6a fail-safe). P1 is FREE only, so the
// Price / entitlement layers are not charged here; the visibility floor is the gate. Service-role reads
// (the three Airwaves tables + library_assets are RLS deny-all), so this is server-only.

// eslint-disable-next-line no-restricted-syntax -- library_assets isn't in lib/database.types.ts yet (untyped seam, ADR-246)
const db = () => createAdminClient() as unknown as SupabaseClient

/** The outcome of resolving a Recording for a viewer: a playable payload, a locked wall, or a miss. */
export type RecordingResolution =
  | { status: 'ok'; recording: PlayerRecording }
  | { status: 'locked'; title: string; mediaKind: MediaKind }
  | { status: 'missing' }

/** The owning Space's gate row + display name (untyped seam). */
type SpaceRow = { id: string; owner_profile_id: string | null; entitlements: unknown; name: string | null; brand_name: string | null }

async function loadSpaceRow(spaceId: string): Promise<SpaceRow | null> {
  try {
    const { data } = await db()
      .from('spaces')
      .select('id, owner_profile_id, entitlements, name, brand_name')
      .eq('id', spaceId)
      .maybeSingle()
    return (data as SpaceRow | null) ?? null
  } catch {
    return null
  }
}

/** The Loom file's public url for a library_assets id, or '' on a miss. */
async function loomAssetUrl(loomAssetId: string): Promise<string> {
  try {
    const { data } = await db().from('library_assets').select('url').eq('id', loomAssetId).maybeSingle()
    const url = (data as { url?: unknown } | null)?.url
    return typeof url === 'string' ? url : ''
  } catch {
    return ''
  }
}

/**
 * Resolve a Recording to a gated player payload for a viewer. Returns `ok` with a PlayerRecording (mapped
 * from the canonical Recording + the Loom url) when the viewer may see it, `locked` when a private
 * Recording is walled to non-members, or `missing` when the Recording / its file is gone. The viewer's
 * membership is resolved from the owning Space's capabilities (an active role, or an editor/owner, counts
 * as a member for the visibility floor). FAIL-SAFE: any read miss walls the Recording (locked / missing),
 * never leaks the src.
 */
export async function resolveRecordingForViewer(
  recordingId: string,
  viewerProfileId: string | null | undefined,
): Promise<RecordingResolution> {
  const rid = (recordingId ?? '').trim()
  if (!rid) return { status: 'missing' }

  const recording = await getRecordingById(rid)
  if (!recording) return { status: 'missing' }

  // Membership of the owning Space (the is_space_member analog): owner / admin / editor / active member all
  // resolve to a non-null role or canEditProfile, so a private Recording opens for anyone inside the Space.
  const space = await loadSpaceRow(recording.spaceId)
  let isMember = false
  if (space) {
    try {
      const caps = await getSpaceCapabilities(
        { id: space.id, ownerProfileId: space.owner_profile_id, entitlements: space.entitlements },
        (viewerProfileId ?? '').trim() || null,
      )
      isMember = caps.role !== null || caps.canEditProfile
    } catch {
      isMember = false
    }
  }

  if (!canViewRecording(recording, isMember)) {
    return { status: 'locked', title: recording.title, mediaKind: recording.mediaKind }
  }

  const src = await loomAssetUrl(recording.loomAssetId)
  if (!src) return { status: 'missing' }

  const spaceName = (space?.brand_name || space?.name || '').trim() || undefined
  const chapters = recording.chapters?.length
    ? recording.chapters.map((c) => ({ startSec: Math.max(0, Math.round(c.startMs / 1000)), title: c.title }))
    : undefined

  const payload: PlayerRecording = {
    id: recording.id,
    kind: recording.mediaKind,
    src,
    title: recording.title,
    durationSec: recording.durationSeconds ?? undefined,
    chapters,
    transcript: recording.transcript ?? undefined,
    downloadable: false, // P1: no download control (owner-allowed downloads land in P2).
    spaceName,
  }
  return { status: 'ok', recording: payload }
}
