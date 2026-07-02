'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { getCallerProfile, type CommunityRole } from '@/lib/auth'
import type { Database } from '@/lib/database.types'
import { sendDispatchNotificationEmail } from '@/lib/email'
import { shouldSend } from '@/lib/notification-preferences'
import { sendPushToProfile } from '@/lib/push'
import { slugify } from '@/lib/utils'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { awardZapsForAction } from '@/lib/zaps'
import { processGamificationEvent } from '@/lib/achievements'
import { cancelAudit, reinstateAudit } from '@/lib/events/event-lifecycle'
import { atLeastRole, isStaff, isJanitor } from '@/lib/core/roles'
import { coerceTierZaps } from '@/lib/practices/tiers'
import { stampCircleSpaceId } from '@/lib/circles/store'
import { verifyCrewCompletion } from '@/lib/crew/verify'
import { assignTraining } from '@/lib/onboarding/training'
import { markWalkthroughPending } from '@/lib/walkthroughs/progress'
import { promotionStepsCrossed, ROLE_PROMOTION_SLUG } from '@/lib/walkthroughs/role-promotion'
import { authorizeAction } from '@/lib/admin/guard'
import { logAdminAction } from '@/lib/admin/audit'
import { getStaffMember } from '@/lib/staff'
import { staffCan, type StaffDomain } from '@/lib/core/staff-roles'
import {
  getCircleCapabilities,
  getHubCapabilities,
  getNexusCapabilities,
  getEventCapabilities,
  getGlobalCapabilities,
} from '@/lib/core/load-capabilities'

// Community-surface mutations accept community host+ OR a staff role with the
// 'community' capability (ADR-127). Sensitive mutations (member/role management)
// deliberately keep the plain community-role gate below.
async function requireCommunityOps() {
  return authorizeAction(await getCallerProfile(), 'host', 'community')
}

// Scope-aware authorization for STRUCTURE/EVENT mutations (P1.2 security fix). A
// plain steward may only mutate a scope they actually manage — `hasScopeCap` comes
// from the per-scope resolver (host of THIS circle, guide/mentor of its parent, etc.,
// see lib/core/capabilities.ts). Platform operators keep global reach: community
// admin+ OR a staff role holding `staffDomain` (write). This closes the cross-scope
// hole (a host of one circle editing another) without removing legitimate operator
// access. Returns the non-null caller, like `authorizeAction`.
async function requireScopedManage<T extends { community_role: CommunityRole; webRole: import('@/lib/core/roles').WebRole }>(
  caller: T | null,
  hasScopeCap: boolean,
  staffDomain: StaffDomain,
): Promise<T> {
  if (!caller) throw new Error('Unauthorized')
  if (hasScopeCap) return caller // manages this specific scope
  if (isStaff(caller.webRole)) return caller // platform staff (web_role admin/janitor, ADR-208) — global
  const staff = await getStaffMember().catch(() => null)
  if (staffCan(staff?.role ?? null, staffDomain, 'write')) return caller // staff operator — global
  throw new Error('Unauthorized')
}

// ── Member management ─────────────────────────────────────────────────────────

