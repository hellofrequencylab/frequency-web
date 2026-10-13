import '@/app/themes/frequency/members-a.css'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { loadInbox } from '@/app/(main)/messages/inbox-data'
import { dmThreadHref } from '@/lib/messages/dm-destination'
import { relativeTime } from '@/lib/utils'
import type { createClient } from '@/lib/supabase/server'
import { FqToaster } from '../shared/toast'
import { InboxList, type ThreadLite } from './inbox-list'

// THE FREQUENCY MESSAGES BODY (design_handoff/frequency/templates/members/Messages.html): the
// thread list on the left (340px), the open conversation in a glass pane on the right. /messages,
// /messages/[id] and /messages/r/[roomId] all render it; each passes the pane it owns. The list
// is the same inbox read the DAWN page makes (app/(main)/messages/inbox-data.ts).
//
// Below 1000px the two columns stack the way the kit does, so the list shows on /messages and the
// conversation shows on a thread route.

export async function FrequencyMessages({
  supabase,
  myProfileId,
  activeKey = null,
  pane = null,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  myProfileId: string
  /** `dm:<id>` or `room:<id>` for the open conversation, so its row reads selected. */
  activeKey?: string | null
  pane?: ReactNode
}) {
  const { allItems, totalUnread } = await loadInbox(supabase, myProfileId)

  const threads: ThreadLite[] = await Promise.all(
    allItems.map(async (it): Promise<ThreadLite> => {
      if (it.kind === 'room') {
        return {
          key: `room:${it.id}`,
          kind: 'room',
          href: `/messages/r/${it.id}`,
          name: it.room.name,
          avatarUrl: null,
          preview: it.room.description ?? `${it.room.member_count} ${it.room.member_count === 1 ? 'member' : 'members'}`,
          when: it.lastActivity ? relativeTime(it.lastActivity) : null,
          unread: it.unread,
        }
      }
      const c = it.conv
      const isGroup = c.participants.length > 1
      const name =
        c.name ||
        (isGroup
          ? c.participants.slice(0, 3).map((p) => p.display_name.split(' ')[0]).join(', ') + (c.participants.length > 3 ? ` +${c.participants.length - 3}` : '')
          : c.participants[0]?.display_name ?? 'Conversation')
      return {
        key: `dm:${c.id}`,
        kind: isGroup ? 'group' : 'dm',
        href: await dmThreadHref(c.id, '/messages'),
        name,
        avatarUrl: isGroup ? null : c.participants[0]?.avatar_url ?? null,
        preview: c.lastMessage ? (c.lastMessage.sender_id === myProfileId ? `You: ${c.lastMessage.body}` : c.lastMessage.body) : 'No messages yet',
        when: it.lastActivity ? relativeTime(it.lastActivity) : null,
        unread: c.unreadCount,
      }
    }),
  )

  return (
    <div className={pane ? 'ap-cols l fa-msg in-thread' : 'ap-cols l fa-msg'}>
      <FqToaster />
      <aside className="side">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1 className="h2">
            Messages{totalUnread > 0 ? <span className="meta">{` · ${totalUnread > 99 ? '99+' : totalUnread} new`}</span> : null}
          </h1>
          <Link href="/network" className="btn sm pa">
            New
          </Link>
        </div>
        <InboxList threads={threads} activeKey={activeKey} />
      </aside>
      {pane ?? (
        <section className="panel fa-pane" aria-label="Conversation">
          <div className="fa-pane-empty">
            <span className="ic" aria-hidden>
              <FqIcon name="message" />
            </span>
            <span className="h3">Pick a conversation</span>
            <span className="t2">Or start one from anyone’s profile.</span>
          </div>
        </section>
      )}
    </div>
  )
}
