import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { MessageSquare, Hash, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PresenceDot } from '@/components/presence/presence-dot'
import { getInitials, relativeTime } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { NewRoomCompose } from '@/components/compose/new-room-compose'
import { CrewLeadQuickAction } from '@/components/messages/crew-lead-quick-action'
import { IndexTemplate } from '@/components/templates/index-template'
import { resolveIndexHero } from '@/lib/layout/index-hero'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'
import { pageContentMetadata } from '@/lib/page-content'
import { dmThreadHref } from '@/lib/messages/dm-destination'
import { loadInbox, noteFailedRead, CONTENT_FALLBACK, type ConversationRow, type RoomRow, type Profile } from './inbox-data'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FrequencyMessages } from '@/components/frequency/members/messages/messages-body'

// 🔴 ROOM CREATION IS OPEN TO ANY SIGNED-IN MEMBER (ADR-1294, LIVE-221). It used to require the
// paid tier or a steward role, and the server action in ./rooms/actions.ts carried the same wall.
// Both halves came down together: a wall in the page alone would hide the button while the action
// happily accepted the request, which is the worse of the two failures. Under the core model a
// member never pays for a forward-facing feature, so do not re-add a tier check here.

type Filter = 'all' | 'rooms' | 'dms'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all',   label: 'All' },
  { value: 'rooms', label: 'Rooms' },
  { value: 'dms',   label: 'DMs' },
]

// The sort control (DAWN message-board pass): the thread list answers to the reader,
// not only to recency. Pure presentation — each option reorders the already-fetched
// list in JS; "Unread first" leans on the per-thread unread counts the page already
// loads for its badges.
type Sort = 'latest' | 'unread' | 'az'
const SORTS: { value: Sort; label: string }[] = [
  { value: 'latest', label: 'Latest' },
  { value: 'unread', label: 'Unread first' },
  { value: 'az',     label: 'A to Z' },
]

const ACTIVE_WINDOW_MS = 30 * 60 * 1000