export async function assignRole(profileId: string, role: CommunityRole) {
  // Role granting is a sensitive, platform-level action — NOT a steward power. The
  // janitor-only /admin/roles UI is not the authority; this server action is a public
  // endpoint and must gate itself (P1.2 — closes a privilege-escalation hole where a
  // host could grant itself janitor by calling the action directly).
  const caller = await getCallerProfile()
  const staff = await getStaffMember().catch(() => null)
  // "Super" = Executive Admin on the STAFF axis (web_role janitor, ADR-208) or a
  // team_members owner — the only granters of the top tiers.
  const isSuper = !!caller && (isJanitor(caller.webRole) || staff?.role === 'owner')
  // Full granters (janitor / owner) OR a staff member with the 'roles' capability (admin).
  if (!caller || (!isSuper && !staffCan(staff?.role ?? null, 'roles', 'write'))) {
    throw new Error('Unauthorized')
  }
  // Only a super (janitor / owner) may grant the top tiers — an admin assigns roles BELOW it.
  if (atLeastRole(role, 'admin') && !isSuper) {
    throw new Error('Only an owner or janitor can grant admin or janitor.')
  }
  const admin = createAdminClient()
  // Read the prior role first, so we know which trust rungs this grant CROSSES and can
  // queue the matching role-promotion tour(s). Best-effort: a read miss just means no tour.
  const { data: prior } = await admin
    .from('profiles')
    .select('community_role')
    .eq('id', profileId)
    .maybeSingle()
  const { error } = await admin.from('profiles').update({ community_role: role }).eq('id', profileId)
  if (error) throw new Error(error.message)
  processGamificationEvent({ type: 'role_change', profileId, role }).catch(() => {})
  // Assign the role's training Journey on promotion (ADR-157 §7.1). Best-effort.
  assignTraining(profileId, role).catch(() => {})
  // Queue the role-promotion tour(s) for every rung this grant crossed (P1.8). The member
  // sees the gentle tour card on their next feed visit. Best-effort — never blocks the
  // grant or its audit. No email; pull-based surfacing only.
  for (const step of promotionStepsCrossed(prior?.community_role ?? null, role)) {
    markWalkthroughPending(profileId, ROLE_PROMOTION_SLUG[step]).catch(() => {})
  }
  // Audit the role grant — a crown-jewel platform action (P8). Best-effort.
  await logAdminAction({ actorId: caller.id, action: 'role.assign', targetType: 'profile', targetId: profileId, detail: { role } })
  revalidatePath('/admin')
}

export async function deactivateMember(profileId: string) {
  // Deactivating an account is a platform-wide staff action (ADR-127), NOT a steward
  // power: gate on the STAFF axis (janitor) exactly like its siblings reactivate /
  // delete / sendMagicLink. The prior community-`host` gate let a host of a single
  // circle disable ANY account platform-wide via a crafted profileId.
  const caller = await getCallerProfile()
  if (!caller || !isJanitor(caller.webRole)) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ is_active: false }).eq('id', profileId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function updateMemberProfile(profileId: string, fd: FormData) {
  const caller = await getCallerProfile()
  if (!caller || !isJanitor(caller.webRole)) throw new Error('Unauthorized')
  const admin = createAdminClient()

  const updates: Database['public']['Tables']['profiles']['Update'] = {}
  const name = (fd.get('display_name') as string)?.trim()
  const handle = (fd.get('handle') as string)?.trim()
  const bio = (fd.get('bio') as string)?.trim()
  const avatarUrl = (fd.get('avatar_url') as string | null)?.trim()
  if (name) updates.display_name = name
  if (handle) updates.handle = handle
  if (bio !== undefined) updates.bio = bio || null
  // Only https URLs; clearing the field clears the avatar. Lets janitors set the
  // system voice's face (Vera has no sign-in to upload her own, ADR-231).
  if (avatarUrl !== undefined && avatarUrl !== null) {
    if (avatarUrl && !/^https:\/\//.test(avatarUrl)) throw new Error('Avatar URL must start with https://')
    updates.avatar_url = avatarUrl || null
  }

  const { error } = await admin.from('profiles').update(updates).eq('id', profileId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
  revalidatePath('/admin/members')
  revalidatePath('/people', 'layout')
}

export async function reactivateMember(profileId: string) {
  const caller = await getCallerProfile()
  if (!caller || !isJanitor(caller.webRole)) throw new Error('Unauthorized')
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ is_active: true }).eq('id', profileId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
  revalidatePath('/admin/members')
}

export async function sendMagicLink(profileId: string) {
  const caller = await getCallerProfile()
  if (!caller || !isJanitor(caller.webRole)) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('auth_user_id')
    .eq('id', profileId)
    .maybeSingle()
  if (!profile?.auth_user_id) throw new Error('Profile not found')

  const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
  if (!user?.email) throw new Error('No email found for this user')

  const { error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'}/auth/callback`,
    },
  })
  if (error) throw new Error(error.message)
  return { email: user.email }
}

