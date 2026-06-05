import Image from 'next/image'
import {
  Sparkles, Activity, Heart, MessagesSquare, Megaphone, Palette, Briefcase, Radio, Users, Circle as CircleIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { TuneInButton, TunedInButton } from './channel-toggle'
import { NewChannelCompose } from './new-channel-compose'
import { IndexTemplate } from '@/components/templates/index-template'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'

type TopicalChannel = {
  id: string
  name: string
  slug: string
  category: string
  description: string | null
  cover_image: string | null
  display_order: number
  domain_id: string | null
}

type Domain = {
  id: string
  slug: string
  name: string
  description: string | null
  accent: string | null
  cover_image: string | null
  display_order: number
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  spirituality: Sparkles,
  movement: Activity,
  'holistic-health': Heart,
  'human-relating': MessagesSquare,
  activism: Megaphone,
  creative: Palette,
  'business-support': Briefcase,
}

// Channels = the four Domains (Mind / Body / Spirit / Expression), read from the
// `domains` table so they stay data-editable. The existing Interests/Topics
// (topical_channels) sort underneath each Channel. Tune-in remains the per-topic
// action; the tuned-in vs explore framing is preserved within each Channel.
export default async function ChannelsPage() {
  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  let myProfileId: string | null = null
  let canCreate = false
  if (user) {
    const { data: profile } = await admin
      .from('profiles').select('id, community_role').eq('auth_user_id', user.id).maybeSingle()
    myProfileId = profile?.id ?? null
    const role = (profile as { community_role?: string } | null)?.community_role
    canCreate = role === 'host' || role === 'guide' || role === 'mentor' || role === 'admin' || role === 'janitor'
  }

  const [{ data: domainsData }, { data: channels }] = await Promise.all([
    admin.from('domains')
      .select('id, slug, name, description, accent, cover_image, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    admin.from('topical_channels')
      .select('id, name, slug, category, description, cover_image, display_order, domain_id')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
  ])

  const domains = (domainsData ?? []) as Domain[]
  const channelList = (channels ?? []) as TopicalChannel[]
  const channelIds = channelList.map((c) => c.id)

  const memberCounts: Record<string, number> = {}
  const circleCounts: Record<string, number> = {}
  const myChannelIds = new Set<string>()

  if (channelIds.length > 0) {
    const [{ data: members }, { data: circles }] = await Promise.all([
      admin.from('topical_channel_memberships').select('topical_channel_id').in('topical_channel_id', channelIds),
      admin.from('circles').select('topical_channel_id').in('topical_channel_id', channelIds).neq('status', 'archived'),
    ])
    ;(members ?? []).forEach((m: { topical_channel_id: string }) => {
      memberCounts[m.topical_channel_id] = (memberCounts[m.topical_channel_id] ?? 0) + 1
    })
    ;(circles ?? []).forEach((c: { topical_channel_id: string | null }) => {
      if (c.topical_channel_id) circleCounts[c.topical_channel_id] = (circleCounts[c.topical_channel_id] ?? 0) + 1
    })
    if (myProfileId) {
      const { data: mine } = await admin
        .from('topical_channel_memberships').select('topical_channel_id')
        .in('topical_channel_id', channelIds).eq('profile_id', myProfileId)
      ;(mine ?? []).forEach((m: { topical_channel_id: string }) => myChannelIds.add(m.topical_channel_id))
    }
  }

  // Group the Interests under their Channel (Domain). Anything not yet assigned
  // to a domain falls into an "Unsorted" bucket at the end so it stays visible
  // until an admin assigns it.
  const byDomain = new Map<string, TopicalChannel[]>()
  for (const ch of channelList) {
    const key = ch.domain_id ?? '__unsorted__'
    const list = byDomain.get(key) ?? []
    list.push(ch)
    byDomain.set(key, list)
  }

  const sections = domains
    .map((d) => ({ domain: d, topics: byDomain.get(d.id) ?? [] }))
    .filter((s) => s.topics.length > 0)

  const unsorted = byDomain.get('__unsorted__') ?? []

  // At-a-glance stats across the whole taxonomy.
  const stats = {
    channels: sections.length,
    interests: channelList.length,
    tunedIn: myChannelIds.size,
    circles: Object.values(circleCounts).reduce((s, n) => s + n, 0),
  }

  return (
    <IndexTemplate
      title="Channels"
      description={
        <>
          {/* Mobile leads with a tight line so the Channels surface without scrolling
              past a wall of copy; desktop keeps the full explainer. */}
          <span className="sm:hidden">Four Channels — Mind, Body, Spirit, Expression — and the Interests inside them.</span>
          <span className="hidden sm:inline">
            The four Channels — Mind, Body, Spirit, and Expression — are how Frequency is organized.
            Interests live inside them: global topics anyone can tune into, each carrying a practice
            that Circles run locally. Pick a Channel, find your Interest, then go do it with people near you.
          </span>
        </>
      }
      action={canCreate ? <NewChannelCompose domains={domains} /> : undefined}
    >
      <div className="grid grid-cols-1 gap-x-8 gap-y-8 lg:grid-cols-3">
        {/* Left: the four Channels, each with its Interests beneath. */}
        <div className="space-y-10 lg:col-span-2">
          {sections.map(({ domain, topics }) => (
            <DomainSection
              key={domain.id}
              domain={domain}
              topics={topics}
              memberCounts={memberCounts}
              circleCounts={circleCounts}
              tunedInIds={myChannelIds}
              canToggle={!!myProfileId}
            />
          ))}

          {unsorted.length > 0 && (
            <section>
              <div className="mb-3">
                <h2 className="text-lg font-bold tracking-tight text-text">Unsorted</h2>
                <p className="mt-0.5 text-sm text-muted leading-relaxed">
                  Interests not yet sorted into a Channel.
                </p>
              </div>
              <TopicGrid
                topics={unsorted}
                memberCounts={memberCounts}
                circleCounts={circleCounts}
                tunedInIds={myChannelIds}
                canToggle={!!myProfileId}
              />
            </section>
          )}

          {sections.length === 0 && unsorted.length === 0 && (
            <EmptyState icon={Radio} title="No Channels yet" description="Interests will appear here once they're set up." />
          )}
        </div>

        {/* Right: the interior menu — stats + the Channels list. */}
        <aside className="space-y-8">
          <section>
            <SectionHeader title="At a glance" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Stat value={stats.channels} label="Channels" />
              <Stat value={stats.interests} label="Interests" />
              <Stat value={stats.tunedIn} label="Tuned in" />
              <Stat value={stats.circles} label="Circles" />
            </div>
          </section>

          <section>
            <SectionHeader title="Channels" count={sections.length} />
            <div className="space-y-0.5">
              {sections.map(({ domain, topics }) => (
                <a
                  key={domain.id}
                  href={`#channel-${domain.slug}`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-elevated transition-colors"
                >
                  <span className="flex-1 truncate text-sm font-medium text-text">{domain.name}</span>
                  <span className="text-xs tabular-nums text-subtle">{topics.length}</span>
                </a>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </IndexTemplate>
  )
}

// A Channel (Domain) section: its name + description, then its Interests, split
// into tuned-in vs explore so the framing carries through to each Channel.
function DomainSection({
  domain, topics, memberCounts, circleCounts, tunedInIds, canToggle,
}: {
  domain: Domain
  topics: TopicalChannel[]
  memberCounts: Record<string, number>
  circleCounts: Record<string, number>
  tunedInIds: Set<string>
  canToggle: boolean
}) {
  const tunedIn = topics.filter((t) => tunedInIds.has(t.id))
  const explore = topics.filter((t) => !tunedInIds.has(t.id))

  return (
    <section id={`channel-${domain.slug}`} className="scroll-mt-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold tracking-tight text-text">{domain.name}</h2>
        {domain.description && (
          <p className="mt-0.5 text-sm text-muted leading-relaxed">{domain.description}</p>
        )}
      </div>

      <div className="space-y-5">
        {tunedIn.length > 0 && (
          <div>
            <SectionHeader title="Tuned in" count={tunedIn.length} />
            <TopicGrid
              topics={tunedIn}
              memberCounts={memberCounts}
              circleCounts={circleCounts}
              tunedInIds={tunedInIds}
              canToggle={canToggle}
            />
          </div>
        )}

        <div>
          {tunedIn.length > 0 && <SectionHeader title="Explore more" count={explore.length} />}
          {explore.length === 0 ? (
            tunedIn.length > 0 ? (
              <EmptyState icon={Radio} title="You're tuned into everything here" description={`You're following every Interest in ${domain.name}. Find a circle practicing one near you.`} />
            ) : null
          ) : (
            <TopicGrid
              topics={explore}
              memberCounts={memberCounts}
              circleCounts={circleCounts}
              tunedInIds={tunedInIds}
              canToggle={canToggle}
            />
          )}
        </div>
      </div>
    </section>
  )
}

function TopicGrid({
  topics, memberCounts, circleCounts, tunedInIds, canToggle,
}: {
  topics: TopicalChannel[]
  memberCounts: Record<string, number>
  circleCounts: Record<string, number>
  tunedInIds: Set<string>
  canToggle: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {topics.map((ch) => (
        <ChannelCard
          key={ch.id}
          channel={ch}
          memberCount={memberCounts[ch.id] ?? 0}
          circleCount={circleCounts[ch.id] ?? 0}
          isTunedIn={tunedInIds.has(ch.id)}
          canToggle={canToggle}
        />
      ))}
    </div>
  )
}

// De-boxed stat — a value over a label, in the right column.
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-xl font-bold leading-none tabular-nums text-text">{value.toLocaleString()}</div>
      <div className="mt-1 text-xs text-subtle">{label}</div>
    </div>
  )
}

function ChannelCard({
  channel, memberCount, circleCount, isTunedIn, canToggle,
}: {
  channel: TopicalChannel
  memberCount: number
  circleCount: number
  isTunedIn: boolean
  canToggle: boolean
}) {
  const Icon = CATEGORY_ICON[channel.category] ?? Radio

  return (
    <EntityCard
      href={`/channels/${channel.slug}`}
      anchor={
        channel.cover_image ? (
          <Image src={channel.cover_image} alt={channel.name} width={48} height={48} className="h-12 w-12 rounded-2xl object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
            <Icon className="h-6 w-6" />
          </div>
        )
      }
      title={channel.name}
      description={channel.description ?? undefined}
      meta={
        <>
          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{memberCount.toLocaleString()} tuned in</span>
          <span className="flex items-center gap-1"><CircleIcon className="h-3 w-3" />{circleCount} {circleCount === 1 ? 'circle' : 'circles'}</span>
        </>
      }
      action={
        canToggle
          ? isTunedIn
            ? <TunedInButton channelId={channel.id} channelName={channel.name} />
            : <TuneInButton channelId={channel.id} slug={channel.slug} />
          : undefined
      }
    />
  )
}
