import Link from 'next/link'
import { Hash, Plus, Users, CalendarDays, MessageSquare } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NewChannelCompose } from '@/components/compose/new-channel-compose'

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

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100/80 dark:border-gray-800/50">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{title}</h3>
      </div>
      {children}
    </div>
  )
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
      isCreator = ['host', 'guide', 'mentor', 'janitor'].includes(profile.community_role)

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

  // Build scope options for the create-channel modal
  const scopeOptions: { scope: 'hub' | 'nexus' | 'outpost'; scopeId: string; label: string }[] = []
  if (myHubId || myNexusId || myOutpostId) {
    const [hubR, nexusR, outpostR] = await Promise.all([
      myHubId ? admin.from('hubs').select('name').eq('id', myHubId).maybeSingle() : Promise.resolve({ data: null }),
      myNexusId ? admin.from('nexuses').select('name').eq('id', myNexusId).maybeSingle() : Promise.resolve({ data: null }),
      myOutpostId ? admin.from('outposts').select('name').eq('id', myOutpostId).maybeSingle() : Promise.resolve({ data: null }),
    ])
    if (myHubId && hubR.data) scopeOptions.push({ scope: 'hub', scopeId: myHubId, label: `Hub: ${(hubR.data as { name: string }).name}` })
    if (myNexusId && nexusR.data) scopeOptions.push({ scope: 'nexus', scopeId: myNexusId, label: `Nexus: ${(nexusR.data as { name: string }).name}` })
    if (myOutpostId && outpostR.data) scopeOptions.push({ scope: 'outpost', scopeId: myOutpostId, label: `Outpost: ${(outpostR.data as { name: string }).name}` })
  }

  if (!myNexusId && !myHubId) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-1">Channels</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
          Focused spaces beyond your circle. Channels are where the community organises around a
          topic, event, or conversation, open to anyone in your area.
        </p>
        <div className="rounded-2xl border border-dashed border-gray-200/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/50 p-12 text-center">
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
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-1">Channels</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-lg">
            Focused spaces beyond your circle. Channels are where the community organises around a
            topic, event, or conversation, open to anyone in your area.
          </p>
        </div>
        {isCreator && scopeOptions.length > 0 && <NewChannelCompose scopeOptions={scopeOptions} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Main column: channels list ───────────────────────── */}
        <div className="lg:col-span-2">

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
            <div className="rounded-2xl border border-dashed border-gray-200/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/50 p-12 text-center">
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

        {/* ── Sidebar ─────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* My Channels quick-links */}
          <SidebarCard title="My Channels">
            {myChannels.length === 0 ? (
              <p className="px-4 py-4 text-xs text-gray-400 dark:text-gray-500 text-center">
                No channels joined
              </p>
            ) : (
              <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                {myChannels.map((ch) => {
                  const typeColor = TYPE_COLOR[ch.type] ?? TYPE_COLOR.group
                  return (
                    <li key={ch.id}>
                      <Link
                        href={`/channels/${ch.id}`}
                        className="flex items-center justify-between px-4 py-2.5 gap-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                          {ch.name}
                        </span>
                        <span className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded-full font-medium ${typeColor}`}>
                          {TYPE_LABEL[ch.type]}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </SidebarCard>

          {/* Admin card */}
          {isCreator && (
            <SidebarCard title="Admin">
              <div className="px-4 py-3 space-y-2">
                <Link
                  href="/channels/new"
                  className="flex items-center justify-between text-xs font-medium text-indigo-600 hover:underline"
                >
                  New Channel →
                </Link>
                <Link
                  href="/admin/channels"
                  className="flex items-center justify-between text-xs font-medium text-gray-600 dark:text-gray-400 hover:underline"
                >
                  Manage Channels
                </Link>
              </div>
            </SidebarCard>
          )}
        </div>
      </div>
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
      className="flex items-start gap-3 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm px-4 py-3 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors"
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
