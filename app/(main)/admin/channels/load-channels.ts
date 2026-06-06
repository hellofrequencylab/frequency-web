import { createAdminClient } from '@/lib/supabase/admin'

export type ChannelRow = {
  id: string
  name: string
  description: string | null
  type: string
  scope: string
  is_public: boolean
  created_at: string
  creator: { display_name: string } | null
}

export type ChannelScopeOption = { scope: 'hub' | 'nexus' | 'outpost'; scopeId: string; label: string }

// "Manage channels in scope" data for the in-place Spaces·Channels module (ADR-138)
// and the /admin/channels page (which adopts this loader). Derives the New Channel
// scope options from the admin's primary circle, then splits channels public/hidden.
export async function getChannelsAdminData(profileId: string) {
  const admin = createAdminClient()

  const scopeOptions: ChannelScopeOption[] = []
  const { data: membership } = await admin
    .from('memberships')
    .select(
      `circle:circles!circle_id (
        hub:hubs!hub_id ( id, name, nexus:nexuses!nexus_id ( id, name, outpost:outposts!outpost_id ( id, name ) ) )
      )`,
    )
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (membership) {
    const m = membership as unknown as {
      circle: {
        hub: {
          id: string
          name: string
          nexus: { id: string; name: string; outpost: { id: string; name: string } | null } | null
        } | null
      } | null
    }
    const hub = m.circle?.hub
    const nexus = hub?.nexus
    const outpost = nexus?.outpost
    if (hub) scopeOptions.push({ scope: 'hub', scopeId: hub.id, label: `Hub: ${hub.name}` })
    if (nexus) scopeOptions.push({ scope: 'nexus', scopeId: nexus.id, label: `Nexus: ${nexus.name}` })
    if (outpost) scopeOptions.push({ scope: 'outpost', scopeId: outpost.id, label: `Outpost: ${outpost.name}` })
  }

  const { data: channels } = await admin
    .from('channels')
    .select(
      `id, name, description, type, scope, is_public, created_at,
       creator:profiles!creator_id ( display_name )`,
    )
    .order('created_at', { ascending: false })

  const typedChannels = (channels ?? []) as unknown as ChannelRow[]
  const visible = typedChannels.filter((c) => c.is_public)
  const hidden = typedChannels.filter((c) => !c.is_public)

  return { scopeOptions, visible, hidden }
}
