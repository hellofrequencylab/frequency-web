import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { MessageThread, type Message } from '@/components/messages/thread'

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: conversationId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const admin = createAdminClient()

  // Get my profile
  const { data: myProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!myProfile) redirect('/onboarding')
  const myProfileId = myProfile.id as string

  // Verify the conversation exists
  const { data: conv } = await admin
    .from('conversations')
    .select('id, created_at')
    .eq('id', conversationId)
    .maybeSingle()
  if (!conv) notFound()

  // Verify I'm a participant
  const { data: myPart } = await admin
    .from('conversation_participants')
    .select('profile_id, last_read_at')
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId)
    .maybeSingle()
  if (!myPart) notFound()

  // Get all participants with their profiles
  const { data: rawParts } = await admin
    .from('conversation_participants')
    .select('profile_id, profiles!profile_id(id, display_name, handle, avatar_url)')
    .eq('conversation_id', conversationId)

  const participants = (rawParts ?? []).map((p) => {
    const prof = p.profiles as unknown as {
      id: string
      display_name: string
      handle: string
      avatar_url: string | null
    }
    return prof
  })

  const otherParticipants = participants.filter((p) => p.id !== myProfileId)
  const otherPerson = otherParticipants[0] ?? null

  // Load messages (newest 100, then reverse for chronological display)
  const { data: rawMessages } = await admin
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(100)

  const messages = ((rawMessages ?? []) as unknown as Message[]).reverse()

  // Mark conversation as read (fire-and-forget via server action)
  // We can't await a server action that calls redirect() here, so call markConversationRead directly
  await admin
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId)

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ──────────────────────────────── */}
      <header className="shrink-0 flex items-center gap-3 h-14 px-4 border-b border-gray-100 bg-white">
        <Link
          href="/messages"
          className="p-1.5 -ml-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>

        {otherPerson ? (
          <Link
            href={`/people/${otherPerson.handle}`}
            className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-80 transition-opacity"
          >
            {otherPerson.avatar_url ? (
              <img
                src={otherPerson.avatar_url}
                alt={otherPerson.display_name}
                className="w-8 h-8 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                {getInitials(otherPerson.display_name)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
                {otherPerson.display_name}
              </p>
              <p className="text-[11px] text-gray-400">@{otherPerson.handle}</p>
            </div>
          </Link>
        ) : (
          <span className="text-sm font-semibold text-gray-900">Conversation</span>
        )}
      </header>

      {/* ── Thread ─ fills remaining height ─────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <MessageThread
          conversationId={conversationId}
          initialMessages={messages}
          myProfileId={myProfileId}
          participants={participants}
        />
      </div>
    </div>
  )
}
