'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'admin' | 'janitor'
type ChannelScope = 'hub' | 'nexus' | 'outpost'

async function getMyProfile(): Promise<{
  id: string
  community_role: CommunityRole
} | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!data || !data.community_role) return null
  return { id: data.id, community_role: data.community_role }
}

async function getMyProfileId(): Promise<string | null> {
  const profile = await getMyProfile()
  return profile?.id ?? null
}

// ─── Legacy hub/nexus-scoped channels (will be renamed to "focus groups" in Phase 3.6) ───

export async function createChannel(formData: FormData) {
  const name = (formData.get('name') as string | null)?.trim()
  const description = (formData.get('description') as string | null)?.trim() || null
  const scope = formData.get('scope') as ChannelScope | null
  const scopeId = formData.get('scopeId') as string | null
  const type = (formData.get('type') as string | null) ?? 'group'
  const isPublic = formData.get('isPublic') !== 'false'

  if (!name || !scope || !scopeId) return

  const profile = await getMyProfile()
  if (!profile) return

  const roleOrder: CommunityRole[] = ['member', 'crew', 'host', 'guide', 'mentor', 'janitor']
  const roleIndex = roleOrder.indexOf(profile.community_role)

  // Role → minimum scope allowed
  // host → hub-scoped only
  // guide → nexus-scoped or below
  // mentor → any scope
  if (scope === 'hub' && roleIndex < roleOrder.indexOf('host')) return
  if (scope === 'nexus' && roleIndex < roleOrder.indexOf('guide')) return
  if (scope === 'outpost' && roleIndex < roleOrder.indexOf('mentor')) return

  const supabase = await createClient()
  const { data: channel, error } = await supabase
    .from('channels')
    .insert({
      name,
      description,
      creator_id: profile.id,
      creator_role: profile.community_role,
      scope,
      scope_id: scopeId,
      type: type as Database['public']['Tables']['channels']['Insert']['type'],
      is_public: isPublic,
    })
    .select('id')
    .single()

  if (error || !channel) {
    console.error('createChannel error', error)
    return
  }

  // Auto-join creator
  await supabase.from('channel_memberships').insert({
    channel_id: channel.id,
    profile_id: profile.id,
    status: 'active',
  })

  revalidatePath('/channels')
  redirect(`/channels/${channel.id}`)
}

export async function joinChannel(channelId: string) {
  const profile = await getMyProfile()
  if (!profile) return

  const supabase = await createClient()
  await supabase.from('channel_memberships').upsert({
    channel_id: channelId,
    profile_id: profile.id,
    status: 'active',
  }, { onConflict: 'channel_id,profile_id' })

  revalidatePath('/channels')
  revalidatePath(`/channels/${channelId}`)
}

export async function leaveChannel(channelId: string) {
  const profile = await getMyProfile()
  if (!profile) return

  const supabase = await createClient()
  await supabase
    .from('channel_memberships')
    .delete()
    .eq('channel_id', channelId)
    .eq('profile_id', profile.id)

  revalidatePath('/channels')
  revalidatePath(`/channels/${channelId}`)
}

// ─── Topical Channels (Hierarchy v3, global topical layer) ───

// Tunes the viewer in and drops them straight into the channel. The user
// asked us to stop returning them to the channel list after they hit
// "Tune in", since the natural next move is to read the channel.
export async function tuneInChannel(channelId: string, slug: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  const supabase = await createClient()
  await supabase
    .from('topical_channel_memberships')
    .upsert(
      { topical_channel_id: channelId, profile_id: profileId },
      { onConflict: 'topical_channel_id,profile_id' },
    )

  revalidatePath('/channels')
  revalidatePath(`/channels/${slug}`)
  redirect(`/channels/${slug}`)
}

export async function tuneOutChannel(channelId: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  const supabase = await createClient()
  await supabase
    .from('topical_channel_memberships')
    .delete()
    .eq('topical_channel_id', channelId)
    .eq('profile_id', profileId)

  revalidatePath('/channels')
  revalidatePath(`/channels/${channelId}`)
}

// Creates a new topical channel. Host+ only (these are global, so we keep
// the bar above member/crew). After creation, sends the creator to the
// channel they just spun up.
export async function createTopicalChannel(formData: FormData): Promise<void> {
  const me = await getMyProfile()
  if (!me) throw new Error('You need to be signed in.')

  const allowed: CommunityRole[] = ['host', 'guide', 'mentor', 'janitor']
  if (!allowed.includes(me.community_role)) {
    throw new Error('Channels can be created by hosts and above.')
  }

  const name = String(formData.get('name') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim() || null
  const category = String(formData.get('category') ?? '').trim()
  const domainId = String(formData.get('domainId') ?? '').trim() || null

  if (!name) throw new Error('Give the channel a name.')
  if (name.length > 80) throw new Error('Channel names need to be 80 characters or fewer.')
  if (!category) throw new Error('Pick a category so people can find it.')

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)

  if (!slug) throw new Error('That name does not produce a usable URL. Try something with letters or numbers.')

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('topical_channels')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (existing) throw new Error('A channel with that name already exists.')

  // Only accept a domain the host actually picked from the live list, so an
  // assignment can never point at a stale or non-existent Channel.
  let resolvedDomainId: string | null = null
  if (domainId) {
    const { data: domain } = await admin
      .from('domains')
      .select('id')
      .eq('id', domainId)
      .eq('is_active', true)
      .maybeSingle()
    resolvedDomainId = domain?.id ?? null
  }

  const { data: created, error } = await admin
    .from('topical_channels')
    .insert({ name, slug, category, description, domain_id: resolvedDomainId, is_active: true })
    .select('id, slug')
    .single()

  if (error || !created) throw new Error(error?.message ?? 'Could not create the channel.')

  await admin
    .from('topical_channel_memberships')
    .upsert(
      { topical_channel_id: created.id, profile_id: me.id },
      { onConflict: 'topical_channel_id,profile_id' },
    )

  revalidatePath('/channels')
  redirect(`/channels/${created.slug}`)
}
