import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, LogOut, UsersRound } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
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

  // RLS convergence surface 5 (migration 20260602195209): the whole DM thread now
  // runs on the user-scoped client. conversations / conversation_participants /
  // messages are gated by the am_participant SELECT policy and last_read by the
  // UPDATE-own policy, so the DB enforces that I can only read a conversation I'm
  // in. The one thing RLS hides — the other participants' profiles — is hydrated
  // from the `message_peer_profiles` DEFINER RPC (public fields, caller-scoped).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!myProfile) redirect('/onboarding')
  const myProfileId = myProfile.id as string

  // Conversation + my participation (am_participant gates both; not a member → notFound)
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, name, created_at')
    .eq('id', conversationId)
    .maybeSingle()
  if (!conv) notFound()

  const { data: myPart } = await supabase
    .from('conversation_participants')
    .select('profile_id, last_read_at')
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId)
    .maybeSingle()
  if (!myPart) notFound()

  // Participant ids via RLS; public profile fields via the hydration RPC.
  const { data: partRows } = await supabase
    .from('conversation_participants')
    .select('profile_id')
    .eq('conversation_id', conversationId)

  type PeerProfile = { id: string; display_name: string; handle: string; avatar_url: string | null }
  const { data: peerRows } = await (supabase as unknown as SupabaseClient).rpc('message_peer_profiles')
  const peerMap = new Map(((peerRows ?? []) as PeerProfile[]).map(p => [p.id, p]))

  const participants = ((partRows ?? []) as { profile_id: string }[])
    .map(p => peerMap.get(p.profile_id))
    .filter((p): p is PeerProfile => !!p)

  const others = participants.filter(p => p.id !== myProfileId)
  const isGroup = others.length > 1

  const displayName = conv.name
    || (isGroup
      ? others.slice(0, 3).map(p => p.display_name.split(' ')[0]).join(', ') +
        (others.length > 3 ? ` +${others.length - 3}` : '')
      : others[0]?.display_name ?? 'Conversation')

  // Load messages (am_participant read policy)
  const { data: rawMessages } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(100)

  const messages = ((rawMessages ?? []) as unknown as Message[]).reverse()

  // Mark as read (participants_update_own_last_read policy)
  await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId)

  return (
    <div className="-mx-6 -my-6 flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-border bg-surface">
        <Link
          href="/messages"
          className="md:hidden p-1.5 rounded-lg text-subtle hover:text-muted hover:bg-surface-elevated transition-colors"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>

        {isGroup ? (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary-bg flex items-center justify-center shrink-0">
              <UsersRound className="w-4 h-4 text-primary-strong" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-text truncate">{displayName}</h1>
                <ConversationRenameButton conversationId={conversationId} currentName={conv.name as string | null} />
              </div>
              <p className="text-xs text-subtle">{participants.length} people</p>
            </div>
          </div>
        ) : others[0] ? (
          <Link
            href={`/people/${others[0].handle}`}
            className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-80 transition-opacity"
          >
            {others[0].avatar_url ? (
              <Image src={others[0].avatar_url} alt={others[0].display_name} width={36} height={36} className="w-9 h-9 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-primary-bg text-primary-strong text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                {getInitials(others[0].display_name)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text truncate leading-tight">{others[0].display_name}</p>
              <p className="text-[11px] text-subtle">@{others[0].handle}</p>
            </div>
          </Link>
        ) : (
          <span className="text-sm font-semibold text-text flex-1">Conversation</span>
        )}

        {isGroup && (
          <form action={leaveConversation.bind(null, conversationId)}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-elevated transition-colors"
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
          <aside className="hidden lg:flex w-64 shrink-0 flex-col border-l border-border bg-surface/30 dark:bg-canvas/30">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
                People ({participants.length})
              </h3>
            </div>
            <ul className="flex-1 overflow-y-auto divide-y divide-border/50">
              {participants.map(p => (
                <li key={p.id}>
                  <Link
                    href={`/people/${p.handle}`}
                    className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface-elevated/50 transition-colors"
                  >
                    {p.avatar_url ? (
                      <Image src={p.avatar_url} alt={p.display_name} width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-primary-bg text-primary-strong text-[10px] font-semibold flex items-center justify-center shrink-0 select-none">
                        {getInitials(p.display_name)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text truncate">{p.display_name}</p>
                      {p.id === myProfileId && <p className="text-[10px] text-subtle">You</p>}
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
