'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'
const CREW_PLUS: CommunityRole[] = ['crew', 'host', 'guide', 'mentor', 'janitor']

type RoomVisibility = 'public' | 'private' | 'circle' | 'hub' | 'nexus' | 'outpost'

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  return data as { id: string; community_role: CommunityRole } | null
}

export async function createRoom(fd: FormData): Promise<{ id: string }> {
  const caller = await getCallerProfile()
  if (!caller) redirect('/sign-in')
  if (!CREW_PLUS.includes(caller.community_role)) {
    throw new Error('Crew membership required to create rooms')
  }

  const name = (fd.get('name') as string)?.trim()
  const description = (fd.get('description') as string)?.trim() || null
  const visibility = ((fd.get('visibility') as string) || 'public') as RoomVisibility
  const scopeId = (fd.get('scope_id') as string)?.trim() || null

  if (!name) throw new Error('Name is required')

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

  if (error || !data) throw new Error(error?.message ?? 'Failed to create room')

  // Add creator as the first member + admin
  await admin.from('room_members').insert({
    room_id: data.id,
    profile_id: caller.id,
    is_admin: true,
  })

  revalidatePath('/messages')
  return { id: data.id }
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

  // Must be a room member to post
  const { data: membership } = await admin
    .from('room_members')
    .select('room_id')
    .eq('room_id', roomId)
    .eq('profile_id', caller.id)
    .maybeSingle()
  if (!membership) throw new Error('You must join the room before posting')

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

export async function inviteToRoom(roomId: string, profileId: string) {
  const caller = await getCallerProfile()
  if (!caller) redirect('/sign-in')

  const admin = createAdminClient()

  // Caller must be a member of the room to invite (admins can invite to private rooms)
  const { data: callerMembership } = await admin
    .from('room_members')
    .select('is_admin')
    .eq('room_id', roomId)
    .eq('profile_id', caller.id)
    .maybeSingle()
  if (!callerMembership) throw new Error('You must be a member of the room to invite others')

  await admin.from('room_members').upsert(
    { room_id: roomId, profile_id: profileId, is_admin: false },
    { onConflict: 'room_id,profile_id', ignoreDuplicates: true }
  )

  revalidatePath(`/messages/r/${roomId}`)
}
