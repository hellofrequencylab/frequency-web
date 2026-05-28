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
import { NewCircleCompose } from '@/components/compose/new-circle-compose'

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

  // Defensive: the 20240206 migration rewrites the seeded descriptions to
  // remove em dashes, but until it lands on every environment we strip
  // them at render time so the UI is consistent everywhere.
  const description = (channel.description ?? 'A global channel anyone can tune into.')
    .replace(/\s*—\s*/g, '. ')

  return (
    <div>
      <Link
        href="/channels"
        className="inline-flex items-center gap-1 text-xs text-subtle hover:text-muted mb-4 transition-colors"
      >
        ← Channels
      </Link>

      {/* ── Header. Same shape as every other page (mb-6, h1 text-2xl,
              max-w-2xl description). Description is sized to roughly two
              lines fullscreen so the header stays compact; the explainer
              copy moves below the right column. ────────────────────── */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <div className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${accent}`}>
              <Icon className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-text leading-tight">
              {channel.name}
            </h1>
          </div>
          <p className="text-sm text-muted leading-relaxed max-w-2xl">
            {description}
          </p>
          <div className="flex items-center gap-2 mt-3 text-xs text-muted">
            <Users className="w-3 h-3" />
            <span>{(memberCount ?? 0).toLocaleString()} tuned in</span>
            <span className="text-subtle/60">·</span>
            <CircleIcon className="w-3 h-3" />
            <span>{circles.length} {circles.length === 1 ? 'Circle' : 'Circles'} practicing</span>
          </div>
        </div>

        {myProfileId && (
          <div className="flex items-center gap-2 shrink-0">
            <NewCircleCompose
              topicalChannelId={channel.id}
              topicalChannelName={channel.name}
              buttonLabel="Start a Circle"
            />
            {isTunedIn
              ? <TunedInButton channelId={channel.id} channelName={channel.name} size="md" />
              : <TuneInButton channelId={channel.id} slug={channel.slug} size="md" />
            }
          </div>
        )}
      </div>

      {/* ── Body. One border-t spans the whole row so Forum and "Circles
              practicing X" hang off the same line, top-aligned. ─────── */}
      <div className="border-t border-border pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── Main: forum feed ─────────────────────── */}
          <div className="lg:col-span-2">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-text">Forum</h2>
              <p className="text-xs text-muted leading-relaxed mt-0.5">
                Open to anyone tuned in. Talk shop, share, swap notes.
              </p>
            </div>
            {isTunedIn ? (
              <Composer
                scopeId={channel.id}
                visibility="public"
                placeholder={`Post to ${channel.name}…`}
              />
            ) : (
              myProfileId && (
                <div className="mb-4 rounded-xl border border-dashed border-border bg-surface/60 px-4 py-3">
                  <p className="text-xs text-muted leading-relaxed">
                    Tune in to post and follow this forum from your feed.
                  </p>
                </div>
              )
            )}
            <FeedList
              circleIds={[channel.id]}
              showPublicLayer={false}
              myProfileId={myProfileId}
              emptyMessage={
                isTunedIn
                  ? 'No posts yet. Start the conversation.'
                  : 'No posts yet. Tune in to see and join the conversation.'
              }
            />
          </div>

          {/* ── Sidebar: Circles practicing this Channel ─ */}
          <div>
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-text">
                Circles practicing {channel.name}
              </h2>
              <p className="text-xs text-muted leading-relaxed mt-0.5">
                Local crews who meet around this practice.
              </p>
            </div>

            {circles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-6 text-center">
                <CircleIcon className="w-6 h-6 text-subtle/60 mx-auto mb-3" />
                <p className="text-sm font-medium text-text mb-1">
                  No circles yet.
                </p>
                <p className="text-xs text-muted leading-relaxed mb-4 max-w-xs mx-auto">
                  Be the first to start a local crew practicing {channel.name}.
                </p>
                {myProfileId && (
                  <div className="flex justify-center">
                    <NewCircleCompose
                      topicalChannelId={channel.id}
                      topicalChannelName={channel.name}
                      buttonLabel="Create the first Circle"
                    />
                  </div>
                )}
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
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium shrink-0 ${
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

            {/* Context note BELOW the circles list. Same spot whether or
                not there are circles, so the page rhythm stays consistent
                across all seven channels. */}
            <p className="mt-4 text-xs text-muted leading-relaxed">
              Circles are local crews of up to 50 people who meet regularly,
              in-person or online. Each declares a channel as its practice.
              You can start one from the header above. No hub or nexus
              required yet, you&apos;ll be the first host.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
