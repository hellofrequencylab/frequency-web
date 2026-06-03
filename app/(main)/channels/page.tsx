import Image from 'next/image'
import Link from 'next/link'
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

// On the shared IndexTemplate + EntityCard (REDESIGN-INAPP Phase 1). Tune-in is
// the card's floating action; the viewer's gamification stats live in the
// right-rail dock, so no per-page strip here.
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

  const { data: channels } = await admin.from('topical_channels')
    .select('id, name, slug, category, description, cover_image, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

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

  // Right-column data: categories (with counts) + a featured interest (most circles).
  const categoryCounts = new Map<string, number>()
  for (const c of channelList) categoryCounts.set(c.category, (categoryCounts.get(c.category) ?? 0) + 1)
  const categories = [...categoryCounts.entries()]
    .map(([slug, count]) => ({
      slug,
      count,
      label: slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    }))
    .sort((a, b) => b.count - a.count)

  const featured = [...channelList].sort((a, b) => (circleCounts[b.id] ?? 0) - (circleCounts[a.id] ?? 0))[0] ?? null
  const FeaturedIcon = featured ? (CATEGORY_ICON[featured.category] ?? Radio) : Radio

  return (
    <IndexTemplate
      title="Interests"
      description="Find your thing. Interests are the global topics anyone can tune into — each carries a seasonal practice that Circles run locally. Pick what lights you up, then go do it with people near you."
      action={canCreate ? <NewChannelCompose /> : undefined}
    >
      <div className="grid grid-cols-1 gap-x-8 gap-y-8 lg:grid-cols-3">
        {/* Left: the interest cards, two-up (squished left). */}
        <div className="space-y-8 lg:col-span-2">
          {tunedIn.length > 0 && (
            <section>
              <SectionHeader title="Tuned in" count={tunedIn.length} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {explore.map((ch) => (
                  <ChannelCard key={ch.id} channel={ch} memberCount={memberCounts[ch.id] ?? 0} circleCount={circleCounts[ch.id] ?? 0} isTunedIn={false} canToggle={!!myProfileId} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right: the interior menu — stats · categories · featured. */}
        <aside className="space-y-8">
          {/* At a glance */}
          <section>
            <SectionHeader title="At a glance" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Stat value={stats.interests} label="Interests" />
              <Stat value={stats.tunedIn} label="Tuned in" />
              <Stat value={stats.circles} label="Circles" />
              <Stat value={stats.categories} label="Categories" />
            </div>
          </section>

          {/* Categories */}
          <section>
            <SectionHeader title="Categories" count={categories.length} />
            <div className="space-y-0.5">
              {categories.map((cat) => {
                const Icon = CATEGORY_ICON[cat.slug] ?? Radio
                return (
                  <div key={cat.slug} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-primary-strong">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1 truncate text-sm font-medium text-text">{cat.label}</span>
                    <span className="text-xs tabular-nums text-subtle">{cat.count}</span>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Featured */}
          {featured && (
            <section>
              <SectionHeader title="Featured" />
              <Link
                href={`/channels/${featured.slug}`}
                className="block rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-primary-bg hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
                    <FeaturedIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-text">{featured.name}</p>
                    <p className="text-xs text-subtle">
                      {circleCounts[featured.id] ?? 0} {(circleCounts[featured.id] ?? 0) === 1 ? 'circle' : 'circles'} · {memberCounts[featured.id] ?? 0} tuned in
                    </p>
                  </div>
                </div>
                {featured.description && (
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">{featured.description}</p>
                )}
              </Link>
            </section>
          )}
        </aside>
      </div>
    </IndexTemplate>
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
