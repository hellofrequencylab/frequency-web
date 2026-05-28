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
import { TuneInButton, TunedInButton } from '../channel-toggle'
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
  spirituality:     'text-signal-strong bg-signal-bg/40',
  movement:         'text-signal-strong bg-success-bg/40',
  'holistic-health': 'text-danger bg-danger-bg',
  'human-relating': 'text-signal-strong bg-signal-bg',
  activism:         'text-warning dark:text-primary bg-warning-bg',
  creative:         'text-warning bg-warning-bg/40',
  'business-support': 'text-muted dark:text-subtle bg-surface',
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
  const accent = CATEGORY_ACCENT[channel.category] ?? 'text-muted bg-surface'

  return (
    <div>
      <Link
        href="/channels"
        className="inline-flex items-center gap-1 text-xs text-subtle hover:text-muted mb-5 transition-colors"
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
              <h1 className="text-2xl font-bold text-text leading-tight">
                {channel.name}
              </h1>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted">
                <Users className="w-3 h-3" />
                <span>{(memberCount ?? 0).toLocaleString()} tuned in</span>
                <span className="text-subtle/60">·</span>
                <CircleIcon className="w-3 h-3" />
                <span>{circles.length} {circles.length === 1 ? 'Circle' : 'Circles'} practicing</span>
              </div>
            </div>
          </div>

          {myProfileId && (
            isTunedIn
              ? <TunedInButton channelId={channel.id} />
              : <TuneInButton channelId={channel.id} slug={channel.slug} />
          )}
        </div>

        {channel.description && (
          <p className="mt-4 text-sm text-muted leading-relaxed max-w-2xl">
            {channel.description}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ── Main: forum feed ─────────────────────── */}
        <div className="lg:col-span-2 border-t border-border pt-6">
          <h2 className="text-sm font-semibold text-text mb-4">Forum</h2>
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
          <h2 className="text-sm font-semibold text-text mb-4">
            Circles practicing {channel.name}
          </h2>
          {circles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface/50 dark:bg-canvas/50 p-6 text-center">
              <CircleIcon className="w-6 h-6 text-subtle/60 mx-auto mb-2" />
              <p className="text-xs text-muted">
                No Circles practicing this Channel yet.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {circles.map((c) => (
                <Link
                  key={c.id}
                  href={`/circles/${c.slug}`}
                  className="block rounded-xl border border-border bg-surface px-3 py-2.5 hover:border-primary-bg dark:hover:border-primary transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-text truncate">
                      {c.name}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                      c.type === 'in-person'
                        ? 'bg-success-bg text-success'
                        : 'bg-signal-bg text-signal-strong'
                    }`}>
                      {c.type === 'in-person' ? 'In-person' : 'Online'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
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