// Operator-set title/description also drive <title> + og/twitter cards (PX.2).
export function generateMetadata() {
  return pageContentMetadata('/messages', CONTENT_FALLBACK)
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; sort?: string }>
}) {
  const { filter: filterParam, sort: sortParam } = await searchParams
  const filter: Filter =
    filterParam === 'rooms' ? 'rooms' : filterParam === 'dms' ? 'dms' : 'all'
  const sort: Sort =
    sortParam === 'unread' ? 'unread' : sortParam === 'az' ? 'az' : 'latest'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  // RLS convergence surface 5 (migration 20260602195209): rooms + DMs read on the
  // user client (am_room_member / am_participant SELECT policies); the DM
  // participants' profiles, which RLS would otherwise hide from sub-crew/
  // cross-region viewers, come from the message_peer_profiles DEFINER RPC.
  const { data: myProfile, error: myProfileErr } = await supabase
    .from('profiles')
    .select('id, community_role, membership_tier')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  // The redirect below cannot tell "this account has no profile yet" from "the profile read
  // failed", and it answers both with /onboarding — which sends a fully onboarded member back
  // through signup. The redirect stays (bouncing to onboarding is still the safer of the two
  // wrong answers), but the two causes are no longer indistinguishable in the logs.
  noteFailedRead('my profile', myProfileErr)
  if (!myProfile) redirect('/onboarding')
  const myProfileId = myProfile.id as string
  const canCreateRoom = true

  // THE DESIGN SWITCH (ADR-1737): fixed at build time; a DAWN deploy renders the page below unchanged.
  if (SITE_DESIGN === 'frequency') return <FrequencyMessages supabase={supabase} myProfileId={myProfileId} />

  const { allItems, channelRooms, discoverRooms, totalUnread, onlineIds, pageContent } = await loadInbox(supabase, myProfileId)


  const nowMs = new Date().getTime()
  const activeItems = allItems.filter(it =>
    it.lastActivity && nowMs - new Date(it.lastActivity).getTime() < ACTIVE_WINDOW_MS
  )
  const activeIds = new Set(activeItems.map(it => `${it.kind}:${it.id}`))

  const filteredItems = allItems
    .filter(it => !activeIds.has(`${it.kind}:${it.id}`))
    .filter(it => filter === 'all' || (filter === 'rooms' ? it.kind === 'room' : it.kind === 'dm'))

  // The sort control, applied last. "Latest" keeps the activity order the list is
  // already in; the other two re-order in place (stable sort, so ties keep the
  // latest-activity order underneath).
  const sortedItems = [...filteredItems]
  if (sort === 'az') {
    sortedItems.sort((a, b) => a.sortName.localeCompare(b.sortName))
  } else if (sort === 'unread') {
    sortedItems.sort((a, b) => (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0))
  }

  // Operator-editable page header (ADR-180), resolved in the second wave above. The unread badge
  // stays dynamic; only the static title + description flow through resolvePageContent.
  const { title: pageTitle, description: pageDescription, body: pageBody, ctaLabel, ctaHref } = pageContent

  // Segmented filter + sort — both live in the "Your threads" section header, and
  // each preserves the other's choice in the link.
  const threadsHref = (f: Filter, s: Sort) => {
    const q = new URLSearchParams()
    if (f !== 'all') q.set('filter', f)
    if (s !== 'latest') q.set('sort', s)
    const qs = q.toString()
    return qs ? `/messages?${qs}` : '/messages'
  }

  const filterTabs = (
    <div className="flex items-center gap-0.5 rounded-control bg-surface-elevated p-0.5">
      {FILTERS.map(f => (
        <Link
          key={f.value}
          href={threadsHref(f.value, sort)}
          className={`rounded-md px-2.5 py-1 text-meta font-medium transition-colors ${
            filter === f.value ? 'bg-surface text-text lift-1' : 'text-muted hover:text-text'
          }`}
        >
          {f.label}
        </Link>
      ))}
    </div>
  )

  const sortTabs = (
    <div className="flex items-center gap-0.5 rounded-control bg-surface-elevated p-0.5">
      {SORTS.map(s => (
        <Link
          key={s.value}
          href={threadsHref(filter, s.value)}
          className={`rounded-md px-2.5 py-1 text-meta font-medium transition-colors ${
            sort === s.value ? 'bg-surface text-text lift-1' : 'text-muted hover:text-text'
          }`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  )

  const hero = await resolveIndexHero('/messages')

  return (
    <IndexTemplate
      {...hero}
      title={
        <span className="flex items-center gap-2">
          {pageTitle}
          {totalUnread > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-primary px-1.5 text-meta font-bold text-on-primary">
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </span>
      }
      description={pageDescription}
      intro={pageBody}
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <CrewLeadQuickAction />
          {canCreateRoom && <NewRoomCompose />}
          {/* Operator-set CTA (PX.1) — shows only when both label + link are set. */}
          {ctaLabel && ctaHref && (
            <a
              href={ctaHref}
              className="inline-flex items-center gap-2 rounded-control bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary lift-1 transition-colors hover:bg-primary-hover"
            >
              {ctaLabel}
            </a>
          )}
        </div>
      }
    >
      <div className="space-y-8">
        {/* Active now */}
        {activeItems.length > 0 && (
          <section>
            <SectionHeader title="Active now" count={activeItems.length} />
            <div className="space-y-1">
              {activeItems.map(it =>
                it.kind === 'room'
                  ? <RoomRowItem key={`r-${it.id}`} room={it.room} />
                  : <DMRowItem key={`d-${it.id}`} conv={it.conv} myProfileId={myProfileId} onlineIds={onlineIds} />
              )}
            </div>
          </section>
        )}

        {/* Your threads */}
        <section>
          <SectionHeader
            title="Your threads"
            count={sortedItems.length > 0 ? sortedItems.length : undefined}
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                {sortTabs}
                {filterTabs}
              </div>
            }
          />
          {sortedItems.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title={filter === 'rooms' ? 'No rooms joined yet' : filter === 'dms' ? 'No direct conversations yet' : 'No threads yet'}
              description={
                filter === 'rooms'
                  ? (canCreateRoom ? 'Create one above, or browse Discover below.' : 'Join one from Discover below.')
                  : filter === 'dms'
                    ? 'Start one from any member’s profile.'
                    : 'Join a room or start a DM to begin.'
              }
            />
          ) : (
            <div className="space-y-1">
              {sortedItems.map(it =>
                it.kind === 'room'
                  ? <RoomRowItem key={`r-${it.id}`} room={it.room} />
                  : <DMRowItem key={`d-${it.id}`} conv={it.conv} myProfileId={myProfileId} onlineIds={onlineIds} />
              )}
            </div>
          )}
        </section>

        {/* Channels — the open room for each channel you're tuned into */}
        {filter !== 'dms' && channelRooms.length > 0 && (
          <section>
            <SectionHeader title="Channels" count={channelRooms.length} />
            <div className="space-y-1">
              {channelRooms.map(room => (
                <Link
                  key={room.id}
                  href={`/messages/r/${room.id}`}
                  className="flex items-center gap-3 rounded-control px-3 py-3 transition-colors hover:bg-surface-elevated"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-signal-bg text-signal-strong">
                    <Hash className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-body-sm font-semibold text-text">{room.name}</span>
                      {room.last_message_at && (
                        <span className="shrink-0 text-meta text-subtle">{relativeTime(room.last_message_at)}</span>
                      )}
                    </div>
                    <p className="truncate text-meta text-subtle">Open channel room · anyone tuned in can post</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Discover — public rooms to join (hidden when filtered to DMs) */}
        {filter !== 'dms' && discoverRooms.length > 0 && (
          <section>
            <SectionHeader title="Discover rooms" count={discoverRooms.length} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {discoverRooms.map(room => (
                <EntityCard
                  key={room.id}
                  href={`/messages/r/${room.id}`}
                  anchor={
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-bg text-primary-strong">
                      <Hash className="h-5 w-5" />
                    </span>
                  }
                  title={room.name}
                  context={
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3 shrink-0" />
                      {room.member_count} {room.member_count === 1 ? 'member' : 'members'}
                    </span>
                  }
                  description={room.description ?? undefined}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </IndexTemplate>
  )
}

function RoomRowItem({ room }: { room: RoomRow }) {
  return (
    <Link
      href={`/messages/r/${room.id}`}
      className="flex items-center gap-3 rounded-control px-3 py-3 hover:bg-surface-elevated transition-colors"
    >
      {/* Always the hash — a room never wears a padlock (GateNotice canon); privacy is
          said in words in the meta line instead. */}
      <div className="shrink-0 w-10 h-10 rounded-control bg-primary-bg flex items-center justify-center">
        <Hash className="w-4 h-4 text-primary-strong" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-body-sm font-semibold text-text truncate">{room.name}</span>
          {room.last_message_at && (
            <span className="text-meta text-subtle shrink-0">{relativeTime(room.last_message_at)}</span>
          )}
        </div>
        <p className="text-meta text-subtle truncate">
          <Users className="w-3 h-3 inline mr-1 -mt-px" />
          {room.member_count} {room.member_count === 1 ? 'member' : 'members'}
          {room.visibility === 'private' && <> &middot; Private</>}
          {room.description && <> &middot; {room.description}</>}
        </p>
      </div>
    </Link>
  )
}

// THE LAST DM ENTRY POINT that hand-built the retiring URL (ADR-896 phase 2). Every server-side
// redirector already routes through `dmThreadHref`; this row did not, so with
// `chat_dm_routes_retired` ON, tapping a conversation in the inbox hit the retired route's gate and
// bounced the member onto /feed — off the very list they were reading. Async server component (this
// file has no 'use client'), and `chatDmRoutesRetiredFlag` is React-cached, so the whole render
// shares ONE round trip no matter how many rows ask. With the flag OFF this returns exactly the
// string that was hardcoded here, so today's behaviour is byte-identical.
async function DMRowItem({ conv, myProfileId, onlineIds }: { conv: ConversationRow; myProfileId: string; onlineIds: Set<string> }) {
  const hasUnread = conv.unreadCount > 0
  const isGroup = conv.participants.length > 1
  const peerOnline = !isGroup && !!conv.participants[0] && onlineIds.has(conv.participants[0].id)
  const display = conv.name || (isGroup
    ? conv.participants.slice(0, 3).map(p => p.display_name.split(' ')[0]).join(', ') +
      (conv.participants.length > 3 ? ` +${conv.participants.length - 3}` : '')
    : conv.participants[0]?.display_name ?? 'Unknown')
  // Opens the dock OVER the inbox once retired, so the member keeps their place in the list.
  const href = await dmThreadHref(conv.id, '/messages')

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-control px-3 py-3 transition-colors ${
        hasUnread
          ? 'bg-primary-bg/70 hover:bg-primary-bg dark:hover:bg-primary-bg'
          : 'hover:bg-surface-elevated'
      }`}
    >
      <div className="shrink-0 relative">
        {isGroup ? (
          <GroupAvatars participants={conv.participants} />
        ) : conv.participants[0]?.avatar_url ? (
          <Image src={avatarSrc(conv.participants[0].avatar_url!)} alt={conv.participants[0].display_name} width={40} height={40} style={avatarFocusStyle(conv.participants[0].avatar_url)} className="w-10 h-10 rounded-pill object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-pill bg-primary-bg text-primary-strong text-body-sm font-semibold flex items-center justify-center select-none">
            {conv.participants[0] ? getInitials(conv.participants[0].display_name) : '?'}
          </div>
        )}
        <PresenceDot online={peerOnline} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-body-sm truncate ${hasUnread ? 'font-semibold text-text' : 'font-medium text-text'}`}>
            {display}
          </span>
          {conv.lastMessage && (
            <span className="text-meta text-subtle shrink-0">{relativeTime(conv.lastMessage.created_at)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className={`text-meta truncate flex-1 ${hasUnread ? 'text-text font-medium' : 'text-subtle'}`}>
            {conv.lastMessage
              ? conv.lastMessage.sender_id === myProfileId ? `You: ${conv.lastMessage.body}` : conv.lastMessage.body
              : 'No messages yet'}
          </p>
          {hasUnread && <span className="shrink-0 w-2 h-2 rounded-pill bg-primary" />}
        </div>
      </div>
    </Link>
  )
}

function GroupAvatars({ participants }: { participants: Profile[] }) {
  const shown = participants.slice(0, 3)
  return (
    <div className="relative w-10 h-10">
      {shown.map((p, i) => {
        const size = shown.length === 1 ? 'w-10 h-10' : shown.length === 2 ? 'w-7 h-7' : 'w-6 h-6'
        const pos = shown.length === 1
          ? ''
          : i === 0 ? 'absolute top-0 left-0' : i === 1 ? 'absolute bottom-0 right-0' : 'absolute bottom-0 left-0'
        return p.avatar_url ? (
          <Image key={p.id} src={avatarSrc(p.avatar_url)} alt={p.display_name} width={40} height={40}
            style={avatarFocusStyle(p.avatar_url)}
            className={`${size} ${pos} rounded-pill object-cover ring-2 ring-surface`} />
        ) : (
          <div key={p.id}
            className={`${size} ${pos} rounded-pill bg-primary-bg text-primary-strong text-meta font-semibold flex items-center justify-center ring-2 ring-surface`}>
            {getInitials(p.display_name)}
          </div>
        )
      })}
    </div>
  )
}
