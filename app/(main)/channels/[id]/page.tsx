import { notFound } from 'next/navigation'
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
  MapPin,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { tuneInChannel, tuneOutChannel } from '../actions'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'

type TopicalChannel = {
  id: string
  name: string
  slug: string
  category: string
  description: string | null
  cover_image: string | null
  is_active: boolean
}

type CircleRow = {
  id: string
  name: string
  slug: string
  type: 'in-person' | 'online'
  member_count: number
  member_cap: number
  status: string
  city: string | null
  neighborhood: string | null
  host: { display_name: string; handle: string } | null
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
  spirituality:     'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40',
  movement:         'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40',
  'holistic-health': 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40',
  'human-relating': 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40',
  activism:         'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40',
  creative:         'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40',
  'business-support': 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/40',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = createAdminClient()
  const supabase = await createClient()

  const matchField = UUID_RE.test(id) ? 'id' : 'slug'
  const { data: rawChannel } = await admin
    .from('topical_channels')
    .select('id, name, slug, category, description, cover_image, is_active')
    .eq(matchField, id)
    .maybeSingle()

  if (!rawChannel || !rawChannel.is_active) notFound()
  const channel = rawChannel as TopicalChannel

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let myProfileId: string | null = null
  let isTunedIn = false

  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      myProfileId = profile.id
      const { data: membership } = await admin
        .from('topical_channel_memberships')
        .select('id')
        .eq('topical_channel_id', channel.id)
        .eq('profile_id', myProfileId)
        .maybeSingle()
      isTunedIn = !!membership
    }
  }

  const [{ count: memberCount }, { data: rawCircles }] = await Promise.all([
    admin
      .from('topical_channel_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('topical_channel_id', channel.id),
    admin
      .from('circles')
      .select(
        `id, name, slug, type, member_count, member_cap, status, city, neighborhood,
         host:profiles!host_id ( display_name, handle )`
      )
      .eq('topical_channel_id', channel.id)
      .neq('status', 'archived')
      .order('member_count', { ascending: false })
      .limit(12),
  ])

  const circles = (rawCircles ?? []) as unknown as CircleRow[]

  const Icon = CATEGORY_ICON[channel.category] ?? Radio
  const accent = CATEGORY_ACCENT[channel.category] ?? 'text-gray-600 bg-gray-50'

  return (
    <div>
      <Link
        href="/channels"
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-5 transition-colors"
      >
        ← Channels
      </Link>

      {/* ── Header ─────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`flex items-center justify-center w-12 h-12 rounded-xl shrink-0 ${accent}`}>
              <Icon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 leading-tight">
                {channel.name}
              </h1>
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                <Users className="w-3 h-3" />
                <span>{(memberCount ?? 0).toLocaleString()} tuned in</span>
                <span className="text-gray-300 dark:text-gray-700">·</span>
                <CircleIcon className="w-3 h-3" />
                <span>{circles.length} {circles.length === 1 ? 'Circle' : 'Circles'} practicing</span>
              </div>
            </div>
          </div>

          {myProfileId && (
            isTunedIn ? (
              <form action={tuneOutChannel.bind(null, channel.id)}>
                <button
                  type="submit"
                  className="shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-red-600 hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                >
                  Tuned in
                </button>
              </form>
            ) : (
              <form action={tuneInChannel.bind(null, channel.id)}>
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                >
                  Tune in
                </button>
              </form>
            )
          )}
        </div>

        {channel.description && (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed max-w-2xl">
            {channel.description}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ── Main: forum feed ─────────────────────── */}
        <div className="lg:col-span-2 border-t border-gray-100 dark:border-gray-800 pt-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Forum</h2>
          {isTunedIn && (
            <Composer
              scopeId={channel.id}
              visibility="public"
              placeholder={`Post to ${channel.name}…`}
            />
          )}
          <FeedList
            circleIds={[channel.id]}
            showPublicLayer={false}
            myProfileId={myProfileId}
            emptyMessage={
              isTunedIn
                ? 'No posts yet — start the conversation.'
                : 'Tune in to see and join the conversation.'
            }
          />
        </div>

        {/* ── Sidebar: Circles practicing this Channel ─ */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Circles practicing {channel.name}
          </h2>
          {circles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/50 p-6 text-center">
              <CircleIcon className="w-6 h-6 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No Circles practicing this Channel yet.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {circles.map((c) => (
                <Link
                  key={c.id}
                  href={`/circles/${c.slug}`}
                  className="block rounded-xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 px-3 py-2.5 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-900 dark:text-gray-50 truncate">
                      {c.name}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                      c.type === 'in-person'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                    }`}>
                      {c.type === 'in-person' ? 'In-person' : 'Online'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                    {(c.city || c.neighborhood) && (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="w-2.5 h-2.5" />
                        {c.neighborhood || c.city}
                      </span>
                    )}
                    <span>
                      {c.member_count}/{c.member_cap} members
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
