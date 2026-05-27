import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Hash, CalendarDays, MessageSquare, Users } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { joinChannel, leaveChannel } from '../actions'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'

type ChannelDetail = {
  id: string
  name: string
  description: string | null
  type: 'group' | 'event' | 'thread'
  scope: 'hub' | 'nexus' | 'outpost'
  scope_id: string
  member_cap: number | null
  is_public: boolean
  event_date: string | null
  created_at: string
  creator: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
    community_role: string
  } | null
}

type MemberRow = {
  profile: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
  }
}

const TYPE_ICON = {
  group: Hash,
  event: CalendarDays,
  thread: MessageSquare,
}

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function getInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
}

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: rawChannel } = await admin
    .from('channels')
    .select(
      `id, name, description, type, scope, scope_id, member_cap, is_public, event_date, created_at,
       creator:profiles!creator_id ( id, display_name, handle, avatar_url, community_role )`
    )
    .eq('id', id)
    .maybeSingle()

  if (!rawChannel) notFound()
  const channel = rawChannel as unknown as ChannelDetail

  // Fetch members
  const { data: rawMembers } = await admin
    .from('channel_memberships')
    .select('profile:profiles!profile_id ( id, display_name, handle, avatar_url )')
    .eq('channel_id', channel.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  const members = (rawMembers ?? []) as unknown as MemberRow[]

  // Current user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let myProfileId: string | null = null
  let isMember = false
  let isCreator = false
  let isCrew = false

  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, community_role')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      myProfileId = profile.id
      isCreator = channel.creator?.id === myProfileId
      isCrew = ['crew', 'host', 'guide', 'mentor'].includes(profile.community_role)
      isMember = members.some((m) => m.profile.id === myProfileId)
    }
  }

  const Icon = TYPE_ICON[channel.type] ?? Hash

  // Fetch scope name (hub/nexus/outpost)
  let scopeName: string | null = null
  if (channel.scope === 'hub') {
    const { data: hub } = await admin.from('hubs').select('name, slug').eq('id', channel.scope_id).maybeSingle()
    scopeName = hub?.name ?? null
  } else if (channel.scope === 'nexus') {
    const { data: nexus } = await admin.from('nexuses').select('name, slug').eq('id', channel.scope_id).maybeSingle()
    scopeName = nexus?.name ?? null
  } else if (channel.scope === 'outpost') {
    const { data: outpost } = await admin.from('outposts').select('name').eq('id', channel.scope_id).maybeSingle()
    scopeName = outpost?.name ?? null
  }

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <Link
        href="/channels"
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-5 transition-colors"
      >
        ← Channels
      </Link>

      {/* ── Header ─────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100">
                <Icon className="w-4 h-4 text-gray-600" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900">{channel.name}</h1>
            </div>

            <div className="flex items-center gap-2 flex-wrap mt-1.5 text-xs text-gray-500">
              <span className="capitalize">{channel.type} channel</span>
              {scopeName && <><span>·</span><span>{scopeName}</span></>}
              {channel.event_date && (
                <><span>·</span><span>{formatEventDate(channel.event_date)}</span></>
              )}
              <><span>·</span><span>{members.length} member{members.length !== 1 ? 's' : ''}</span></>
              {channel.member_cap && <span>/ {channel.member_cap} max</span>}
            </div>

            {channel.creator && (
              <p className="mt-1 text-xs text-gray-400">
                Created by{' '}
                <Link href={`/people/${channel.creator.handle}`} className="text-indigo-600 hover:underline">
                  {channel.creator.display_name}
                </Link>
              </p>
            )}
          </div>

          {/* Join / Leave */}
          {myProfileId && (
            isMember ? (
              <form action={leaveChannel.bind(null, channel.id)}>
                <button
                  type="submit"
                  className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                >
                  Leave
                </button>
              </form>
            ) : (
              <form action={joinChannel.bind(null, channel.id)}>
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                >
                  Join
                </button>
              </form>
            )
          )}
        </div>

        {channel.description && (
          <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-sm text-gray-700 leading-relaxed">{channel.description}</p>
          </div>
        )}
      </div>

      {/* ── Members (crew+ see list) ────────────────── */}
      {isCrew && members.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Members
            <span className="ml-2 text-xs font-normal text-gray-400">{members.length}</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {members.map(({ profile }) => (
              <Link
                key={profile.id}
                href={`/people/${profile.handle}`}
                className="flex items-center gap-1.5 rounded-full border border-gray-100 bg-white px-2.5 py-1 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors"
              >
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.display_name} className="w-5 h-5 rounded-full object-cover" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[9px] font-semibold flex items-center justify-center select-none">
                    {getInitials(profile.display_name)}
                  </div>
                )}
                <span className="text-xs text-gray-700">{profile.display_name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Feed (group-type channels) ─────────────── */}
      {channel.type === 'group' && (
        <section className="border-t border-gray-100 pt-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Feed</h2>
          {isMember && (
            <Composer
              scopeId={channel.id}
              visibility="group"
              placeholder={`Post to ${channel.name}…`}
            />
          )}
          <FeedList
            scopeIds={[channel.id]}
            myProfileId={myProfileId}
            emptyMessage="No posts yet in this channel."
          />
        </section>
      )}

      {/* ── Thread type ────────────────────────────── */}
      {channel.type === 'thread' && (
        <section className="border-t border-gray-100 pt-6">
          {isMember && (
            <Composer
              scopeId={channel.id}
              visibility="group"
              placeholder={`Reply to ${channel.name}…`}
            />
          )}
          <FeedList
            scopeIds={[channel.id]}
            myProfileId={myProfileId}
            emptyMessage="Start the conversation."
          />
        </section>
      )}

      {/* ── Event type ─────────────────────────────── */}
      {channel.type === 'event' && channel.event_date && (
        <section className="border-t border-gray-100 pt-6">
          <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <CalendarDays className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">
                {formatEventDate(channel.event_date)}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {members.length} attending
              {channel.member_cap ? ` · ${channel.member_cap} max` : ''}
            </p>
          </div>
          {isMember && (
            <Composer
              scopeId={channel.id}
              visibility="group"
              placeholder="Share details or questions…"
            />
          )}
          <FeedList
            scopeIds={[channel.id]}
            myProfileId={myProfileId}
            emptyMessage="No updates yet."
          />
        </section>
      )}
    </div>
  )
}
