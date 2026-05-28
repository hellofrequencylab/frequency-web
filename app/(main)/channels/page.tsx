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
import { tuneInChannel, tuneOutChannel } from './actions'

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
  spirituality:     'from-violet-500/20 to-fuchsia-500/10  text-violet-600 dark:text-violet-400',
  movement:         'from-emerald-500/20 to-teal-500/10    text-emerald-600 dark:text-emerald-400',
  'holistic-health': 'from-rose-500/20 to-pink-500/10       text-rose-600 dark:text-rose-400',
  'human-relating': 'from-sky-500/20 to-blue-500/10        text-sky-600 dark:text-sky-400',
  activism:         'from-orange-500/20 to-red-500/10      text-orange-600 dark:text-orange-400',
  creative:         'from-amber-500/20 to-yellow-500/10    text-amber-600 dark:text-amber-400',
  'business-support': 'from-slate-500/20 to-zinc-500/10    text-slate-600 dark:text-slate-400',
}

export default async function ChannelsPage() {
  const admin = createAdminClient()
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let myProfileId: string | null = null
  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    myProfileId = profile?.id ?? null
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
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Radio className="w-5 h-5 text-indigo-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Channels</h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-xl">
          Topical forums anyone in the world can tune into. Each Channel carries a seasonal
          practice that Circles run locally — find your topics, then find your people.
        </p>
      </div>

      {tunedIn.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
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
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
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
  const accent = CATEGORY_ACCENT[channel.category] ?? 'from-gray-500/10 to-gray-500/5 text-gray-600 dark:text-gray-400'

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors">
      <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-40 pointer-events-none`} />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <Link href={`/channels/${channel.slug}`} className="flex items-start gap-3 min-w-0 flex-1">
            <div className={`flex items-center justify-center w-11 h-11 rounded-xl bg-white/80 dark:bg-gray-950/40 backdrop-blur-sm shrink-0 ${CATEGORY_ACCENT[channel.category]?.split(' ').filter((c) => c.startsWith('text-')).join(' ')}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50 leading-tight">
                {channel.name}
              </h3>
              {channel.description && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                  {channel.description}
                </p>
              )}
            </div>
          </Link>
          {canToggle && (
            isTunedIn ? (
              <form action={tuneOutChannel.bind(null, channel.id)}>
                <button
                  type="submit"
                  className="shrink-0 rounded-full border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:text-red-600 hover:border-red-200 transition-colors"
                >
                  Tuned in
                </button>
              </form>
            ) : (
              <form action={tuneInChannel.bind(null, channel.id)}>
                <button
                  type="submit"
                  className="shrink-0 rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 transition-colors"
                >
                  Tune in
                </button>
              </form>
            )
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {memberCount.toLocaleString()} tuned in
          </span>
          <span className="text-gray-300 dark:text-gray-700">·</span>
          <span className="flex items-center gap-1">
            <CircleIcon className="w-3 h-3" />
            {circleCount} {circleCount === 1 ? 'Circle' : 'Circles'}
          </span>
        </div>
      </div>
    </div>
  )
}
