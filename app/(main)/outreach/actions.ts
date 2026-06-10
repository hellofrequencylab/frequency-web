'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole, type CommunityRole } from '@/lib/core/roles'
import { sendDispatchNotificationEmail } from '@/lib/email'
import { shouldSend } from '@/lib/notification-preferences'
import { sendPushToProfile } from '@/lib/push'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Outreach — a steward's DIRECT note to the members they lead (distinct from a public
// Broadcast/dispatch). Reaches the inbox + push of everyone in the scope(s) you steward,
// through the same notification spine Broadcast uses. No public post, no new table.

type AdminClient = ReturnType<typeof createAdminClient>
type OwnedScope = { scope: 'circle' | 'hub' | 'nexus'; id: string }

/** The circles/hubs/nexuses this steward actually leads (their reach). */
async function ownedScopes(admin: AdminClient, role: CommunityRole, profileId: string): Promise<OwnedScope[]> {
  if (role === 'host') {
    const { data } = await admin.from('circles').select('id').eq('host_id', profileId)
    return (data ?? []).map((c) => ({ scope: 'circle' as const, id: c.id as string }))
  }
  if (role === 'guide') {
    const { data } = await admin.from('hubs').select('id').eq('guide_id', profileId)
    return (data ?? []).map((h) => ({ scope: 'hub' as const, id: h.id as string }))
  }
  // mentor / janitor → the nexuses they mentor
  const { data } = await admin.from('nexus_regions').select('id').eq('mentor_id', profileId)
  return (data ?? []).map((n) => ({ scope: 'nexus' as const, id: n.id as string }))
}

/** Active member profile ids within a scope (a hub/nexus rolls up through its circles). */
async function scopeMemberIds(admin: AdminClient, s: OwnedScope): Promise<string[]> {
  let circleIds: string[]
  if (s.scope === 'circle') {
    circleIds = [s.id]
  } else if (s.scope === 'hub') {
    const { data } = await admin.from('circles').select('id').eq('hub_id', s.id)
    circleIds = (data ?? []).map((c) => c.id as string)
  } else {
    const { data: hubs } = await admin.from('hubs').select('id').eq('nexus_id', s.id)
    const hubIds = (hubs ?? []).map((h) => h.id as string)
    if (!hubIds.length) return []
    const { data } = await admin.from('circles').select('id').in('hub_id', hubIds)
    circleIds = (data ?? []).map((c) => c.id as string)
  }
  if (!circleIds.length) return []
  const { data } = await admin
    .from('memberships')
    .select('profile_id')
    .in('circle_id', circleIds)
    .eq('status', 'active')
  return (data ?? []).map((m) => m.profile_id as string)
}

export async function sendOutreach(message: string): Promise<ActionResult<{ sent: number }>> {
  const caller = await getCallerProfile()
  if (!caller || !atLeastRole(caller.community_role, 'host')) return fail('Outreach is a steward tool.')

  const body = message.trim()
  if (!body) return fail('Write a message first.')
  if (body.length > 2000) return fail('Keep it under 2000 characters.')

  const admin = createAdminClient()
  const scopes = await ownedScopes(admin, caller.community_role, caller.id)
  if (!scopes.length) return fail('You don’t lead a circle, hub, or region yet, so there’s nobody to reach.')

  // Unique recipients across every scope you lead, minus yourself.
  const ids = new Set<string>()
  for (const s of scopes) for (const id of await scopeMemberIds(admin, s)) ids.add(id)
  ids.delete(caller.id)
  const profileIds = [...ids]
  if (!profileIds.length) return ok({ sent: 0 })

  const authorName = caller.id
    ? ((await admin.from('profiles').select('display_name').eq('id', caller.id).maybeSingle()).data?.display_name ?? 'Your steward')
    : 'Your steward'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, display_name, auth_user_id')
    .in('id', profileIds)

  let sent = 0
  for (const p of profiles ?? []) {
    if (!p.auth_user_id) continue
    let notified = false
    if (await shouldSend(p.id, 'email', 'dispatches')) {
      const { data: { user } } = await admin.auth.admin.getUserById(p.auth_user_id)
      if (user?.email) {
        await sendDispatchNotificationEmail({
          to: user.email,
          recipientName: p.display_name,
          recipientProfileId: p.id,
          authorName,
          dispatchTitle: `A note from ${authorName}`,
          excerpt: body,
          dispatchUrl: `${appUrl}/feed`,
        })
        notified = true
      }
    }
    const pushSent = await sendPushToProfile(p.id, {
      title: `✉️ ${authorName}`,
      body: body.slice(0, 180),
      url: '/feed',
      tag: `outreach-${caller.id}`,
    }, 'dispatches')
    if (pushSent > 0) notified = true
    if (notified) sent++
  }

  revalidatePath('/outreach')
  return ok({ sent })
}
