import Link from 'next/link'
import {
  Sparkles, Activity, Heart, MessagesSquare, Megaphone, Palette, Briefcase, Radio, Users, Circle as CircleIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { TuneInButton, TunedInButton } from './channel-toggle'
import { NewChannelCompose } from './new-channel-compose'
import { PageHeader, StatStrip } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { getViewerGamStats } from '@/lib/viewer-stats'

type TopicalChannel = {
  id: string
  name: string
  slug: string
  category: string
  description: string | null
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
    canCreate = role === 'host' || role === 'guide' || role === 'mentor' || role === 'janitor'
  }

  const [{ data: channels }, gam] = await Promise.all([
    admin.from('topical_channels')
      .select('id, name, slug, category, description, cover_image, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    getViewerGamStats(),
  ])

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

  const tunedIn = channelList.filter((c) => myChannelIds.has(c.id))
  const explore = channelList.filter((c) => !myChannelIds.has(c.id))

  const stats = {
    interests: channelList.length,
    tunedIn: Object.values(memberCounts).reduce((s, n) => s + n, 0),
    circles: Object.values(circleCounts).reduce((s, n) => s + n, 0),
    categories: new Set(channelList.map((c) => c.category)).size,
  }

  return (
    <div>
      <PageHeader
        title="Interests"
        description="Find your thing. Interests are the global topics anyone can tune into — each carries a seasonal practice that Circles run locally. Pick what lights you up, then go do it with people near you."
        action={canCreate ? <NewChannelCompose /> : undefined}
        gam={gam}
      />

      <StatStrip items={[
        { value: stats.interests, label: 'Interests' },
        { value: stats.tunedIn, label: 'Tuned in' },
        { value: stats.circles, label: 'Circles' },
        { value: stats.categories, label: 'Categories' },
      ]} />

      <div className="space-y-10">
        {tunedIn.length > 0 && (
          <section>
            <SectionHeader title="Tuned in" count={tunedIn.length} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tunedIn.map((ch) => (
                <ChannelCard key={ch.id} channel={ch} memberCount={memberCounts[ch.id] ?? 0} circleCount={circleCounts[ch.id] ?? 0} isTunedIn canToggle={!!myProfileId} />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeader title={tunedIn.length > 0 ? 'Explore more' : 'Explore'} count={explore.length} />
          {explore.length === 0 ? (
            <EmptyState icon={Radio} title="You're tuned into everything" description="You're following every interest going. Find a circle practicing one near you." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {explore.map((ch) => (
                <ChannelCard key={ch.id} channel={ch} memberCount={memberCounts[ch.id] ?? 0} circleCount={circleCounts[ch.id] ?? 0} isTunedIn={false} canToggle={!!myProfileId} />
              ))}
            </div>
          )}
        </section>
      </div>
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
    <div className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all hover:border-primary-bg hover:shadow-md">
      <div className="flex items-start gap-3">
        {channel.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={channel.cover_image} alt={channel.name} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
            <Icon className="h-6 w-6" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <Link href={`/channels/${channel.slug}`} className="text-base font-semibold leading-tight text-text transition-colors hover:text-primary-strong">
            {channel.name}
          </Link>
          {channel.description && <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-muted">{channel.description}</p>}
        </div>
        {canToggle && (
          isTunedIn
            ? <TunedInButton channelId={channel.id} channelName={channel.name} />
            : <TuneInButton channelId={channel.id} slug={channel.slug} />
        )}
      </div>

      <div className="mt-auto flex items-center gap-3 pt-4 text-xs text-subtle">
        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{memberCount.toLocaleString()} tuned in</span>
        <span className="text-subtle/60">·</span>
        <span className="flex items-center gap-1"><CircleIcon className="h-3 w-3" />{circleCount} {circleCount === 1 ? 'circle' : 'circles'}</span>
      </div>
    </div>
  )
}