export async function deleteUserAccount(profileId: string) {
  const caller = await getCallerProfile()
  if (!caller || !isJanitor(caller.webRole)) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('auth_user_id, is_system')
    .eq('id', profileId)
    .maybeSingle()
  if (!profile) throw new Error('Profile not found')
  if (profile.is_system) throw new Error('The system account cannot be deleted.')

  await admin.from('profiles').update({ is_active: false }).eq('id', profileId)

  if (profile.auth_user_id) {
    const { error } = await admin.auth.admin.deleteUser(profile.auth_user_id)
    if (error) throw new Error(error.message)
  } else {
    // No linked auth user (e.g. an imported profile): delete the row directly.
    // FKs to profiles now cascade or set null, so this succeeds.
    const { error } = await admin.from('profiles').delete().eq('id', profileId)
    if (error) throw new Error(error.message)
  }

  revalidatePath('/admin')
  revalidatePath('/admin/members')
}

// ── Circles ───────────────────────────────────────────────────────────────────

export async function createCircle(fd: FormData) {
  const caller = await getCallerProfile()
  if (!caller) throw new Error('You need to be signed in.')

  const topical_channel_id = (fd.get('topical_channel_id') as string) || null

  // Admin-managed circles need community host+ OR a staff role with community ops
  // (ADR-127). Bottom-up circles created from a topical channel (the "I want to
  // start a local crew practicing X" path) stay open to any signed-in member.
  if (!topical_channel_id) {
    await authorizeAction(caller, 'host', 'community')
  }

  const name    = (fd.get('name') as string).trim()
  const about   = (fd.get('about') as string)?.trim() || null
  const type    = ((fd.get('type') as string) || 'in-person') as Database['public']['Enums']['circle_type']
  const cap     = parseInt(fd.get('member_cap') as string) || 12
  const hub_id  = (fd.get('hub_id') as string) || null
  const status  = ((fd.get('status') as string) || 'forming') as Database['public']['Enums']['group_status']
  const host_id = (fd.get('host_id') as string) || caller.id
  let slug      = slugify(name)

  const admin = createAdminClient()
  // Ensure unique slug
  const { data: existing } = await admin.from('circles').select('id').eq('slug', slug).maybeSingle()
  if (existing) slug = slug + '-' + Math.random().toString(36).slice(2, 5)

  // Stamp the owning Space (defaults to the root space, so this single-tenant flow keeps
  // behaving exactly as today). space_id is newer than the generated DB types — cast the
  // payload to reach the column (ADR-246); omit the field when the root row is missing.
  const spaceId = await stampCircleSpaceId()
  const { data: circle, error } = await admin.from('circles').insert({
    name, about, type, member_cap: cap, hub_id, status, slug,
    host_id, member_count: 0,
    ...(topical_channel_id ? { topical_channel_id } : {}),
    ...(spaceId ? { space_id: spaceId } : {}),
  } as never).select('id').single()
  if (error) throw new Error(error.message)

  // The host is a member of their own circle (so they can post, log practice,
  // and use it fully). member_count is trigger-maintained on membership insert.
  await admin.from('memberships').insert({
    profile_id: host_id,
    circle_id: circle.id,
    status: 'active',
  })

  // Lifecycle reward: starting a circle (once per circle). Routes through the
  // engagement ledger (idempotent); credits live today, will land in the Vault
  // for free users once the entitlement layer ships (ADR-037).
  try {
    const { recorded } = await recordEngagementEvent({
      idempotencyKey: `circle_start:${circle.id}`,
      source: 'web',
      eventType: 'circle.started',
      actorProfileId: host_id,
      context: { circleId: circle.id },
    })
    if (recorded) await awardZapsForAction(host_id, 'circle_start')
  } catch {
    // a reward failure must never block circle creation
  }

  // Announce the new circle to the wider audience (hub members, or the topical
  // channel's followers if the circle has no hub). Cluster visibility resolves
  // that audience at read time; scope_id stays the circle so it also shows on
  // the circle page and in the host's own feed.
  await admin.from('posts').insert({
    author_id:  host_id,
    body:       about ? `Started a new circle: ${name}.\n\n${about}` : `Started a new circle: ${name}.`,
    scope_id:   circle.id,
    visibility: 'cluster',
    post_type:  'announcement',
    is_pinned:  true,
  })

  revalidatePath('/admin/circles')
  revalidatePath('/circles')
  revalidatePath('/channels')
  revalidatePath('/feed')
}

