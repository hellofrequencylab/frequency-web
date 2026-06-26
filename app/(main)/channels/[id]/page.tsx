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
  Hash,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { TuneInButton, TunedInButton } from '../channel-toggle'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { canCreate } from '@/lib/core/load-capabilities'
import { DetailTemplate } from '@/components/templates/detail-template'
import { ChannelCover } from '@/components/channels/channel-cover'
import { ModuleCard } from '@/components/modules/module-card'
import { EmptyState } from '@/components/ui/empty-state'
import type { CircleBase } from '@/lib/types/circle'

type TopicalChannel = {
  id: string
  name: string
  slug: string
  category: string
  description: string | null
  cover_image: string | null
  is_active: boolean
}

type CircleRow = CircleBase & {
  slug: string
  type: 'in-person' | 'online'
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
  let canStartCircle = false

  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      myProfileId = profile.id
      // Real Crew (or steward/staff) may start a circle here; others get the popup.
      canStartCircle = await canCreate('circle.create')
      const { data: membership } = await admin
        .from('topical_channel_memberships')
        .select('id')
        .eq('topical_channel_id', channel.id)
        .eq('profile_id', myProfileId)
        .maybeSingle()
      isTunedIn = !!membership
    }
  }

  // The channel's open room (Phase B) — one per channel, read-open; tuned-in members post.
  const { data: channelRoom } = await admin
    .from('rooms')
    .select('id')
    .eq('visibility', 'channel')
    .eq('scope_id', channel.id)
    .maybeSingle()
  const channelRoomId = (channelRoom as { id: string } | null)?.id ?? null

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
        className="inline-flex items-center gap-1 text-xs text-subtle hover:text-muted mb-3 transition-colors"
      >
        ← Channels
      </Link>

      {/* Header band — opens on the channel's cover image when set, else a tasteful
          gradient (channels aren't inline-editable, so this is display-only). */}
      <ChannelCover imageUrl={channel.cover_image} name={channel.name} />

      {/* Unified Detail header (REDESIGN-INAPP Phase 1) — the category icon rides
          in the title node; description + counts as subtitle; tune-in / start a
          circle as the actions. */}
      <DetailTemplate
        title={
          <span className="inline-flex items-center gap-3">
            <span className={`flex h-9 w-9 items-center justify-center rounded-2xl shrink-0 ${accent}`}>
              <Icon className="h-5 w-5" />
            </span>
            {channel.name}
          </span>
        }
        subtitle={
          <>
            <p className="max-w-2xl leading-relaxed">{description}</p>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <Users className="w-3 h-3" />
              <span>{(memberCount ?? 0).toLocaleString()} tuned in</span>
              <span className="text-subtle/60">·</span>
              <CircleIcon className="w-3 h-3" />
              <span>{circles.length} {circles.length === 1 ? 'Circle' : 'Circles'} practicing</span>
            </div>
          </>
        }
        actions={
          myProfileId ? (
            <>
              {channelRoomId && (
                <Link
                  href={`/messages/r/${channelRoomId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
                >
                  <Hash className="h-4 w-4" /> Open room
                </Link>
              )}
              <NewCircleCompose
                topicalChannelId={channel.id}
                topicalChannelName={channel.name}
                buttonLabel="Start a Circle"
                canCreate={canStartCircle}
              />
              {isTunedIn
                ? <TunedInButton channelId={channel.id} channelName={channel.name} size="md" />
                : <TuneInButton channelId={channel.id} slug={channel.slug} size="md" />
              }
            </>
          ) : undefined
        }
      >
        {/* SINGLE main column — the page now rides the GLOBAL community rail, so the
            channel's content (forum feed, then the Circles practicing it) stacks
            here instead of a second in-body rail. */}
        <div className="space-y-8">

          {/* ── Forum feed ───────────────────────────── */}
          <section>
            <div className="mb-4">
              <h2 className="text-sm font-bold text-text">Forum</h2>
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
                <div className="mb-4 rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-3">
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
          </section>

          {/* ── Circles practicing this Channel, stacked below the feed ─ */}
          <ModuleCard
            title={`Circles practicing ${channel.name}`}
            badge={circles.length > 0 ? String(circles.length) : undefined}
          >
            {circles.length === 0 ? (
              <EmptyState
                icon={CircleIcon}
                title="No circles yet"
                description={`Be the first to start a local crew practicing ${channel.name}.`}
                action={
                  myProfileId ? (
                    <NewCircleCompose
                      topicalChannelId={channel.id}
                      topicalChannelName={channel.name}
                      buttonLabel="Create the first Circle"
                      canCreate={canStartCircle}
                    />
                  ) : undefined
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {circles.map((c) => (
                  <Link
                    key={c.id}
                    href={`/circles/${c.slug}`}
                    className="block rounded-2xl border border-border bg-surface px-3 py-2.5 hover:border-primary-bg dark:hover:border-primary transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-text truncate">
                        {c.name}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium shrink-0 ${
                        c.type === 'in-person'
                          ? 'bg-success-bg text-success'
                          : 'bg-signal-bg text-signal-strong'
                      }`}>
                        {c.type === 'in-person' ? 'In-person' : 'Online'}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
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
          </ModuleCard>
        </div>
      </DetailTemplate>
    </div>
  )
}
