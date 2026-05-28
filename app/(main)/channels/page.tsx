import Link from 'next/link'
import {
  Sparkles,
  Activity,
  Heart,
  MessagesSquare,
  Megaphone,
  Palette,
  Briefcase,
  Radio,
  Users,
  Circle as CircleIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { TuneInButton, TunedInButton } from './channel-toggle'
import { NewChannelCompose } from './new-channel-compose'

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
  spirituality:     Sparkles,
  movement:         Activity,
  'holistic-health': Heart,
  'human-relating': MessagesSquare,
  activism:         Megaphone,
  creative:         Palette,
  'business-support': Briefcase,
}

const CATEGORY_ACCENT: Record<string, string> = {
  spirituality:     'from-signal/20 to-signal/10  text-signal-strong',
  movement:         'from-emerald-500/20 to-signal/10    text-signal-strong',
  'holistic-health': 'from-danger/20 to-danger/10       text-danger',
  'human-relating': 'from-signal/20 to-signal/10        text-signal-strong',
  activism:         'from-primary/20 to-danger/10      text-warning dark:text-primary',
  creative:         'from-amber-500/20 to-primary/10    text-warning',
  'business-support': 'from-muted/20 to-canvas/10    text-muted dark:text-subtle',
}

export default async function ChannelsPage() {
  const admin = createAdminClient()
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let myProfileId: string | null = null
  let canCreate = false
  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, community_role')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    myProfileId = profile?.id ?? null
    const role = (profile as { community_role?: string } | null)?.community_role
    canCreate = role === 'host' || role === 'guide' || role === 'mentor' || role === 'janitor'
  }

  const { data: channels } = await admin
    .from('topical_channels')
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
      admin
        .from('topical_channel_memberships')
        .select('topical_channel_id')
        .in('topical_channel_id', channelIds),
      admin
        .from('circles')
        .select('topical_channel_id')
        .in('topical_channel_id', channelIds)
        .neq('status', 'archived'),
    ])

    ;(members ?? []).forEach((m: { topical_channel_id: string }) => {
      memberCounts[m.topical_channel_id] = (memberCounts[m.topical_channel_id] ?? 0) + 1
    })
    ;(circles ?? []).forEach((c: { topical_channel_id: string | null }) => {
      if (c.topical_channel_id) {
        circleCounts[c.topical_channel_id] = (circleCounts[c.topical_channel_id] ?? 0) + 1
      }
    })

    if (myProfileId) {
      const { data: mine } = await admin
        .from('topical_channel_memberships')
        .select('topical_channel_id')
        .in('topical_channel_id', channelIds)
        .eq('profile_id', myProfileId)
      ;(mine ?? []).forEach((m: { topical_channel_id: string }) => myChannelIds.add(m.topical_channel_id))
    }
  }

  const tunedIn  = channelList.filter((c) => myChannelIds.has(c.id))
  const explore  = channelList.filter((c) => !myChannelIds.has(c.id))

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-5 h-5 text-primary-strong" />
            <h1 className="text-2xl font-bold text-text">Channels</h1>
          </div>
          <p className="text-sm text-muted leading-relaxed max-w-xl">
            Channels are global topics anyone can tune into. Each one carries a
            seasonal practice that Circles run locally. Pick what you&apos;re into,
            then find the people doing it near you.
          </p>
        </div>
        {canCreate && <NewChannelCompose />}
      </div>

      {tunedIn.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-3">
            Tuned in
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tunedIn.map((ch) => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                memberCount={memberCounts[ch.id] ?? 0}
                circleCount={circleCounts[ch.id] ?? 0}
                isTunedIn
                canToggle={!!myProfileId}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-3">
          {tunedIn.length > 0 ? 'Explore more' : 'Explore'}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {explore.map((ch) => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              memberCount={memberCounts[ch.id] ?? 0}
              circleCount={circleCounts[ch.id] ?? 0}
              isTunedIn={false}
              canToggle={!!myProfileId}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function ChannelCard({
  channel,
  memberCount,
  circleCount,
  isTunedIn,
  canToggle,
}: {
  channel: TopicalChannel
  memberCount: number
  circleCount: number
  isTunedIn: boolean
  canToggle: boolean
}) {
  const Icon = CATEGORY_ICON[channel.category] ?? Radio
  const accent = CATEGORY_ACCENT[channel.category] ?? 'from-muted/10 to-muted/5 text-muted'

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm hover:border-primary-bg dark:hover:border-primary transition-colors">
      <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-40 pointer-events-none`} />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <Link href={`/channels/${channel.slug}`} className="flex items-start gap-3 min-w-0 flex-1">
            <div className={`flex items-center justify-center w-11 h-11 rounded-xl bg-white/80 dark:bg-canvas/40 backdrop-blur-sm shrink-0 ${CATEGORY_ACCENT[channel.category]?.split(' ').filter((c) => c.startsWith('text-')).join(' ')}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-text leading-tight">
                {channel.name}
              </h3>
              {channel.description && (
                <p className="text-xs text-muted mt-0.5 line-clamp-2 leading-relaxed">
                  {channel.description}
                </p>
              )}
            </div>
          </Link>
          {canToggle && (
            isTunedIn
              ? <TunedInButton channelId={channel.id} channelName={channel.name} />
              : <TuneInButton channelId={channel.id} slug={channel.slug} />
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {memberCount.toLocaleString()} tuned in
          </span>
          <span className="text-subtle/60">·</span>
          <span className="flex items-center gap-1">
            <CircleIcon className="w-3 h-3" />
            {circleCount} {circleCount === 1 ? 'Circle' : 'Circles'}
          </span>
        </div>
      </div>
    </div>
  )
}
