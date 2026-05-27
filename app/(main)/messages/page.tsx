import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getInitials, relativeTime } from '@/lib/utils'

type Profile = {
  id: string
  display_name: string
  handle: string
  avatar_url: string | null
}

type ConversationRow = {
  id: string
  created_at: string
  otherParticipant: Profile | null
  lastMessage: { body: string; sender_id: string; created_at: string } | null
  unreadCount: number
  myLastReadAt: string | null
}

export default async function MessagesPage() {
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

  // 1. Get all conversation IDs I'm part of, with my last_read_at
  const { data: myParts } = await admin
    .from('conversation_participants')
    .select('conversation_id, last_read_at, conversations!conversation_id(id, created_at)')
    .eq('profile_id', myProfileId)

  if (!myParts || myParts.length === 0) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <MessageSquare className="w-6 h-6 text-gray-400" />
        </div>
        <h1 className="text-base font-semibold text-gray-900 mb-1">No messages yet</h1>
        <p className="text-sm text-gray-400 leading-relaxed">
          Start a conversation from any member&apos;s profile or circle page.
        </p>
      </div>
    )
  }

  const convIds = myParts.map((p) => p.conversation_id as string)
  const myLastReadMap: Record<string, string | null> = {}
  for (const p of myParts) {
    myLastReadMap[p.conversation_id as string] = p.last_read_at as string | null
  }

  // 2. Get all other participants in those conversations
  const { data: allParts } = await admin
    .from('conversation_participants')
    .select('conversation_id, profile_id, profiles!profile_id(id, display_name, handle, avatar_url)')
    .in('conversation_id', convIds)
    .neq('profile_id', myProfileId)

  const otherPartMap: Record<string, Profile | null> = {}
  for (const p of allParts ?? []) {
    const prof = p.profiles as unknown as Profile | null
    otherPartMap[p.conversation_id as string] = prof
  }

  // 3. Get recent messages across all conversations to find last message + unread count
  const { data: recentMessages } = await admin
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: false })
    .limit(convIds.length * 20) // enough to get last msg + unread count per conv

  const messagesByConv: Record<string, typeof recentMessages> = {}
  for (const msg of recentMessages ?? []) {
    const cid = msg.conversation_id as string
    if (!messagesByConv[cid]) messagesByConv[cid] = []
    messagesByConv[cid]!.push(msg)
  }

  // 4. Build conversation rows
  const conversations: ConversationRow[] = myParts
    .map((part) => {
      const cid = part.conversation_id as string
      const msgs = messagesByConv[cid] ?? []
      const lastMsg = msgs[0] ?? null
      const myLastRead = myLastReadMap[cid]

      const unreadCount = myLastRead
        ? msgs.filter(
            (m) =>
              m.sender_id !== myProfileId &&
              new Date(m.created_at as string) > new Date(myLastRead)
          ).length
        : msgs.filter((m) => m.sender_id !== myProfileId).length

      const conv = (part as any).conversations as { id: string; created_at: string } | null

      return {
        id: cid,
        created_at: conv?.created_at ?? '',
        otherParticipant: otherPartMap[cid] ?? null,
        lastMessage: lastMsg
          ? {
              body: lastMsg.body as string,
              sender_id: lastMsg.sender_id as string,
              created_at: lastMsg.created_at as string,
            }
          : null,
        unreadCount,
        myLastReadAt: myLastRead ?? null,
      }
    })
    .sort((a, b) => {
      const aTime = a.lastMessage?.created_at ?? a.created_at
      const bTime = b.lastMessage?.created_at ?? b.created_at
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold text-gray-900">
          Messages
          {totalUnread > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </h1>
      </div>

      <div className="space-y-0.5">
        {conversations.map((conv) => {
          const other = conv.otherParticipant
          const hasUnread = conv.unreadCount > 0

          return (
            <Link
              key={conv.id}
              href={`/messages/${conv.id}`}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 transition-colors ${
                hasUnread
                  ? 'bg-indigo-50/70 hover:bg-indigo-50'
                  : 'hover:bg-gray-50'
              }`}
            >
              {/* Avatar */}
              <div className="shrink-0">
                {other?.avatar_url ? (
                  <img
                    src={other.avatar_url}
                    alt={other.display_name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 text-sm font-semibold flex items-center justify-center select-none">
                    {other ? getInitials(other.display_name) : '?'}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-sm truncate ${
                      hasUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'
                    }`}
                  >
                    {other?.display_name ?? 'Unknown'}
                  </span>
                  {conv.lastMessage && (
                    <span className="text-[11px] text-gray-400 shrink-0">
                      {relativeTime(conv.lastMessage.created_at)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p
                    className={`text-xs truncate flex-1 ${
                      hasUnread ? 'text-gray-700 font-medium' : 'text-gray-400'
                    }`}
                  >
                    {conv.lastMessage
                      ? conv.lastMessage.sender_id === myProfileId
                        ? `You: ${conv.lastMessage.body}`
                        : conv.lastMessage.body
                      : 'No messages yet'}
                  </p>
                  {hasUnread && (
                    <span className="shrink-0 w-2 h-2 rounded-full bg-indigo-500" />
                  )}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
