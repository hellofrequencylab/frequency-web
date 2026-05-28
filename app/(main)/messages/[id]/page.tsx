import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, LogOut, UsersRound } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { MessageThread, type Message } from '@/components/messages/thread'
import { getInitials } from '@/lib/utils'
import { leaveConversation } from '../actions'
import { ConversationRenameButton } from '@/components/messages/conversation-rename-button'

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: conversationId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const admin = createAdminClient()

  const { data: myProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!myProfile) redirect('/onboarding')
  const myProfileId = myProfile.id as string

  // Verify the conversation exists and load its name
  const { data: conv } = await admin
    .from('conversations')
    .select('id, name, created_at')
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

  // Get all participants
  const { data: rawParts } = await admin
    .from('conversation_participants')
    .select('profile_id, profiles!profile_id(id, display_name, handle, avatar_url)')
    .eq('conversation_id', conversationId)

  const participants = ((rawParts ?? []) as unknown as {
    profile_id: string
    profiles: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
  }[])
    .map(p => p.profiles)
    .filter((p): p is { id: string; display_name: string; handle: string; avatar_url: string | null } => !!p)

  const others = participants.filter(p => p.id !== myProfileId)
  const isGroup = others.length > 1

  const displayName = conv.name
    || (isGroup
      ? others.slice(0, 3).map(p => p.display_name.split(' ')[0]).join(', ') +
        (others.length > 3 ? ` +${others.length - 3}` : '')
      : others[0]?.display_name ?? 'Conversation')

  // Load messages
  const { data: rawMessages } = await admin
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(100)

  const messages = ((rawMessages ?? []) as unknown as Message[]).reverse()

  // Mark as read
  await admin
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId)

  return (
    <div className="-mx-6 -my-6 flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900">
        <Link
          href="/messages"
          className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>

        {isGroup ? (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
              <UsersRound className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-gray-900 dark:text-gray-50 truncate">{displayName}</h1>
                <ConversationRenameButton conversationId={conversationId} currentName={conv.name as string | null} />
              </div>
              <p className="text-xs text-gray-400">{participants.length} people</p>
            </div>
          </div>
        ) : others[0] ? (
          <Link
            href={`/people/${others[0].handle}`}
            className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-80 transition-opacity"
          >
            {others[0].avatar_url ? (
              <img src={others[0].avatar_url} alt={others[0].display_name} className="w-9 h-9 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                {getInitials(others[0].display_name)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate leading-tight">{others[0].display_name}</p>
              <p className="text-[11px] text-gray-400">@{others[0].handle}</p>
            </div>
          </Link>
        ) : (
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 flex-1">Conversation</span>
        )}

        {isGroup && (
          <form action={leaveConversation.bind(null, conversationId)}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <LogOut className="w-3 h-3" /> Leave
            </button>
          </form>
        )}
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-hidden">
          <MessageThread
            conversationId={conversationId}
            initialMessages={messages}
            myProfileId={myProfileId}
            participants={participants}
          />
        </div>

        {/* Members sidebar (group DMs only, desktop) */}
        {isGroup && (
          <aside className="hidden lg:flex w-64 shrink-0 flex-col border-l border-gray-200/60 dark:border-gray-800/60 bg-gray-50/30 dark:bg-gray-900/30">
            <div className="px-4 py-3 border-b border-gray-200/60 dark:border-gray-800/60">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                People ({participants.length})
              </h3>
            </div>
            <ul className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800/50">
              {participants.map(p => (
                <li key={p.id}>
                  <Link
                    href={`/people/${p.handle}`}
                    className="flex items-center gap-2.5 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt={p.display_name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-[10px] font-semibold flex items-center justify-center shrink-0 select-none">
                        {getInitials(p.display_name)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{p.display_name}</p>
                      {p.id === myProfileId && <p className="text-[10px] text-gray-400">You</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  )
}
