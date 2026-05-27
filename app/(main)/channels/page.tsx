import Link from 'next/link'
import { Hash, Plus, Users, CalendarDays, MessageSquare } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type ChannelRow = {
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
    community_role: string
  } | null
  _member_count?: number
  _is_member?: boolean
}

const TYPE_ICON = {
  group:  Hash,
  event:  CalendarDays,
  thread: MessageSquare,
}

const TYPE_LABEL = {
  group: 'Group',
  event: 'Event',
  thread: 'Thread',
}

const TYPE_COLOR: Record<string, string> = {
  group:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  event:  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  thread: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export default async function ChannelsPage() {
  const admin = createAdminClient()
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let myProfileId: string | null = null
  let myNexusId: string | null = null
  let myHubId: string | null = null
  let myOutpostId: string | null = null
  let isCreator = false

  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, community_role')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      myProfileId = profile.id
      isCreator = ['host', 'guide', 'mentor'].includes(profile.community_role)

      // Derive nexus/hub/outpost from membership chain
      const { data: membership } = await admin
        .from('memberships')
        .select(
          `circle_id,
           circle:circles!circle_id (
             hub:hubs!hub_id (
               id,
               nexus:nexuses!nexus_id (
                 id,
                 outpost:outposts!outpost_id ( id )
               )
             )
           )`
        )
        .eq('profile_id', profile.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (membership) {
        const m = membership as unknown as { circle: { hub: { id: string; nexus: { id: string; outpost: { id: string } | null } | null } | null } | null }
        myHubId = m.circle?.hub?.id ?? null
        myNexusId = m.circle?.hub?.nexus?.id ?? null
        myOutpostId = m.circle?.hub?.nexus?.outpost?.id ?? null
      }
    }
  }

  if (!myNexusId && !myHubId) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-1">Channels</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
          Focused spaces beyond your circle. Channels are where the community organises around a
          topic, event, or conversation, open to anyone in your area.
        </p>
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 p-12 text-center">
          <Hash className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <Link href="/circles" className="text-indigo-600 hover:underline">
              Join a circle
            </Link>{' '}
            to discover channels.
          </p>
        </div>
      </div>
    )
  }

  // Channel discovery: public channels within nexus scope
  // (nexus-scoped + hub-scoped within nexus + outpost-scoped)
  const scopeConditions: { scope: string; scope_id: string }[] = []
  if (myNexusId) scopeConditions.push({ scope: 'nexus', scope_id: myNexusId })
  if (myHubId) scopeConditions.push({ scope: 'hub', scope_id: myHubId })
  if (myOutpostId) scopeConditions.push({ scope: 'outpost', scope_id: myOutpostId })

  // We'll fetch channels for each scope and merge
  const allChannelIds = new Set<string>()
  const allChannels: ChannelRow[] = []

  for (const { scope, scope_id } of scopeConditions) {
    const { data: rows } = await admin
      .from('channels')
      .select(
        `id, name, description, type, scope, scope_id, member_cap, is_public, event_date, created_at,
         creator:profiles!creator_id ( id, display_name, handle, community_role )`
      )
      .eq('scope', scope)
      .eq('scope_id', scope_id)
      .eq('is_public', true)
      .order('created_at', { ascending: false })

    for (const row of rows ?? []) {
      if (!allChannelIds.has(row.id)) {
        allChannelIds.add(row.id)
        allChannels.push(row as unknown as ChannelRow)
      }
    }
  }

  // Fetch member counts + my memberships
  const channelIds = allChannels.map((c) => c.id)
  let memberCounts: Record<string, number> = {}
  let myChannelIds = new Set<string>()

  if (channelIds.length > 0) {
    const { data: counts } = await admin
      .from('channel_memberships')
      .select('channel_id')
      .in('channel_id', channelIds)
      .eq('status', 'active')
    ;(counts ?? []).forEach((r: { channel_id: string }) => {
      memberCounts[r.channel_id] = (memberCounts[r.channel_id] ?? 0) + 1
    })

    if (myProfileId) {
      const { data: mine } = await admin
        .from('channel_memberships')
        .select('channel_id')
        .in('channel_id', channelIds)
        .eq('profile_id', myProfileId)
        .eq('status', 'active')
      ;(mine ?? []).forEach((r: { channel_id: string }) => myChannelIds.add(r.channel_id))
    }
  }

  const myChannels = allChannels.filter((c) => myChannelIds.has(c.id))
  const discoverChannels = allChannels.filter((c) => !myChannelIds.has(c.id))

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Channels</h1>
          {isCreator && (
            <Link
              href="/channels/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Channel
            </Link>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-lg">
          Focused spaces beyond your circle. Channels are where the community organises around a
          topic, event, or conversation — open to anyone in your area.
        </p>
      </div>

      {myChannels.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Joined
          </h2>
          <div className="space-y-2">
            {myChannels.map((ch) => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                memberCount={memberCounts[ch.id] ?? 0}
                isMember
              />
            ))}
          </div>
        </section>
      )}

      {discoverChannels.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Discover
          </h2>
          <div className="space-y-2">
            {discoverChannels.map((ch) => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                memberCount={memberCounts[ch.id] ?? 0}
                isMember={false}
              />
            ))}
          </div>
        </section>
      )}

      {allChannels.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 p-12 text-center">
          <Hash className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No channels in your area yet.</p>
          {isCreator && (
            <Link
              href="/channels/new"
              className="mt-3 inline-block text-xs text-indigo-600 hover:underline"
            >
              Create the first one →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function ChannelCard({
  channel,
  memberCount,
  isMember,
}: {
  channel: ChannelRow
  memberCount: number
  isMember: boolean
}) {
  const Icon = TYPE_ICON[channel.type] ?? Hash
  const typeColor = TYPE_COLOR[channel.type] ?? TYPE_COLOR.group

  return (
    <Link
      href={`/channels/${channel.id}`}
      className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors"
    >
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-50 dark:bg-gray-800 shrink-0">
        <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{channel.name}</span>
          <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${typeColor}`}>
            {TYPE_LABEL[channel.type]}
          </span>
          {isMember && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
              Joined
            </span>
          )}
        </div>

        {channel.description && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{channel.description}</p>
        )}

        <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
          {channel.event_date && (
            <span>{formatEventDate(channel.event_date)}</span>
          )}
          {memberCount > 0 && (
            <span className="flex items-center gap-0.5">
              <Users className="w-3 h-3" />
              {memberCount}
            </span>
          )}
          {channel.member_cap && (
            <span>/ {channel.member_cap} max</span>
          )}
          {channel.creator && (
            <span>by {channel.creator.display_name}</span>
          )}
        </div>
      </div>
    </Link>
  )
}
