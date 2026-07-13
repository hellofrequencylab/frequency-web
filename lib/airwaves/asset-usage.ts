import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { asRecordingHostKind, type RecordingHostKind } from './types'

// Airwaves P2 — the Loom "where is this used" reverse lookup (ADR-608 §7e). Given a Loom asset id, find
// every Recording that references it (recordings.loom_asset_id) and, for each, where that Recording is used:
// the hosts it is attached to (recording_attachments) and whether it is a Show episode (recordings.show_id).
// This is what turns the Loom from an image drawer into a media manager: an operator sees an A/V file is
// "used in 3 places" and can follow each reference before replacing or deleting it. Service-role reads
// (all three tables are RLS deny-all); the caller (the janitor-gated usage route) applies authz.

// eslint-disable-next-line no-restricted-syntax -- recordings / recording_attachments aren't in lib/database.types.ts yet (untyped seam, ADR-246)
const db = () => createAdminClient() as unknown as SupabaseClient

/** A human label for a host kind, for the usage list. */
const HOST_LABEL: Record<RecordingHostKind, string> = {
  space: 'Space',
  journey: 'Journey',
  journey_item: 'Journey lesson',
  practice: 'Practice',
  event: 'Event',
  product: 'Product',
}

/** One Recording that references a Loom asset, plus where it plays. */
export interface AssetUsageRecording {
  recordingId: string
  title: string
  mediaKind: 'audio' | 'video'
  /** This Recording is an Episode in a Show. */
  isEpisode: boolean
  /** The hosts this Recording is attached to (deduped labels), e.g. ['Space', 'Event']. */
  hosts: string[]
  /** Total references this Recording carries (attachments + 1 if it is a Show episode). */
  placeCount: number
}

/** The usage summary for a Loom asset: the Recordings that reference it and a total place count. */
export interface AssetUsage {
  loomAssetId: string
  recordings: AssetUsageRecording[]
  /** Sum of every reference across every Recording (the "used in N places" number). */
  totalPlaces: number
}

/**
 * Resolve where a Loom asset is used across Airwaves. FAIL-SAFE: a missing table (pre-migration) or a read
 * error resolves to an empty usage (never throws), so the Loom detail panel renders regardless. An asset
 * with no Recording referencing it returns an empty list (0 places).
 */
export async function getLoomAssetUsage(loomAssetId: string): Promise<AssetUsage> {
  const id = (loomAssetId ?? '').trim()
  const empty: AssetUsage = { loomAssetId: id, recordings: [], totalPlaces: 0 }
  if (!id) return empty

  try {
    const { data: recs } = await db()
      .from('recordings')
      .select('id, title, media_kind, show_id')
      .eq('loom_asset_id', id)
      .limit(200)
    const rows = (recs as Array<Record<string, unknown>> | null) ?? []
    if (rows.length === 0) return empty

    const recordings = await Promise.all(
      rows.map(async (r) => {
        const recordingId = String(r.id)
        const { data: atts } = await db()
          .from('recording_attachments')
          .select('host_kind')
          .eq('recording_id', recordingId)
          .limit(500)
        const attRows = (atts as Array<{ host_kind: string }> | null) ?? []
        const labels = new Set<string>()
        for (const a of attRows) {
          const kind = asRecordingHostKind(a.host_kind)
          if (kind) labels.add(HOST_LABEL[kind])
        }
        const isEpisode = !!(r.show_id as string | null)
        const placeCount = attRows.length + (isEpisode ? 1 : 0)
        return {
          recordingId,
          title: String(r.title ?? 'Recording'),
          mediaKind: (r.media_kind === 'video' ? 'video' : 'audio') as 'audio' | 'video',
          isEpisode,
          hosts: [...labels],
          placeCount,
        }
      }),
    )
    const totalPlaces = recordings.reduce((sum, r) => sum + r.placeCount, 0)
    return { loomAssetId: id, recordings, totalPlaces }
  } catch {
    return empty
  }
}
