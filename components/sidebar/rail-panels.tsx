import Link from 'next/link'
import { MapPin, Megaphone, Zap, Gem, Compass, ArrowRight, Users, Sparkles, CalendarDays, CircleDot } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'
import {
  SERIES_COLUMNS,
  TEASER_CARDS_PER_SERIES,
  collapseSeriesRows,
  seriesFetchLimit,
  seriesUpcomingFloor,
  type SeriesFields,
} from '@/lib/events/series'
import { circleEventVisibilities } from '@/lib/events/circle-upcoming'
import { relativeTime } from '@/lib/utils'
import { RANK_LABELS, type SeasonRank } from '@/lib/season-ranks'
import { Avatar } from '@/components/ui/avatar'
import { RankBadge } from '@/components/ui/rank-badge'
import { isOnline, ONLINE_MS, RECENT_MS } from '@/lib/presence'
import { getRecentDispatchesForProfile } from '@/lib/dispatches'
import { getOnboardingStatus, nextStepsEnabled } from '@/lib/onboarding/status'
import { WidgetCard } from '@/components/modules/module-card'
import { Counter } from '@/components/ui/counter'

// The rail's PAGE PANELS (ADR-161) — contextual stat cards keyed into the right rail
// by route (lib/layout/rail-panels.ts). Each is an independent async server component
// (its own Suspense boundary in the rail) that degrades to nothing when there's no
// data, so the rail never shows an empty shell. They were the old "widgets"; in the
// page framework they're panels — composed, not hand-rolled, sharing WidgetCard chrome.

function DateChip({ iso }: { iso: string }) {
  const d = new Date(iso)
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const day = d.getDate()
  return (
    <div className="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-success-bg text-success shrink-0">
      <span className="text-3xs font-semibold uppercase leading-none">{month}</span>
      <span className="text-body-sm font-bold leading-tight">{day}</span>
    </div>
  )
}

// ── Events ────────────────────────────────────────────────────────────────────
/** Rows the panel shows. Three, and a repeating series may only have ONE of them. */
const EVENT_PANEL_SLOTS = 3

