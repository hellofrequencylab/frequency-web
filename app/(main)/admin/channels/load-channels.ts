import { createAdminClient } from '@/lib/supabase/admin'

// The row the operator list renders: a TOPICAL channel (the live table), never the retired
// `channels` table. `slug` is what the Channel page resolves, so the list can link straight in.
export type ChannelRow = {
  id: string
  name: string
  slug: string
  category: string
  description: string | null
  is_active: boolean
  created_at: string
  pillar: { name: string } | null
}

export type PillarOption = { id: string; name: string }

// "Manage channels" data for the /admin/channels page (and the in-place Spaces·Channels
// module, ADR-138). Reads `topical_channels`, the ONE channel table the member-facing pages
// read (`/channels` and `/channels/[id]`), and splits the rows into shown / hidden on
// `is_active`, the same flag the Channel page checks before it renders.
//
// Until L9-01 (2026-09-05) this read the retired `channels` table (0 rows in production),
// so the console listed nothing while members could see every live channel, and derived
// hub/nexus/outpost "scope options" for a New Channel form that wrote to the same dead
// table. Topical channels are global and sort under a Pillar, so the create dialog needs the
// Pillar options instead; they load here alongside the rows.
export async function getChannelsAdminData() {
  const admin = createAdminClient()

  const [{ data: pillarsData }, { data: channels }] = await Promise.all([
    admin
      .from('pillars')
      .select('id, name')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    admin
      .from('topical_channels')
      .select(
        `id, name, slug, category, description, is_active, created_at,
         pillar:pillars!pillar_id ( name )`,
      )
      .order('created_at', { ascending: false }),
  ])

  const pillars = (pillarsData ?? []) as PillarOption[]
  const typedChannels = (channels ?? []) as unknown as ChannelRow[]
  const visible = typedChannels.filter((c) => c.is_active)
  const hidden = typedChannels.filter((c) => !c.is_active)

  return { pillars, visible, hidden }
}
