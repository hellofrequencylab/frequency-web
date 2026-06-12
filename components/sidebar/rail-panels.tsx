import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Megaphone, Zap, Gem, Flame, Compass, ArrowRight, Users, Trophy, Sparkles } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInitials, relativeTime } from '@/lib/utils'
import { RANK_LABELS, seasonRankStyle, rankForZaps, SEASON_RANKS, type SeasonRank } from '@/lib/season-ranks'
import { isOnline, ONLINE_MS, RECENT_MS } from '@/lib/presence'
import { getRecentDispatchesForProfile } from '@/lib/dispatches'
import { getOnboardingStatus } from '@/lib/onboarding/status'
import { WidgetCard } from '@/components/modules/module-card'
import { StandingTiles } from '@/components/gamification/standing-tiles'

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
      <span className="text-[9px] font-semibold uppercase leading-none">{month}</span>
      <span className="text-sm font-bold leading-tight">{day}</span>
    </div>
  )
}

// ── Events ────────────────────────────────────────────────────────────────────
export async function EventsPanel({ circleIds }: { circleIds: string[] }) {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  type EventRow = { id: string; title: string; slug: string; location: string | null; starts_at: string }

  // The viewer's circle events first.
  let events: EventRow[] = []
  if (circleIds.length > 0) {
    const { data: raw } = await admin
      .from('events')
      .select('id, title, slug, location, starts_at')
      .in('scope_id', circleIds)
      .in('scope_type', ['circle', 'group'])
      .eq('is_cancelled', false)
      .gte('starts_at', now)
      .order('starts_at', { ascending: true })
      .limit(3)
    events = (raw ?? []) as EventRow[]
  }

  // Always-populated: if the viewer's circles have nothing coming up, surface what's
  // happening across the community so the events tile stays useful (engagement rail).
  const fellBack = events.length === 0
  if (fellBack) {
    const { data: anyUpcoming } = await admin
      .from('events')
      .select('id, title, slug, location, starts_at')
      .eq('is_cancelled', false)
      .gte('starts_at', now)
      .order('starts_at', { ascending: true })
      .limit(3)
    events = (anyUpcoming ?? []) as EventRow[]
  }
  if (events.length === 0) return null

  return (
    <WidgetCard tile title={fellBack ? 'Happening soon' : 'Upcoming events'}>
      <div className="space-y-0.5">
        {events.map((event) => (
          <Link
            key={event.id}
            href={`/events/${event.slug}`}
            className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-surface-elevated transition-colors"
          >
            <DateChip iso={event.starts_at} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text truncate">{event.title}</p>
              <p className="text-xs text-subtle mt-0.5">
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
        <Link href="/events" className="text-[13px] font-semibold text-primary-strong hover:text-primary-hover transition-colors">
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
    <WidgetCard tile title="Members" badge={onlineCount > 0 ? `${onlineCount} online` : undefined}>
      <div className="space-y-0.5">
        {members.map((m) => {
          const online = isOnline(m.profile.last_seen_at)
          return (
            <Link
              key={m.profile_id}
              href={`/people/${m.profile.handle}`}
              className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-surface-elevated transition-colors"
            >
              <div className="relative shrink-0">
                {m.profile.avatar_url ? (
                  <Image src={m.profile.avatar_url} alt={m.profile.display_name} width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-border-strong flex items-center justify-center text-xs font-bold text-muted dark:text-subtle select-none">
                    {getInitials(m.profile.display_name ?? '')}
                  </div>
                )}
                {online && (
                  <span aria-label="Online now" className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success ring-2 ring-surface" />
                )}
              </div>
              <span className="text-sm font-medium text-text truncate flex-1">{m.profile.display_name}</span>
            </Link>
          )
        })}
      </div>
      <div className="px-1 pt-3">
        <Link href="/people" className="text-[13px] font-semibold text-primary-strong hover:text-primary-hover transition-colors">
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
    <WidgetCard tile title="Broadcasts">
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
              <p className="text-sm font-semibold text-text line-clamp-1 leading-snug">{d.title}</p>
              <p className="text-xs text-subtle mt-0.5">{d.authorName} · {relativeTime(d.publishedAt)}</p>
            </div>
          </Link>
        ))}
      </div>
      <div className="px-1 pt-3">
        <Link href="/broadcast" className="text-[13px] font-semibold text-primary-strong hover:text-primary-hover transition-colors">
          View all broadcasts →
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
    <WidgetCard tile title="Leaderboard">
      <div className="space-y-0.5">
        {top.map((member, i) => (
          <Link
            key={member.id}
            href={`/people/${member.handle}`}
            className="flex items-center gap-2.5 px-1 py-2 rounded-lg hover:bg-surface-elevated transition-colors"
          >
            <span className={`text-sm font-bold w-4 shrink-0 tabular-nums ${rankColors[i]}`}>{i + 1}</span>
            {member.avatar_url ? (
              <Image src={member.avatar_url} alt={member.display_name} width={32} height={32} className="w-8 h-8 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-border-strong flex items-center justify-center text-xs font-bold text-muted shrink-0">
                {getInitials(member.display_name ?? '')}
              </div>
            )}
            <span className="text-sm flex-1 truncate text-text">{member.display_name}</span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="rank-badge text-[9px] font-bold leading-tight" style={seasonRankStyle(member.current_season_rank)}>
                {RANK_LABELS[member.current_season_rank] ?? member.current_season_rank}
              </span>
              <div className="flex items-center gap-0.5">
                <Zap className="w-2.5 h-2.5 text-primary" />
                <span className="text-xs font-semibold text-muted">{(member.current_season_zaps ?? 0).toLocaleString()}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <div className="px-1 pt-3">
        <Link href="/crew/leaderboard" className="text-[13px] font-semibold text-primary-strong hover:text-primary-hover transition-colors">
          Full leaderboard →
        </Link>
      </div>
    </WidgetCard>
  )
}

// ── Control center (STANDING, top of the rail) ───────────────────────────────
// Always-on "where am I in the Quest" cockpit: the next onboarding/setup step (with
// a gems nudge) when there's one, else a keep-climbing line, plus live rank progress
// and the streak. Pinned to the TOP of the rail on every page (right-sidebar.tsx).
export async function ControlCenterPanel({ profileId }: { profileId: string }) {
  const [status, prof] = await Promise.all([
    getOnboardingStatus(profileId).catch(() => null),
    createAdminClient()
      .from('profiles')
      .select('current_season_zaps, current_season_gems, current_streak')
      .eq('id', profileId)
      .maybeSingle(),
  ])
  const p = prof.data as {
    current_season_zaps?: number; current_season_gems?: number; current_streak?: number
  } | null
  const zaps = p?.current_season_zaps ?? 0
  const gems = p?.current_season_gems ?? 0
  const streak = p?.current_streak ?? 0
  const rank = rankForZaps(zaps)
  const idx = SEASON_RANKS.findIndex((r) => r.rank === rank)
  const cur = idx < 0 ? 0 : idx
  const next = SEASON_RANKS[cur + 1]
  const curMin = SEASON_RANKS[cur]?.minZaps ?? 0
  const pct = next && next.minZaps > curMin ? Math.round(((zaps - curMin) / (next.minZaps - curMin)) * 100) : 100
  const nextStep = status?.current ?? null

  return (
    <WidgetCard title="Your Quest">
      {/* Hero — the panel that has to stand out. A bordered, tinted block with a
          rank crest, live progress-to-next-rank bar, and the season scoreboard so
          the whole "where am I in the game" answer is scannable at a glance. */}
      <div className="overflow-hidden rounded-2xl border border-primary-bg bg-gradient-to-br from-primary-bg/60 via-warning-bg/40 to-surface shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-primary-bg/60 bg-primary-bg/40 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide text-primary-strong">
            <Trophy className="h-3.5 w-3.5" /> Season standing
          </span>
          <span className="rank-badge text-2xs font-bold leading-tight" style={seasonRankStyle(rank)}>
            {RANK_LABELS[rank] ?? rank}
          </span>
        </div>

        <div className="space-y-2.5 px-3 py-3">
          {/* Rank progress to next tier → leaderboard */}
          <Link
            href="/crew/leaderboard"
            className="block space-y-1.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-primary-bg/60"
          >
            <div className="flex items-center justify-between gap-2 text-2xs">
              <span className="font-semibold text-text">{next ? `Climbing to ${next.label}` : 'Top rank reached'}</span>
              <span className="tabular-nums text-subtle">
                {next ? <>{(next.minZaps - zaps).toLocaleString()} ⚡ to go</> : 'Max'}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-warning-bg/60">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </Link>

          {/* Season scoreboard — zaps · gems · streak, each linking into the Quest dashboard */}
          <StandingTiles
            variant="compact"
            zaps={zaps}
            gems={gems}
            streak={streak}
            rank={rank}
            links={{ zaps: '/crew/leaderboard', gems: '/crew/store', streak: '/crew/streaks' }}
          />

          {streak > 0 && (
            <p className="flex items-center gap-1 text-2xs font-semibold text-primary-strong">
              <Flame className="h-3 w-3" /> {streak}-day streak, keep it alive
            </p>
          )}
        </div>
      </div>

      {/* Next step — the actionable nudge sits below the standing hero. */}
      {nextStep ? (
        <Link
          href={nextStep.href}
          className="group mt-2.5 block rounded-xl border border-broadcast/30 bg-broadcast-bg/30 p-3 transition-colors hover:bg-broadcast-bg/50"
        >
          <p className="flex items-center justify-between text-2xs font-semibold uppercase tracking-wide text-broadcast-strong">
            <span className="inline-flex items-center gap-1"><Compass className="h-3 w-3" /> Next step</span>
            {status && <span className="tabular-nums">{status.pct}%</span>}
          </p>
          <p className="mt-1 text-sm font-bold leading-snug text-text">{nextStep.headline}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{nextStep.blurb}</p>
          <p className="mt-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-signal">
              <Gem className="h-3 w-3" /> Earn Gems for finishing
            </span>
            <span className="inline-flex items-center gap-0.5 text-2xs font-semibold text-broadcast-strong">
              {nextStep.cta} <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </p>
        </Link>
      ) : (
        <p className="mt-2.5 rounded-xl bg-surface-elevated/50 px-3 py-2.5 text-xs text-muted">
          You’re all set up. Keep your streak alive and climb the ranks.
        </p>
      )}

      {/* The rest of the setup steps as tight progress cards. */}
      {status && status.todo.length > 1 && (
        <div className="mt-2 space-y-1">
          {status.todo.slice(1, 4).map((s) => (
            <Link
              key={s.key}
              href={s.href}
              className="group flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 transition-colors hover:border-broadcast/50 hover:bg-broadcast-bg/20"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-broadcast-bg ring-1 ring-broadcast/40" />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-text">{s.label}</span>
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
    <WidgetCard tile title="Who’s online" badge={`${people.length}`}>
      <div className="flex flex-wrap gap-1.5 px-1 py-1">
        {people.slice(0, 10).map((p) => (
          <Link key={p.id} href={`/people/${p.handle}`} title={p.display_name} className="relative shrink-0">
            {p.avatar_url ? (
              <Image src={p.avatar_url} alt={p.display_name} width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-border-strong text-2xs font-bold text-muted">
                {getInitials(p.display_name ?? '')}
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface" aria-hidden />
          </Link>
        ))}
      </div>
      <div className="px-1 pt-3">
        <Link href="/people" className="text-[13px] font-semibold text-primary-strong hover:text-primary-hover transition-colors">
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
    <WidgetCard tile title="Circles to explore">
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
              <p className="truncate text-sm font-semibold text-text">{c.name}</p>
              <p className="text-xs text-subtle">
                {c.neighborhood ? `${c.neighborhood} · ` : ''}{(c.member_count ?? 0).toLocaleString()} member{c.member_count === 1 ? '' : 's'}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <div className="px-1 pt-3">
        <Link href="/circles" className="text-[13px] font-semibold text-primary-strong hover:text-primary-hover transition-colors">
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
    <WidgetCard tile title={fellBack ? 'Circles to explore' : 'Newest circles'} badge={fellBack ? undefined : 'New'}>
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
              <p className="truncate text-sm font-semibold text-text">{c.name}</p>
              <p className="text-xs text-subtle">
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
        <Link href="/circles" className="text-[13px] font-semibold text-primary-strong hover:text-primary-hover transition-colors">
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
    <WidgetCard tile title={fellBack ? 'New members' : 'Active now'} badge={!fellBack && onlineCount > 0 ? `${onlineCount} online` : undefined}>
      <div className="space-y-0.5">
        {people.map((p) => {
          const online = isOnline(p.last_seen_at)
          return (
            <Link
              key={p.id}
              href={`/people/${p.handle}`}
              className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-surface-elevated transition-colors"
            >
              <div className="relative shrink-0">
                {p.avatar_url ? (
                  <Image src={p.avatar_url} alt={p.display_name} width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-border-strong text-xs font-bold text-muted dark:text-subtle select-none">
                    {getInitials(p.display_name ?? '')}
                  </div>
                )}
                {online && (
                  <span aria-label="Online now" className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{p.display_name}</p>
                <p className="text-xs text-subtle">
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
        <Link href="/people" className="text-[13px] font-semibold text-primary-strong hover:text-primary-hover transition-colors">
          {fellBack ? 'Meet the community →' : 'See who’s around →'}
        </Link>
      </div>
    </WidgetCard>
  )
}

// A quiet skeleton while a panel streams in (its own Suspense boundary).
export function PanelSkeleton() {
  return <div className="h-32 rounded-xl border border-border bg-surface animate-pulse" />
}