export async function updateCircle(id: string, fd: FormData) {
  const caps = await getCircleCapabilities(id)
  const caller = await requireScopedManage(await getCallerProfile(), caps.has('circle.editSettings'), 'community')
  const admin = createAdminClient()
  // Optional fields are only written when present in the form, so a partial form never clears
  // image/location/resonance it didn't show.
  const opt: Record<string, unknown> = {}
  if (fd.has('image_url')) opt.image_url = (fd.get('image_url') as string)?.trim() || null
  if (fd.has('city')) opt.city = (fd.get('city') as string)?.trim() || null
  if (fd.has('neighborhood')) opt.neighborhood = (fd.get('neighborhood') as string)?.trim() || null
  if (fd.has('resonance_public')) opt.resonance_public = fd.get('resonance_public') === 'on'

  const { error } = await admin.from('circles').update({
    name:       (fd.get('name') as string).trim(),
    about:      (fd.get('about') as string)?.trim() || null,
    type:       fd.get('type') as Database['public']['Enums']['circle_type'],
    member_cap: parseInt(fd.get('member_cap') as string) || 12,
    hub_id:     (fd.get('hub_id') as string) || null,
    status:     fd.get('status') as Database['public']['Enums']['group_status'],
    host_id:    (fd.get('host_id') as string) || caller.id,
    ...opt,
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/circles')
  revalidatePath('/circles')
  revalidatePath('/circles/[slug]', 'page')
}

// Host self-service circle settings (the full-page /circles/[slug]/settings editor). Writes only
// the fields a host owns — identity, cover, location, resonance — and deliberately NOT hub / host
// / status (those stay admin/structure concerns), so a host form never reassigns or archives.
export async function updateCircleSettings(id: string, fd: FormData) {
  const caps = await getCircleCapabilities(id)
  await requireScopedManage(await getCallerProfile(), caps.has('circle.editSettings'), 'community')
  const name = (fd.get('name') as string)?.trim()
  if (!name) throw new Error('Name is required')
  const admin = createAdminClient()
  const { error } = await admin
    .from('circles')
    .update({
      name,
      about: (fd.get('about') as string)?.trim() || null,
      type: fd.get('type') as Database['public']['Enums']['circle_type'],
      member_cap: parseInt(fd.get('member_cap') as string) || 12,
      image_url: (fd.get('image_url') as string)?.trim() || null,
      city: (fd.get('city') as string)?.trim() || null,
      neighborhood: (fd.get('neighborhood') as string)?.trim() || null,
      resonance_public: fd.get('resonance_public') === 'on',
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/circles')
  revalidatePath('/circles/[slug]', 'page')
  revalidatePath('/admin/circles')
}

export async function archiveCircle(id: string) {
  const caps = await getCircleCapabilities(id)
  await requireScopedManage(await getCallerProfile(), caps.has('circle.editSettings'), 'community')
  const admin = createAdminClient()
  const { error } = await admin.from('circles').update({ status: 'archived' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/circles')
  revalidatePath('/circles')
}

// Operator curation: stamp (or clear) a circle's featured marker. Gated on the
// platform `admin.access` capability so only operators can hand-pick the circles
// that surface first in discovery. `featured_at` doubles as the ordering key.
export async function setCircleFeaturedAction(id: string, on: boolean): Promise<ActionResult> {
  if (!(await getGlobalCapabilities()).has('admin.access')) return fail('Not allowed')
  const admin = createAdminClient()
  const { error } = await admin
    .from('circles')
    .update({ featured_at: on ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) return fail(error.message)
  revalidatePath('/admin/circles')
  revalidatePath('/circles')
  return ok()
}

// ── Invite links ─────────────────────────────────────────────────────────────

export async function createInviteLink(circleId: string): Promise<{ token: string }> {
  const caller = await requireCommunityOps()

  const token = randomBytes(12).toString('base64url')
  const admin = createAdminClient()

  // Deactivate any previous active link for this circle
  await admin
    .from('invite_links')
    .update({ is_active: false })
    .eq('circle_id', circleId)
    .eq('is_active', true)

  const { error } = await admin.from('invite_links').insert({
    token,
    circle_id:  circleId,
    created_by: caller.id,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/admin/circles')
  return { token }
}

// Public action. No role check, but validates token
export async function joinViaInviteLink(token: string): Promise<{ circleId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = createAdminClient()

  // Fetch and validate link
  const { data: link } = await admin
    .from('invite_links')
    .select('id, circle_id, created_by, max_uses, used_count, expires_at, is_active')
    .eq('token', token)
    .maybeSingle()

  if (!link || !link.is_active) throw new Error('Invite link is invalid or no longer active')
  if (link.expires_at && new Date(link.expires_at) < new Date()) throw new Error('Invite link has expired')
  if (link.max_uses > 0 && link.used_count >= link.max_uses) throw new Error('Invite link has reached its maximum uses')

  // Get caller profile
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) throw new Error('Profile not found')

  // Check not already a member
  const { data: existing } = await admin
    .from('memberships')
    .select('id')
    .eq('circle_id', link.circle_id)
    .eq('profile_id', profile.id)
    .maybeSingle()

  if (!existing) {
    const { error: joinError } = await admin.from('memberships').insert({
      circle_id:  link.circle_id,
      profile_id: profile.id,
      status:     'active',
    })
    if (joinError) throw new Error(joinError.message)

    // Increment used_count and update circle member_count
    await admin
      .from('invite_links')
      .update({ used_count: link.used_count + 1 })
      .eq('id', link.id)

    // Best-effort member count increment. Manual update since we may not have the RPC
    const { data: circleData } = await admin
      .from('circles')
      .select('member_count')
      .eq('id', link.circle_id)
      .maybeSingle()
    if (circleData) {
      await admin
        .from('circles')
        .update({ member_count: (circleData.member_count ?? 0) + 1 })
        .eq('id', link.circle_id)
    }

    // Lifecycle reward: the inviter, when someone they invited actually joins
    // (once per inviter+invitee). Real-world outreach -> zaps. Routes through
    // the ledger; will land in the Vault for free inviters once ADR-037 ships.
    if (link.created_by && link.created_by !== profile.id) {
      try {
        const { recorded } = await recordEngagementEvent({
          idempotencyKey: `invite_accepted:${link.created_by}:${profile.id}`,
          source: 'web',
          eventType: 'invite.accepted',
          actorProfileId: link.created_by,
          context: { circleId: link.circle_id, invitee: profile.id },
        })
        if (recorded) await awardZapsForAction(link.created_by, 'invite_accepted')
      } catch {
        // a reward failure must never block the join
      }
    }
  }

  revalidatePath('/circles')
  revalidatePath('/feed')
  return { circleId: link.circle_id }
}

// ── Channels ──────────────────────────────────────────────────────────────────

export async function archiveChannel(id: string) {
  await requireCommunityOps()
  const admin = createAdminClient()
  const { error } = await admin.from('channels').update({ is_public: false }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/channels')
  revalidatePath('/channels')
}

/** Edit a channel's name + description (visibility is handled by archive/unarchive). */
export async function updateChannel(id: string, fd: FormData) {
  await requireCommunityOps()
  const name = ((fd.get('name') as string) ?? '').trim()
  if (!name) throw new Error('Name is required')
  const admin = createAdminClient()
  const { error } = await admin
    .from('channels')
    .update({ name, description: ((fd.get('description') as string) ?? '').trim() || null })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/channels')
  revalidatePath('/channels')
}

/** Restore a hidden channel to discovery. */
export async function unarchiveChannel(id: string) {
  await requireCommunityOps()
  const admin = createAdminClient()
  const { error } = await admin.from('channels').update({ is_public: true }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/channels')
  revalidatePath('/channels')
}

// ── Hubs ──────────────────────────────────────────────────────────────────────

export async function createHub(fd: FormData) {
  const caller = await authorizeAction(await getCallerProfile(), 'guide', 'structure')

  const name     = (fd.get('name') as string).trim()
  const nexus_id = (fd.get('nexus_id') as string) || null
  const status   = ((fd.get('status') as string) || 'forming') as Database['public']['Enums']['group_status']
  const guide_id = (fd.get('guide_id') as string) || caller.id
  let slug       = slugify(name)

  const admin = createAdminClient()
  const { data: existing } = await admin.from('hubs').select('id').eq('slug', slug).maybeSingle()
  if (existing) slug = slug + '-' + Math.random().toString(36).slice(2, 5)

  const { error } = await admin.from('hubs').insert({ name, slug, nexus_id, status, guide_id })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/hubs')
}

export async function updateHub(id: string, fd: FormData) {
  const caps = await getHubCapabilities(id)
  const caller = await requireScopedManage(await getCallerProfile(), caps.has('hub.manage'), 'structure')
  const admin = createAdminClient()
  const { error } = await admin.from('hubs').update({
    name:     (fd.get('name') as string).trim(),
    nexus_id: (fd.get('nexus_id') as string) || null,
    status:   fd.get('status') as Database['public']['Enums']['group_status'],
    guide_id: (fd.get('guide_id') as string) || caller.id,
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/hubs')
}

// ── Nexuses ───────────────────────────────────────────────────────────────────

export async function createNexus(fd: FormData) {
  const caller = await authorizeAction(await getCallerProfile(), 'mentor', 'structure')

  const name       = (fd.get('name') as string).trim()
  const cap        = parseInt(fd.get('member_cap') as string) || 100
  const status     = ((fd.get('status') as string) || 'forming') as Database['public']['Enums']['group_status']
  const mentor_id  = (fd.get('mentor_id') as string) || caller.id
  const outpost_id = (fd.get('outpost_id') as string) || null
  if (!outpost_id) throw new Error('An outpost is required.')
  let slug         = slugify(name)

  const admin = createAdminClient()
  const { data: existing } = await admin.from('nexuses').select('id').eq('slug', slug).maybeSingle()
  if (existing) slug = slug + '-' + Math.random().toString(36).slice(2, 5)

  const { error } = await admin.from('nexuses').insert({ name, slug, member_cap: cap, status, mentor_id, outpost_id })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/nexuses')
}

export async function updateNexus(id: string, fd: FormData) {
  const caps = await getNexusCapabilities(id)
  const caller = await requireScopedManage(await getCallerProfile(), caps.has('nexus.manage'), 'structure')
  const admin = createAdminClient()
  const { error } = await admin.from('nexuses').update({
    name:       (fd.get('name') as string).trim(),
    member_cap: parseInt(fd.get('member_cap') as string) || 100,
    status:     fd.get('status') as Database['public']['Enums']['group_status'],
    mentor_id:  (fd.get('mentor_id') as string) || caller.id,
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/nexuses')
}

// ── Crew tasks ────────────────────────────────────────────────────────────────

export async function createCrewTask(fd: FormData) {
  await requireCommunityOps()
  const admin = createAdminClient()
  const { error } = await admin.from('crew_tasks').insert({
    name:                  (fd.get('name') as string).trim(),
    task_type:             fd.get('task_type') as string,
    zaps_value:            coerceTierZaps(parseInt(fd.get('zaps_value') as string, 10)),
    is_repeatable:         fd.get('is_repeatable') === 'true',
    requires_verification: fd.get('requires_verification') === 'true',
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/crew-tasks')
  revalidatePath('/crew')
}

export async function updateCrewTask(id: string, fd: FormData) {
  await requireCommunityOps()
  const admin = createAdminClient()
  const { error } = await admin.from('crew_tasks').update({
    name:                  (fd.get('name') as string).trim(),
    task_type:             fd.get('task_type') as string,
    zaps_value:            coerceTierZaps(parseInt(fd.get('zaps_value') as string, 10)),
    is_repeatable:         fd.get('is_repeatable') === 'true',
    requires_verification: fd.get('requires_verification') === 'true',
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/crew-tasks')
  revalidatePath('/crew')
}

export async function deleteCrewTask(id: string) {
  await requireCommunityOps()
  const admin = createAdminClient()
  const { error } = await admin.from('crew_tasks').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/crew-tasks')
  revalidatePath('/crew')
}

// ── Dispatches ───────────────────────────────────────────────────────────────

type DispatchScope = 'circle' | 'hub' | 'nexus'

function makeExcerpt(body: string, maxLen = 200): string {
  // Strip markdown syntax for the plain-text excerpt
  const plain = body
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\n+/g, ' ')
    .trim()
  return plain.length <= maxLen ? plain : plain.slice(0, maxLen).trimEnd() + '…'
}

export async function updateDispatch(id: string, fd: FormData) {
  await requireCommunityOps()

  const body           = (fd.get('body') as string).trim()
  const excerpt        = makeExcerpt(body)
  const dispatch_type  = (fd.get('dispatch_type') as string) || 'post'
  const linked_task_id = (fd.get('linked_task_id') as string) || null
  const scheduled_raw  = fd.get('scheduled_for') as string | null
  const scheduled_for  = scheduled_raw ? new Date(scheduled_raw).toISOString() : null
  const pollOptionsRaw = fd.get('poll_options') as string | null

  const admin = createAdminClient()
  const { error } = await admin.from('dispatches').update({
    title:          (fd.get('title') as string).trim(),
    body,
    excerpt,
    dispatch_type,
    audience_scope: fd.get('audience_scope') as DispatchScope,
    audience_id:    (fd.get('audience_id') as string).trim(),
    linked_task_id,
    scheduled_for,
    updated_at:     new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(error.message)

  // Replace poll options on update
  if (dispatch_type === 'poll' && pollOptionsRaw) {
    const options: string[] = JSON.parse(pollOptionsRaw)
    const validOptions = options.map(s => s.trim()).filter(Boolean)
    if (validOptions.length >= 2) {
      await admin.from('dispatch_poll_options').delete().eq('dispatch_id', id)
      await admin.from('dispatch_poll_options').insert(
        validOptions.map((label, position) => ({ dispatch_id: id, label, position }))
      )
    }
  }

  revalidatePath('/admin/dispatches')
  revalidatePath('/broadcast')
  revalidatePath(`/broadcast/${id}`)
}

export async function publishDispatch(id: string) {
  await requireCommunityOps()

  const admin = createAdminClient()
  const { error } = await admin.from('dispatches').update({
    status:       'published',
    published_at: new Date().toISOString(),
    updated_at:   new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/dispatches')
  revalidatePath('/broadcast')
  revalidatePath(`/broadcast/${id}`)
  revalidatePath('/feed')

  // Fire-and-forget email fan-out. Never block publish on email failure
  ;(async () => {
    try {
      const { data: dispatch } = await admin
        .from('dispatches')
        .select('id, title, excerpt, audience_scope, audience_id, author:profiles!author_id(display_name)')
        .eq('id', id)
        .maybeSingle()
      if (!dispatch) return

      const authorName  = dispatch.author?.display_name ?? 'A host'
      const excerpt     = dispatch.excerpt ?? ''
      const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
      const dispatchUrl = `${appUrl}/broadcast/${id}`

      let profileIds: string[] = []
      // A scoped dispatch always has an audience_id; the `&& audience_id` narrows the
      // now-nullable column to string (global dispatches carry a null audience_id).
      if (dispatch.audience_scope === 'circle' && dispatch.audience_id) {
        const { data } = await admin.from('memberships').select('profile_id').eq('circle_id', dispatch.audience_id).eq('status', 'active')
        profileIds = (data ?? []).map((m) => m.profile_id)
      } else if (dispatch.audience_scope === 'hub' && dispatch.audience_id) {
        const { data: circles } = await admin.from('circles').select('id').eq('hub_id', dispatch.audience_id)
        const cids = (circles ?? []).map((c) => c.id)
        if (cids.length > 0) {
          const { data } = await admin.from('memberships').select('profile_id').in('circle_id', cids).eq('status', 'active')
          profileIds = (data ?? []).map((m) => m.profile_id)
        }
      } else if (dispatch.audience_scope === 'nexus' && dispatch.audience_id) {
        const { data: hubs } = await admin.from('hubs').select('id').eq('nexus_id', dispatch.audience_id)
        const hids = (hubs ?? []).map((h) => h.id)
        if (hids.length > 0) {
          const { data: circles } = await admin.from('circles').select('id').in('hub_id', hids)
          const cids = (circles ?? []).map((c) => c.id)
          if (cids.length > 0) {
            const { data } = await admin.from('memberships').select('profile_id').in('circle_id', cids).eq('status', 'active')
            profileIds = (data ?? []).map((m) => m.profile_id)
          }
        }
      }

      profileIds = [...new Set(profileIds)]
      if (!profileIds.length) return

      const { data: profiles } = await admin.from('profiles').select('id, display_name, auth_user_id').in('id', profileIds)
      if (!profiles?.length) return

      for (const profile of profiles) {
        if (!profile.auth_user_id) continue

        if (await shouldSend(profile.id, 'email', 'dispatches')) {
          const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
          if (user?.email) {
            await sendDispatchNotificationEmail({
              to:                 user.email,
              recipientName:      profile.display_name,
              recipientProfileId: profile.id,
              authorName,
              dispatchTitle:      dispatch.title,
              excerpt,
              dispatchUrl,
            })
          }
        }

        await sendPushToProfile(profile.id, {
          title: `📡 ${dispatch.title}`,
          body:  excerpt || `New dispatch from ${authorName}`,
          url:   `/broadcast/${dispatch.id}`,
          tag:   `dispatch-${dispatch.id}`,
        }, 'dispatches')
      }
    } catch (err) {
      console.error('[publishDispatch] email fan-out failed:', err)
    }
  })()
}

export async function unpublishDispatch(id: string) {
  await requireCommunityOps()

  const admin = createAdminClient()
  const { error } = await admin
    .from('dispatches')
    .update({ status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/dispatches')
  revalidatePath('/broadcast')
  revalidatePath(`/broadcast/${id}`)
  revalidatePath('/feed')
}

export async function deleteDispatch(id: string) {
  await requireCommunityOps()

  const admin = createAdminClient()
  const { error } = await admin.from('dispatches').delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/dispatches')
  revalidatePath('/broadcast')
  revalidatePath('/feed')
}

// ── Events ────────────────────────────────────────────────────────────────────

export async function toggleCancelEvent(id: string, cancel: boolean) {
  const caps = await getEventCapabilities(id)
  const caller = await getCallerProfile()
  await requireScopedManage(caller, caps.has('event.editSettings'), 'community')
  const admin = createAdminClient()
  const update = cancel ? cancelAudit(caller?.id ?? null, null) : reinstateAudit()
  const { error } = await admin.from('events').update(update).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/events')
  revalidatePath('/events')
  revalidatePath('/feed')
}

export async function updateEventDetails(id: string, fd: FormData) {
  const caps = await getEventCapabilities(id)
  await requireScopedManage(await getCallerProfile(), caps.has('event.editSettings'), 'community')
  const admin = createAdminClient()
  const startsAt = fd.get('starts_at') as string
  const endsAt   = fd.get('ends_at') as string
  const { error } = await admin.from('events').update({
    title:       (fd.get('title') as string).trim(),
    description: (fd.get('description') as string)?.trim() || null,
    location:    (fd.get('location') as string)?.trim() || null,
    starts_at:   startsAt ? new Date(startsAt).toISOString() : undefined,
    ends_at:     endsAt   ? new Date(endsAt).toISOString()   : null,
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/events')
  revalidatePath('/events')
  revalidatePath('/feed')
}

// ── Crew task verification ────────────────────────────────────────────────────

export async function approveVerification(completionId: string) {
  const caller = await requireCommunityOps()
  // Verification-gated Zaps (leader grant): stamping verified_at releases the held Zaps via
  // trg_after_crew_completion_verified, which writes the ledger row once. Idempotent — re-approving
  // an already-verified completion is a safe no-op (the helper only touches still-held rows).
  await verifyCrewCompletion(completionId, 'leader', caller.id)
  revalidatePath('/admin/crew-tasks')
}

export async function rejectVerification(completionId: string) {
  await requireCommunityOps()
  const admin = createAdminClient()
  const { error } = await admin
    .from('crew_completions')
    .delete()
    .eq('id', completionId)
    .is('verified_by', null)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/crew-tasks')
}
