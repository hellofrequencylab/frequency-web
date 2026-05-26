'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Helpers ──────────────────────────────────────────────────────────

async function getMyProfileId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) redirect('/onboarding')
  return profile.id as string
}

// ── startConversation ─────────────────────────────────────────────────
// Finds an existing 1:1 thread with otherProfileId, or creates one.
// Called as a form action from /people/[handle] and circle member lists.

export async function startConversation(otherProfileId: string) {
  const myProfileId = await getMyProfileId()

  // Don't allow messaging yourself
  if (myProfileId === otherProfileId) redirect('/messages')

  const admin = createAdminClient()

  // Find all conversations I'm in
  const { data: mineRows } = await admin
    .from('conversation_participants')
    .select('conversation_id')
    .eq('profile_id', myProfileId)

  const myConvIds = (mineRows ?? []).map((r) => r.conversation_id as string)

  if (myConvIds.length > 0) {
    // Check if any of those also include the other profile
    const { data: shared } = await admin
      .from('conversation_participants')
      .select('conversation_id')
      .in('conversation_id', myConvIds)
      .eq('profile_id', otherProfileId)
      .limit(1)
      .maybeSingle()

    if (shared) {
      redirect(`/messages/${shared.conversation_id}`)
    }
  }

  // Create a new conversation and add both participants
  const { data: conv, error } = await admin
    .from('conversations')
    .insert({})
    .select('id')
    .single()

  if (error || !conv) throw new Error('Failed to create conversation')

  await admin.from('conversation_participants').insert([
    { conversation_id: conv.id, profile_id: myProfileId },
    { conversation_id: conv.id, profile_id: otherProfileId },
  ])

  redirect(`/messages/${conv.id}`)
}

// ── sendMessage ───────────────────────────────────────────────────────

export async function sendMessage(conversationId: string, formData: FormData) {
  const body = (formData.get('body') as string | null)?.trim()
  if (!body) return

  const myProfileId = await getMyProfileId()
  const admin = createAdminClient()

  // Verify I'm a participant before inserting
  const { data: part } = await admin
    .from('conversation_participants')
    .select('profile_id')
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId)
    .maybeSingle()

  if (!part) return

  await admin.from('messages').insert({
    conversation_id: conversationId,
    sender_id: myProfileId,
    body,
  })

  // Mark the sender as having read up to now
  await admin
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId)

  revalidatePath(`/messages/${conversationId}`)
  revalidatePath('/messages')
}

// ── markConversationRead ──────────────────────────────────────────────

export async function markConversationRead(conversationId: string) {
  const myProfileId = await getMyProfileId()
  const admin = createAdminClient()

  await admin
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId)

  revalidatePath('/messages')
}