export async function EventsPanel({ circleIds }: { circleIds: string[] }) {
  const admin = createAdminClient()
  // The floor is WALL CLOCK in the community's zone, not `new Date()`: events.starts_at stores the
  // host's wall clock kept as UTC parts, so at 5:01pm Pacific `new Date().toISOString()` is already
  // tomorrow and tonight's 7pm gathering drops out of the rail. One value feeds the query AND the
  // fold, so the two can never disagree about "upcoming".
  const floor = seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ))
  type EventRow = SeriesFields & {
    id: string
    title: string
    slug: string
    location: string | null
    starts_at: string
  }

  // This panel is the surface the duplication was REPORTED on: one cowork series held all three
  // slots. Both branches therefore over-fetch (a post-query fold spends the LIMIT on rows it then
  // discards) and collapse to one card per repeating event before slicing back to three.
  const fetchLimit = seriesFetchLimit(EVENT_PANEL_SLOTS)
  const fold = (raw: unknown) =>
    collapseSeriesRows((raw ?? []) as EventRow[], {
      upcomingFrom: floor,
      perSeries: TEASER_CARDS_PER_SERIES,
    }).slice(0, EVENT_PANEL_SLOTS)

  // The viewer's circle events first.
  //
  // GATE: this reads through the ADMIN client, which bypasses RLS, so the query IS the policy.
  // It used to filter `is_cancelled` alone, which made drafts, invite-only events and
  // staff-removed events eligible for the rail. `circleIds` is the viewer's ACTIVE memberships
  // (components/sidebar/right-sidebar.tsx), so members-only events of THOSE circles are legitimately
  // listable here — the same rule the Circle's own block applies, from the same one list.
  let events: EventRow[] = []
  if (circleIds.length > 0) {
    const { data: raw } = await admin
      .from('events')
      .select(`id, title, slug, location, starts_at, ${SERIES_COLUMNS}`)
      .in('scope_id', circleIds)
      .in('scope_type', ['circle', 'group'])
      .eq('status', 'published')
      .in('visibility', circleEventVisibilities(true))
      .eq('is_cancelled', false)
      .is('removed_at', null)
      .gte('starts_at', floor)
      .order('starts_at', { ascending: true })
      .limit(fetchLimit)
    events = fold(raw)
  }

  // Always-populated: if the viewer's circles have nothing coming up, surface what's
  // happening across the community so the events tile stays useful (engagement rail).
  //
  // This branch is UNSCOPED — every member sees the same rows — so the only safe set is what any
  // visitor could already see: public, published, live.
  const fellBack = events.length === 0
  if (fellBack) {
    const { data: anyUpcoming } = await admin
      .from('events')
      .select(`id, title, slug, location, starts_at, ${SERIES_COLUMNS}`)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .eq('is_cancelled', false)
      .is('removed_at', null)
      .gte('starts_at', floor)
      .order('starts_at', { ascending: true })
      .limit(fetchLimit)
    events = fold(anyUpcoming)
  }
  if (events.length === 0) return null

  return (
    <WidgetCard title={fellBack ? 'Happening soon' : 'Upcoming events'}>
      <div className="space-y-0.5">
        {events.map((event) => (
          <Link
            key={event.id}
            href={`/events/${event.slug}`}
            className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-surface-elevated transition-colors"
          >
            <DateChip iso={event.starts_at} />
            <div className="flex-1 min-w-0">
              <p className="text-body-sm font-semibold text-text truncate">{event.title}</p>
              <p className="text-meta text-subtle mt-0.5">
                {new Date(event.starts_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                {event.location && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5">
                    <MapPin className="w-2.5 h-2.5 inline" />
                    {event.location}
                  </span>
                )}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <div className="px-1 pt-3">
        <Link href="/events" className="text-body-sm font-semibold text-primary-strong hover:text-primary-hover transition-colors">
          See all events →
        </Link>
      </div>
    </WidgetCard>
  )
}

// ── Members (online + recent joiners) ─────────────────────────────────────────
export async function MembersPanel({ profileId, circleIds }: { profileId: string; circleIds: string[] }) {
  const admin = createAdminClient()
  type MemberRow = {
    profile_id: string
    joined_at: string | null
    profile: { id: string; display_name: string; handle: string; avatar_url: string | null; last_seen_at: string | null }
  }

  const onlineCutoff = new Date(new Date().getTime() - ONLINE_MS).toISOString()
  const [onlineRes, circleRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, display_name, handle, avatar_url, last_seen_at')
      .gte('last_seen_at', onlineCutoff)
      .neq('id', profileId)
      .order('last_seen_at', { ascending: false })
      .limit(12),
    circleIds.length > 0
      ? admin
          .from('memberships')
          .select('profile_id, joined_at, profile:profiles!profile_id(id, display_name, handle, avatar_url, last_seen_at)')
          .in('circle_id', circleIds)
          .eq('status', 'active')
          .neq('profile_id', profileId)
          .order('joined_at', { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const seen = new Set<string>()
  const dedupedAll: MemberRow[] = []
  for (const p of (onlineRes.data ?? []) as { id: string; display_name: string; handle: string; avatar_url: string | null; last_seen_at: string | null }[]) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    dedupedAll.push({ profile_id: p.id, joined_at: null, profile: p })
  }
  for (const row of (circleRes.data ?? []) as MemberRow[]) {
    if (seen.has(row.profile_id)) continue
    seen.add(row.profile_id)
    dedupedAll.push(row)
  }

  const members = dedupedAll.slice(0, 8)
  const onlineCount = dedupedAll.filter((m) => isOnline(m.profile.last_seen_at)).length
  if (members.length === 0) return null

  return (
    <WidgetCard title="Members" badge={onlineCount > 0 ? `${onlineCount} online` : undefined}>
      <div className="space-y-0.5">
        {members.map((m) => {
          const online = isOnline(m.profile.last_seen_at)
          return (
            <Link
              key={m.profile_id}
              href={`/people/${m.profile.handle}`}
              className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-surface-elevated transition-colors"
            >
              <Avatar src={m.profile.avatar_url} name={m.profile.display_name ?? ''} size="sm" online={online} />
              <span className="text-body-sm font-medium text-text truncate flex-1">{m.profile.display_name}</span>
            </Link>
          )
        })}
      </div>
      <div className="px-1 pt-3">
        <Link href="/people" className="text-body-sm font-semibold text-primary-strong hover:text-primary-hover transition-colors">
          View directory →
        </Link>
      </div>
    </WidgetCard>
  )
}

// ── Broadcasts (recent dispatches) ────────────────────────────────────────────
export async function DispatchesPanel({ profileId, circleIds }: { profileId: string; circleIds: string[] }) {
  const dispatches = await getRecentDispatchesForProfile(profileId, { circleIds, limit: 5 })
  if (dispatches.length === 0) return null

  return (
    <WidgetCard title="Dispatches">
      <div className="space-y-0.5">
        {dispatches.map((d) => (
          <Link
            key={d.id}
            href={`/broadcast/${d.id}`}
            className="flex items-start gap-3 px-1 py-2 rounded-lg hover:bg-surface-elevated transition-colors"
          >
            <div className="shrink-0 w-7 h-7 rounded-lg bg-signal-bg flex items-center justify-center mt-0.5">
              {d.linkedTaskId ? <Zap className="w-3.5 h-3.5 text-primary" /> : <Megaphone className="w-3.5 h-3.5 text-signal-strong" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body-sm font-semibold text-text line-clamp-1 leading-snug">{d.title}</p>
              <p className="text-meta text-subtle mt-0.5">{d.authorName} · {relativeTime(d.publishedAt)}</p>
            </div>
          </Link>
        ))}
      </div>
      <div className="px-1 pt-3">
        <Link href="/broadcast" className="text-body-sm font-semibold text-primary-strong hover:text-primary-hover transition-colors">
          View all Dispatches →
        </Link>
      </div>
    </WidgetCard>
  )
}

// ── Leaderboard (site-wide top earners) ───────────────────────────────────────
export async function LeaderboardPanel() {
  const admin = createAdminClient()
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url, current_season_zaps, current_season_rank')
    .eq('is_active', true)
    .eq('is_system', false)
    .order('current_season_zaps', { ascending: false })
    .limit(5)

  const top = (profiles ?? []) as {
    id: string; display_name: string; handle: string; avatar_url: string | null
    current_season_zaps: number; current_season_rank: SeasonRank
  }[]
  if (top.length === 0) return null

  const rankColors = ['text-primary', 'text-subtle', 'text-primary', 'text-subtle', 'text-subtle']

  return (
    <WidgetCard title="Leaderboard">
      <div className="space-y-0.5">
        {top.map((member, i) => (
          <Link
            key={member.id}
            href={`/people/${member.handle}`}
            className="flex items-center gap-2.5 px-1 py-2 rounded-lg hover:bg-surface-elevated transition-colors"
          >
            <span className={`text-body-sm font-bold w-4 shrink-0 tabular-nums ${rankColors[i]}`}>{i + 1}</span>
            <Avatar src={member.avatar_url} name={member.display_name ?? ''} size="sm" />
            <span className="text-body-sm flex-1 truncate text-text">{member.display_name}</span>
            <div className="flex items-center gap-1 shrink-0">
              {/* `dot={false}`: five names deep in a 288px rail, already paired with a Counter. */}
              <RankBadge rank={member.current_season_rank} size="sm" dot={false}>
                {RANK_LABELS[member.current_season_rank] ?? member.current_season_rank}
              </RankBadge>
              {/* Season Zaps through Counter: amber bolt (the Zaps tone), mono numeral. The word
                  "Zaps" is hidden on this row — the board is five names deep in a 288px rail and
                  the bolt already says which currency it is — but it still reaches assistive tech. */}
              <Counter
                value={member.current_season_zaps ?? 0}
                label="Zaps"
                glyph={Zap}
                tone="primary"
                labelHidden
              />
            </div>
          </Link>
        ))}
      </div>
      <div className="px-1 pt-3">
        <Link href="/crew/leaderboard" className="text-body-sm font-semibold text-primary-strong hover:text-primary-hover transition-colors">
          Full leaderboard →
        </Link>
      </div>
    </WidgetCard>
  )
}

// ── Control center (nudges only, top of the rail) ────────────────────────────
// The rail's contextual-nudge box. The game NUMBERS — zaps, gems, streak, rank and
// the progress-to-next-rank bar — do NOT render here: the Vault dock (bottom right,
// components/sidebar/game-stats-dock.tsx) is their one home per the three-docks law
// (DAWN 2026-08-03 — nothing is offered twice; the reference rail's Season standing
// card folded into the dock). This panel keeps only what the dock does not carry:
// the next onboarding/setup step (with its gems nudge) and the remaining setup
// steps. It renders nothing when there is no step, so the rail never shows an
// empty shell.
export async function ControlCenterPanel({ profileId }: { profileId: string }) {
  const [status, showNextSteps] = await Promise.all([
    getOnboardingStatus(profileId).catch(() => null),
    nextStepsEnabled(),
  ])
  // Next Steps prompts are shipped off (see lib/onboarding/status.ts) while the
  // Walkthroughs suite takes over; with them off this panel self-hides entirely
  // (the standing numbers live in the Vault dock now).
  const nextStep = showNextSteps ? (status?.current ?? null) : null
  if (!nextStep) return null

  return (
    <WidgetCard title="Your Quest">
      {/* Next step — the actionable nudge (the one thing the Vault dock does not carry). */}
      <Link
        href={nextStep.href}
        className="group block rounded-xl border border-broadcast/30 bg-broadcast-bg/30 p-3 transition-colors hover:bg-broadcast-bg/50"
      >
        <p className="flex items-center justify-between text-2xs font-semibold uppercase tracking-wide text-broadcast-strong">
          <span className="inline-flex items-center gap-1"><Compass className="h-3 w-3" /> Next step</span>
          {status && <span className="tabular-nums">{status.pct}%</span>}
        </p>
        <p className="mt-1 text-body-sm font-bold leading-snug text-text">{nextStep.headline}</p>
        <p className="mt-0.5 line-clamp-2 text-meta text-muted">{nextStep.blurb}</p>
        <p className="mt-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-2xs font-semibold text-signal">
            <Gem className="h-3 w-3" /> Earn Gems for finishing
          </span>
          <span className="inline-flex items-center gap-0.5 text-2xs font-semibold text-broadcast-strong">
            {nextStep.cta} <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        </p>
      </Link>

      {/* The rest of the setup steps as tight progress cards. */}
      {status && status.todo.length > 1 && (
        <div className="mt-2 space-y-1">
          {status.todo.slice(1, 4).map((s) => (
            <Link
              key={s.key}
              href={s.href}
              className="group flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 transition-colors hover:border-broadcast/50 hover:bg-broadcast-bg/20"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-broadcast-bg ring-1 ring-broadcast/40" />
              <span className="min-w-0 flex-1 truncate text-meta font-medium text-text">{s.label}</span>
              <ArrowRight className="h-3 w-3 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}

// ── Who's online (compact presence) ──────────────────────────────────────────
export async function WhoOnlinePanel({ profileId }: { profileId: string }) {
  const admin = createAdminClient()
  const cutoff = new Date(new Date().getTime() - ONLINE_MS).toISOString()
  const { data } = await admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url')
    .gte('last_seen_at', cutoff)
    .neq('id', profileId)
    .eq('is_active', true)
    .eq('is_system', false)
    .order('last_seen_at', { ascending: false })
    .limit(14)
  const people = (data ?? []) as { id: string; display_name: string; handle: string; avatar_url: string | null }[]
  if (people.length === 0) return null

  return (
    <WidgetCard title="Who’s online" badge={`${people.length}`}>
      <div className="flex flex-wrap gap-1.5 px-1 py-1">
        {people.slice(0, 10).map((p) => (
          <Link key={p.id} href={`/people/${p.handle}`} title={p.display_name} className="relative shrink-0">
            <Avatar src={p.avatar_url} name={p.display_name ?? ''} size="sm" />
            {/* The dot stays hand-rolled and aria-hidden HERE, unlike the list panels above: every
                face in this grid is online by definition, so Avatar's labelled PresenceDot would
                append "Active now" to all ten link names for information the panel title already
                gave. Decorative here, semantic there. */}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-pill bg-success ring-2 ring-surface" aria-hidden />
          </Link>
        ))}
      </div>
      <div className="px-1 pt-3">
        <Link href="/people" className="text-body-sm font-semibold text-primary-strong hover:text-primary-hover transition-colors">
          See who’s around →
        </Link>
      </div>
    </WidgetCard>
  )
}

// ── Nearby / popular circles to explore ───────────────────────────────────────
export async function CirclesPanel({ circleIds }: { circleIds: string[] }) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('circles')
    .select('id, name, slug, neighborhood, member_count')
    .eq('is_demo', false)
    .order('member_count', { ascending: false })
    .limit(12)
  const rows = ((data ?? []) as { id: string; name: string; slug: string; neighborhood: string | null; member_count: number | null }[])
    .filter((c) => !circleIds.includes(c.id))
    .slice(0, 4)
  if (rows.length === 0) return null

  return (
    <WidgetCard title="Circles to explore">
      <div className="space-y-0.5">
        {rows.map((c) => (
          <Link
            key={c.id}
            href={`/circles/${c.slug}`}
            className="flex items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-surface-elevated"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
              <Users className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-semibold text-text">{c.name}</p>
              <p className="text-meta text-subtle">
                {c.neighborhood ? `${c.neighborhood} · ` : ''}{(c.member_count ?? 0).toLocaleString()} member{c.member_count === 1 ? '' : 's'}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <div className="px-1 pt-3">
        <Link href="/circles" className="text-body-sm font-semibold text-primary-strong hover:text-primary-hover transition-colors">
          Browse all circles →
        </Link>
      </div>
    </WidgetCard>
  )
}

// ── Newest circles (just launched) ────────────────────────────────────────────
// Fresh community surface area — circles created recently that the viewer hasn't
// joined yet. Cheap query (mirrors CirclesPanel) ordered by created_at.
export async function NewCirclesPanel({ circleIds }: { circleIds: string[] }) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('circles')
    .select('id, name, slug, neighborhood, member_count, created_at')
    .eq('is_demo', false)
    .eq('status', 'active')
    .not('created_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(12)
  type CircleRow = {
    id: string; name: string; slug: string; neighborhood: string | null
    member_count: number | null; created_at: string | null
  }
  let rows = ((data ?? []) as CircleRow[]).filter((c) => !circleIds.includes(c.id)).slice(0, 4)

  // Always-populated: when there's nothing newly launched the viewer hasn't joined,
  // fall back to the most popular circles to explore so "discover" never goes blank.
  const fellBack = rows.length === 0
  if (fellBack) {
    const { data: popular } = await admin
      .from('circles')
      .select('id, name, slug, neighborhood, member_count, created_at')
      .eq('is_demo', false)
      .eq('status', 'active')
      .order('member_count', { ascending: false })
      .limit(12)
    rows = ((popular ?? []) as CircleRow[]).filter((c) => !circleIds.includes(c.id)).slice(0, 4)
  }
  if (rows.length === 0) return null

  return (
    <WidgetCard title={fellBack ? 'Circles to explore' : 'Newest circles'} badge={fellBack ? undefined : 'New'}>
      <div className="space-y-0.5">
        {rows.map((c) => (
          <Link
            key={c.id}
            href={`/circles/${c.slug}`}
            className="flex items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-surface-elevated"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-signal-bg text-signal-strong">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-semibold text-text">{c.name}</p>
              <p className="text-meta text-subtle">
                {c.neighborhood ? `${c.neighborhood} · ` : ''}
                {fellBack
                  ? `${(c.member_count ?? 0).toLocaleString()} members`
                  : c.created_at ? `started ${relativeTime(c.created_at)}` : `${(c.member_count ?? 0).toLocaleString()} members`}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <div className="px-1 pt-3">
        <Link href="/circles" className="text-body-sm font-semibold text-primary-strong hover:text-primary-hover transition-colors">
          Browse all circles →
        </Link>
      </div>
    </WidgetCard>
  )
}

// ── Active now (recent members, with last-seen) ───────────────────────────────
// A richer presence read than the avatar-only WhoOnlinePanel: names + a live
// "online"/"active <relative>" line so the rail surfaces who's actually around.
export async function ActiveNowPanel({ profileId }: { profileId: string }) {
  const admin = createAdminClient()
  const cutoff = new Date(new Date().getTime() - RECENT_MS).toISOString()
  type Person = {
    id: string; display_name: string; handle: string; avatar_url: string | null
    last_seen_at: string | null; created_at?: string | null
  }
  const { data } = await admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url, last_seen_at')
    .gte('last_seen_at', cutoff)
    .neq('id', profileId)
    .eq('is_active', true)
    .eq('is_system', false)
    .order('last_seen_at', { ascending: false })
    .limit(6)
  let people = (data ?? []) as Person[]

  // Always-populated rail (engagement best practice): when nobody is recently
  // active, fall back to the newest members so the "people" tile never vanishes —
  // it just shifts from "who's around" to "say hi to new members".
  const fellBack = people.length === 0
  if (fellBack) {
    const { data: newest } = await admin
      .from('profiles')
      .select('id, display_name, handle, avatar_url, last_seen_at, created_at')
      .neq('id', profileId)
      .eq('is_active', true)
      .eq('is_system', false)
      .order('created_at', { ascending: false })
      .limit(6)
    people = (newest ?? []) as Person[]
  }
  if (people.length === 0) return null

  const onlineCount = people.filter((p) => isOnline(p.last_seen_at)).length

  return (
    <WidgetCard title={fellBack ? 'New members' : 'Active now'} badge={!fellBack && onlineCount > 0 ? `${onlineCount} online` : undefined}>
      <div className="space-y-0.5">
        {people.map((p) => {
          const online = isOnline(p.last_seen_at)
          return (
            <Link
              key={p.id}
              href={`/people/${p.handle}`}
              className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-surface-elevated transition-colors"
            >
              <Avatar src={p.avatar_url} name={p.display_name ?? ''} size="sm" online={online} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-medium text-text">{p.display_name}</p>
                <p className="text-meta text-subtle">
                  {fellBack
                    ? p.created_at ? `joined ${relativeTime(p.created_at)}` : 'new here'
                    : online ? 'Online now' : p.last_seen_at ? `active ${relativeTime(p.last_seen_at)}` : 'recently active'}
                </p>
              </div>
            </Link>
          )
        })}
      </div>
      <div className="px-1 pt-3">
        <Link href="/people" className="text-body-sm font-semibold text-primary-strong hover:text-primary-hover transition-colors">
          {fellBack ? 'Meet the community →' : 'See who’s around →'}
        </Link>
      </div>
    </WidgetCard>
  )
}

// ── Community pulse (aggregate counts — the rail's always-on anchor) ───────────
// Three at-a-glance community totals (members · active circles · events this week), each
// linking into its surface. Aggregate counts only (no private data), so it stays relevant on
// ANY route and keeps the rail from collapsing to just the standing panels on a sparse page.
export async function PulsePanel() {
  const admin = createAdminClient()
  const nowDate = new Date()
  const now = nowDate.toISOString()
  const weekAhead = new Date(nowDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const [membersRes, circlesRes, eventsRes] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('is_system', false),
    admin.from('circles').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('is_demo', false),
    admin.from('events').select('id', { count: 'exact', head: true }).eq('is_cancelled', false).gte('starts_at', now).lte('starts_at', weekAhead),
  ])
  const members = membersRes.count ?? 0
  const circles = circlesRes.count ?? 0
  const events = eventsRes.count ?? 0
  if (!members && !circles && !events) return null

  const stats = [
    { href: '/people', Icon: Users, value: members, label: members === 1 ? 'member' : 'members' },
    { href: '/circles', Icon: CircleDot, value: circles, label: circles === 1 ? 'circle' : 'circles' },
    { href: '/events', Icon: CalendarDays, value: events, label: 'this week' },
  ]

  return (
    <WidgetCard title="Community pulse">
      <div className="grid grid-cols-3 gap-1.5">
        {stats.map(({ href, Icon, value, label }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-center transition-colors hover:bg-surface-elevated"
          >
            <Icon className="h-4 w-4 text-primary-strong" aria-hidden />
            {/* The count goes through Counter (stacked): these were tabular but not MONO, so three
                totals that update at different rates drifted against each other in a 3-up grid.
                The panel's own Icon stays above as the tile's identity; the Counter carries the
                reading and its label. */}
            <Counter value={value} label={label} layout="stacked" />
          </Link>
        ))}
      </div>
    </WidgetCard>
  )
}

// A quiet skeleton while a panel streams in (its own Suspense boundary).
export function PanelSkeleton() {
  return <div className="h-32 rounded-card border border-border bg-surface animate-pulse" />
}
