// Acquisition rollup (ADR-095) — the channel mix across the membership, read from
// the governed source_* tags on member_tags. Server-only; admin-gated at the page.
// No new table/RPC: the tags already hold first-touch origin, so a grouped read is
// all the "analytics" the distribution view needs.

import { createAdminClient } from '@/lib/supabase/admin'
import { ACQUISITION_CHANNELS, CHANNEL_LABEL, channelTag, type AcquisitionChannel } from './channels'

export interface ChannelRollupRow {
  channel: AcquisitionChannel
  label: string
  members: number
  /** Newly attributed in the last 30 days (by tag assigned_at). */
  last30: number
  /** Share of *attributed* members (0..1). */
  share: number
}

export interface AcquisitionRollup {
  rows: ChannelRollupRow[]
  /** Distinct members carrying any source_* tag. */
  attributed: number
  totalMembers: number
  /** attributed / totalMembers (0..1). */
  coverage: number
}

export async function getAcquisitionRollup(): Promise<AcquisitionRollup> {
  const db = createAdminClient()
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000
  const tagKeys = ACQUISITION_CHANNELS.map(channelTag)

  const { data } = await db
    .from('member_tags')
    .select('profile_id, tag_key, assigned_at')
    .in('tag_key', tagKeys)
  const rows = (data ?? []) as { profile_id: string; tag_key: string; assigned_at: string | null }[]

  const byTag = new Map<string, { members: number; last30: number }>()
  const attributedProfiles = new Set<string>()
  for (const r of rows) {
    attributedProfiles.add(r.profile_id)
    const e = byTag.get(r.tag_key) ?? { members: 0, last30: 0 }
    e.members++
    if (r.assigned_at && Date.parse(r.assigned_at) >= since) e.last30++
    byTag.set(r.tag_key, e)
  }

  const attributed = attributedProfiles.size
  const { count } = await db.from('profiles').select('id', { count: 'exact', head: true })
  const totalMembers = count ?? attributed

  const out: ChannelRollupRow[] = ACQUISITION_CHANNELS.map((c) => {
    const e = byTag.get(channelTag(c)) ?? { members: 0, last30: 0 }
    return {
      channel: c,
      label: CHANNEL_LABEL[c],
      members: e.members,
      last30: e.last30,
      share: attributed ? e.members / attributed : 0,
    }
  })
    .filter((r) => r.members > 0)
    .sort((a, b) => b.members - a.members)

  return { rows: out, attributed, totalMembers, coverage: totalMembers ? attributed / totalMembers : 0 }
}
