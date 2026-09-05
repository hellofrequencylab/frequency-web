'use server'

import { isChannelCategory } from '@/lib/channels/categories'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { atLeastRole, asWebRole, isStaff, type CommunityRole, type WebRole } from '@/lib/core/roles'
import { assertCanCreate } from '@/lib/core/load-capabilities'
import { startChapter } from '@/lib/channels/programs'

async function getMyProfile(): Promise<{
  id: string
  community_role: CommunityRole
  webRole: WebRole
} | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, community_role, web_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!data || !data.community_role) return null
  return { id: data.id, community_role: data.community_role, webRole: asWebRole(data.web_role) }
}

async function getMyProfileId(): Promise<string | null> {
  const profile = await getMyProfile()
  return profile?.id ?? null
}

// ─── Legacy hub/nexus-scoped channels: RETIRED (L9-01, 2026-09-05) ───
// `createChannel` used to live here. It inserted into the retired `channels` +
// `channel_memberships` tables (0 rows in production) and redirected to
// `/channels/<uuid>`, which the Channel page resolves ONLY against
// `topical_channels`, so the operator "New Channel" flow on /admin/channels
// ended on a 404 and the channel never reached members. The operator console
// now uses `createTopicalChannel` below, the ONE creator; nothing writes the
// legacy tables from this file anymore. `app/(main)/channels/actions.test.ts`
// pins both facts. For the record, the retired gate read (kept verbatim so the
// ladder lesson is not lost with the function):
//   Role → minimum scope allowed. Use the canonical ladder (lib/core/roles) so a Site
//   Admin / Executive Admin (above mentor on the hierarchy) clears every threshold; the
//   old hand-rolled array dropped 'admin', so an admin's index was -1 and every gate
//   silently failed (admins could not create channels at all).
//     hub    → host+
//     nexus  → guide+
//     outpost→ mentor+

// ─── Topical Channels (Hierarchy v3, global topical layer) ───

// Tunes the viewer in and drops them straight into the channel. The user
// asked us to stop returning them to the channel list after they hit
// "Tune in", since the natural next move is to read the channel.
export async function tuneInChannel(channelId: string, slug: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  const supabase = await createClient()
  const { error } = await supabase
    .from('topical_channel_memberships')
    .upsert(
      { topical_channel_id: channelId, profile_id: profileId },
      { onConflict: 'topical_channel_id,profile_id' },
    )
  // Don't route the member into the channel as if they tuned in when the write
  // failed — surface it (the redirect below is the "success" signal).
  if (error) throw new Error('Could not tune you in. Please try again.')

  revalidatePath('/channels')
  revalidatePath(`/channels/${slug}`)
  redirect(`/channels/${slug}`)
}

export async function tuneOutChannel(channelId: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  const supabase = await createClient()
  const { error } = await supabase
    .from('topical_channel_memberships')
    .delete()
    .eq('topical_channel_id', channelId)
    .eq('profile_id', profileId)
  if (error) throw new Error('Could not tune you out. Please try again.')

  revalidatePath('/channels')
  revalidatePath(`/channels/${channelId}`)
}

// ─── Programs on Channels: Chapters ───

// Starts a Chapter of a program Channel: clones the channel's blueprint into a
// private draft the member owns (the Remix flow), stamped into the channel.
// The gate mirrors remixTemplateAction in app/(main)/circles/remix-actions.ts
// EXACTLY: a real (non-demo) member with the `circle.create` capability (ADR-414;
// Crew is free during the beta). A Chapter IS a Circle the caller hosts, so it
// takes the same gate creating one does — ADR-891 closed the hole where this
// path skipped it. The caller routes into the draft builder, same as Remix.
export async function startChapterAction(
  channelId: string,
): Promise<{ circleId: string; slug: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Please sign in to start a Chapter.')

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, is_demo')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = data as { id: string; is_demo?: boolean } | null
  if (!me || me.is_demo) throw new Error('Only real members can start a Chapter.')

  await assertCanCreate('circle.create')

  const res = await startChapter({ channelId, profileId: me.id })
  revalidatePath('/circles')
  revalidatePath('/lead')
  return res
}

// Creates a new topical channel. Host+ only (these are global, so we keep
// the bar above member/crew). After creation, sends the creator to the
// channel they just spun up. This is THE creator: the operator console on
// /admin/channels calls it too (L9-01), which is why the gate also admits
// platform STAFF on the web_role axis (ADR-208) - requireAdmin lets a staffer
// with the 'community' capability onto that page whatever their community rung.
// The ladder check uses the canonical rank (lib/core/roles) rather than a
// hand-written list: the old array skipped the 'admin' rung, so a community
// admin was refused while a mentor was let through.
export async function createTopicalChannel(formData: FormData): Promise<void> {
  const me = await getMyProfile()
  if (!me) throw new Error('You need to be signed in.')

  if (!atLeastRole(me.community_role, 'host') && !isStaff(me.webRole)) {
    throw new Error('Channels can be created by hosts and above.')
  }

  const name = String(formData.get('name') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim() || null
  const rawCategory = String(formData.get('category') ?? '').trim()
  const domainId = String(formData.get('domainId') ?? '').trim() || null

  if (!name) throw new Error('Give the channel a name.')
  if (name.length > 80) throw new Error('Channel names need to be 80 characters or fewer.')
  if (!rawCategory) throw new Error('Pick a category so people can find it.')
  // The vocabulary is CLOSED (lib/channels/categories.ts): the icon and accent on the Channel page
  // and the directory card are picked from it, and a free-text value here used to reach the DB
  // unchecked. That was not just untidy - a category named 'toString' crashed the render (the icon
  // map inherited Object.prototype), and any host can call this action. Refuse off-list values in
  // words rather than persisting them.
  if (!isChannelCategory(rawCategory)) throw new Error('Pick one of the listed categories.')
  const category = rawCategory

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

  // Only accept a pillar the host actually picked from the live list, so an
  // assignment can never point at a stale or non-existent Pillar.
  let resolvedPillarId: string | null = null
  if (domainId) {
    const { data: pillar } = await (admin)
      .from('pillars')
      .select('id')
      .eq('id', domainId)
      .eq('is_active', true)
      .maybeSingle()
    resolvedPillarId = pillar?.id ?? null
  }

  const { data: created, error } = await (admin)
    .from('topical_channels')
    .insert({ name, slug, category, description, pillar_id: resolvedPillarId, is_active: true })
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
