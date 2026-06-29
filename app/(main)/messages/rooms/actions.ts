'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile, getMyProfileId, type CommunityRole } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { searchRoom, type RoomSearchHit } from '@/lib/ai/room-search'

// Room creation = paid (Crew/Supporter TIER) or a steward (host+) — PB.1/ADR-207.
const STEWARD_ROLES: CommunityRole[] = ['host', 'guide', 'mentor', 'admin', 'janitor'] as CommunityRole[]

type RoomVisibility = 'public' | 'private' | 'circle' | 'hub' | 'nexus' | 'outpost'

// Phase C: search a room's history (semantic when AI is on, else substring). The
// RPC re-checks the caller can see the room, so an unauthorized roomId returns 0.
export async function searchRoomAction(
  roomId: string,
  query: string,
): Promise<ActionResult<{ hits: RoomSearchHit[]; mode: 'semantic' | 'text' }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  if (!roomId) return fail('No room')
  const res = await searchRoom(roomId, query, profileId)
  return ok(res)
}

export async function createRoom(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Not signed in')
  const paid = caller.membershipTier === 'crew' || caller.membershipTier === 'supporter'
  if (!paid && !STEWARD_ROLES.includes(caller.community_role)) {
    return fail('Crew membership required to create rooms')
  }

  const name = (fd.get('name') as string)?.trim().slice(0, 120)
  const description = (fd.get('description') as string)?.trim().slice(0, 500) || null
  const visibility = ((fd.get('visibility') as string) || 'public') as RoomVisibility
  const scopeId = (fd.get('scope_id') as string)?.trim() || null

  if (!name) return fail('Name is required')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('rooms')
    .insert({
      name,
      description,
      visibility,
      scope_id: scopeId,
      creator_id: caller.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[createRoom] insert error:', error)
    return fail(error?.message ?? 'Failed to create room')
  }

  const { error: memberError } = await admin.from('room_members').insert({
    room_id: data.id,
    profile_id: caller.id,
    is_admin: true,
  })

  if (memberError) {
    console.error('[createRoom] member insert error:', memberError)
    return fail(`Room created but failed to add you as member: ${memberError.message}`)
  }

  revalidatePath('/messages')
  return ok({ id: data.id })
}

// Edit a room's name / description / visibility. Room-admin only (re-checked here).
export async function updateRoom(roomId: string, fd: FormData): Promise<ActionResult<void>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Not signed in')

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('room_members')
    .select('is_admin')
    .eq('room_id', roomId)
    .eq('profile_id', caller.id)
    .maybeSingle()
  if (!membership?.is_admin) return fail('You must be a room admin to edit this room')

  const name = (fd.get('name') as string)?.trim().slice(0, 120)
  const description = (fd.get('description') as string)?.trim().slice(0, 500) || null
  const visibility = ((fd.get('visibility') as string) || 'public') as RoomVisibility
  if (!name) return fail('Name is required')
  // Only public/private are user-editable; scope-derived visibilities are managed elsewhere.
  const safeVisibility: RoomVisibility = visibility === 'private' ? 'private' : 'public'

  const { error } = await admin
    .from('rooms')
    .update({ name, description, visibility: safeVisibility })
    .eq('id', roomId)
  if (error) return fail(error.message)

  revalidatePath('/messages')
  revalidatePath(`/messages/r/${roomId}`)
  return ok(undefined)
}

export async function joinRoom(roomId: string) {
  const caller = await getCallerProfile()
  if (!caller) redirect('/sign-in')

  const admin = createAdminClient()
  const { data: room } = await admin
    .from('rooms')
    .select('id, visibility')
    .eq('id', roomId)
    .maybeSingle()

  if (!room) throw new Error('Room not found')
  if (room.visibility === 'private') {
    throw new Error('This room is private. You need an invite to join.')
  }

  // Insert membership (UNIQUE on PK prevents duplicates)
  await admin.from('room_members').upsert(
    { room_id: roomId, profile_id: caller.id, is_admin: false },
    { onConflict: 'room_id,profile_id', ignoreDuplicates: true }
  )

  revalidatePath('/messages')
  revalidatePath(`/messages/r/${roomId}`)
}

export async function leaveRoom(roomId: string) {
  const caller = await getCallerProfile()
  if (!caller) redirect('/sign-in')

  const admin = createAdminClient()
  await admin
    .from('room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('profile_id', caller.id)

  revalidatePath('/messages')
}

export async function sendRoomMessage(roomId: string, body: string) {
  const caller = await getCallerProfile()
  if (!caller) redirect('/sign-in')
  const trimmed = body.trim()
  if (!trimmed) return

  const admin = createAdminClient()

  // Posting gate (Phase B): a CHANNEL open room is readable by anyone but only
  // tuned-in members may post; every other room requires membership.
  const { data: room } = await admin
    .from('rooms')
    .select('visibility, scope_id')
    .eq('id', roomId)
    .maybeSingle()
  if (!room) throw new Error('Room not found')

  if ((room as { visibility: string }).visibility === 'channel') {
    const scopeId = (room as { scope_id: string | null }).scope_id
    const { data: tuned } = scopeId
      ? await admin
          .from('topical_channel_memberships')
          .select('profile_id')
          .eq('topical_channel_id', scopeId)
          .eq('profile_id', caller.id)
          .maybeSingle()
      : { data: null }
    if (!tuned) throw new Error('Tune into this channel to post.')
  } else {
    const { data: membership } = await admin
      .from('room_members')
      .select('room_id')
      .eq('room_id', roomId)
      .eq('profile_id', caller.id)
      .maybeSingle()
    if (!membership) throw new Error('You must join the room before posting')
  }

  const { error } = await admin.from('room_messages').insert({
    room_id: roomId,
    author_id: caller.id,
    body: trimmed,
  })
  if (error) throw new Error(error.message)

  revalidatePath(`/messages/r/${roomId}`)
}

export async function markRoomRead(roomId: string) {
  const caller = await getCallerProfile()
  if (!caller) return

  const admin = createAdminClient()
  await admin
    .from('room_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('profile_id', caller.id)
}

async function assertRoomAdmin(roomId: string, callerId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('room_members')
    .select('is_admin')
    .eq('room_id', roomId)
    .eq('profile_id', callerId)
    .maybeSingle()
  if (!data?.is_admin) throw new Error('You must be a room admin to do that')
}

export async function removeFromRoom(roomId: string, profileId: string) {
  const caller = await getCallerProfile()
  if (!caller) redirect('/sign-in')
  await assertRoomAdmin(roomId, caller.id)
  if (caller.id === profileId) throw new Error('Use Leave to remove yourself')

  const admin = createAdminClient()
  await admin.from('room_members').delete()
    .eq('room_id', roomId)
    .eq('profile_id', profileId)

  revalidatePath(`/messages/r/${roomId}`)
}

export async function promoteRoomMember(roomId: string, profileId: string) {
  const caller = await getCallerProfile()
  if (!caller) redirect('/sign-in')
  await assertRoomAdmin(roomId, caller.id)

  const admin = createAdminClient()
  await admin.from('room_members').update({ is_admin: true })
    .eq('room_id', roomId)
    .eq('profile_id', profileId)

  revalidatePath(`/messages/r/${roomId}`)
}

export async function demoteRoomMember(roomId: string, profileId: string) {
  const caller = await getCallerProfile()
  if (!caller) redirect('/sign-in')
  await assertRoomAdmin(roomId, caller.id)

  // Prevent demoting the last admin
  const admin = createAdminClient()
  const { count } = await admin
    .from('room_members')
    .select('profile_id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .eq('is_admin', true)
  if ((count ?? 0) <= 1) throw new Error('Cannot demote the last admin')

  await admin.from('room_members').update({ is_admin: false })
    .eq('room_id', roomId)
    .eq('profile_id', profileId)

  revalidatePath(`/messages/r/${roomId}`)
}

export async function deleteRoom(roomId: string) {
  const caller = await getCallerProfile()
  if (!caller) redirect('/sign-in')
  await assertRoomAdmin(roomId, caller.id)

  const admin = createAdminClient()
  await admin.from('rooms').delete().eq('id', roomId)
  revalidatePath('/messages')
  redirect('/messages')
}

export async function inviteToRoom(roomId: string, profileId: string) {
  const caller = await getCallerProfile()
  if (!caller) redirect('/sign-in')
  if (caller.id === profileId) throw new Error('You are already in this room')

  const admin = createAdminClient()

  // Caller must be a member of the room to invite.
  const { data: callerMembership } = await admin
    .from('room_members')
    .select('is_admin')
    .eq('room_id', roomId)
    .eq('profile_id', caller.id)
    .maybeSingle()
  if (!callerMembership) throw new Error('You must be a member of the room to invite others')

  // A PRIVATE room is invite-only and admin-controlled: only a room admin may add people
  // (previously any member could, which let a member force-add a stranger into a private
  // room via the admin client — ADR site-audit SEC-1).
  const { data: room } = await admin
    .from('rooms')
    .select('visibility')
    .eq('id', roomId)
    .maybeSingle()
  if (!room) throw new Error('Room not found')
  if ((room as { visibility: string }).visibility === 'private' && !callerMembership.is_admin) {
    throw new Error('Only a room admin can invite people to a private room')
  }

  // The invitee must be an accepted friend of the caller (same gate as starting a group
  // DM, startGroupConversation): you can never add a user who has not connected with you.
  const pair = caller.id < profileId
    ? { user_a_id: caller.id, user_b_id: profileId }
    : { user_a_id: profileId, user_b_id: caller.id }
  const { data: friendship } = await admin
    .from('friendships')
    .select('id')
    .match({ ...pair, status: 'accepted' })
    .maybeSingle()
  if (!friendship) throw new Error('You can only invite people you are friends with')

  await admin.from('room_members').upsert(
    { room_id: roomId, profile_id: profileId, is_admin: false },
    { onConflict: 'room_id,profile_id', ignoreDuplicates: true }
  )

  revalidatePath(`/messages/r/${roomId}`)
}
