import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Megaphone, Zap, Gem, Flame, Compass, ArrowRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInitials, relativeTime } from '@/lib/utils'
import { RANK_LABELS, seasonRankStyle, rankForZaps, SEASON_RANKS, type SeasonRank } from '@/lib/season-ranks'
import { isOnline, ONLINE_MS } from '@/lib/presence'
import { getRecentDispatchesForProfile } from '@/lib/dispatches'
import { getOnboardingStatus } from '@/lib/onboarding/status'
import { WidgetCard } from '@/components/modules/module-card'

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
  if (circleIds.length === 0) return null
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: raw } = await admin
    .from('events')
    .select('id, title, slug, location, starts_at')
    .in('scope_id', circleIds)
    .in('scope_type', ['circle', 'group'])
    .eq('is_cancelled', false)
    .gte('starts_at', now)
    .order('starts_at', { ascending: true })
    .limit(3)

  const events = (raw ?? []) as { id: string; title: string; slug: string; location: string | null; starts_at: string }[]
  if (events.length === 0) return null

  return (
    <WidgetCard title="Upcoming events">
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
    <WidgetCard title="Broadcasts">
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
    <WidgetCard title="Leaderboard">
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
    createAdminClient().from('profiles').select('current_season_zaps, current_streak').eq('id', profileId).maybeSingle(),
  ])
  const p = prof.data as { current_season_zaps?: number; current_streak?: number } | null
  const zaps = p?.current_season_zaps ?? 0
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
      {nextStep ? (
        <Link
          href={nextStep.href}
          className="group block rounded-xl border border-broadcast/30 bg-broadcast-bg/30 p-3 transition-colors hover:bg-broadcast-bg/50"
        >
          <p className="flex items-center justify-between text-2xs font-semibold uppercase tracking-wide text-broadcast-strong">
            <span className="inline-flex items-center gap-1"><Compass className="h-3 w-3" /> Next step</span>
            {status && <span className="tabular-nums">{status.pct}%</span>}
          </p>
          <p className="mt-1 text-sm font-bold leading-snug text-text">{nextStep.headline}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{nextStep.blurb}</p>
          <p className="mt-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-signal">
              <Gem className="h-3 w-3" /> Earn gems for finishing
            </span>
            <span className="inline-flex items-center gap-0.5 text-2xs font-semibold text-broadcast-strong">
              {nextStep.cta} <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </p>
        </Link>
      ) : (
        <p className="rounded-xl bg-surface-elevated/50 px-3 py-2.5 text-xs text-muted">
          You’re all set up — keep your streak alive and climb the ranks.
        </p>
      )}

      {/* Rank progress + streak */}
      <div className="mt-3 space-y-1.5 px-1">
        <div className="flex items-center justify-between gap-2 text-2xs">
          <span className="rank-badge font-bold leading-tight" style={seasonRankStyle(rank)}>
            {RANK_LABELS[rank] ?? rank}
          </span>
          <span className="text-subtle">
            {next ? <>{(next.minZaps - zaps).toLocaleString()} ⚡ to {next.label}</> : 'Max rank'}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        {streak > 0 && (
          <p className="flex items-center gap-1 text-2xs font-semibold text-primary-strong">
            <Flame className="h-3 w-3" /> {streak}-day streak — keep it going
          </p>
        )}
      </div>
    </WidgetCard>
  )
}

// A quiet skeleton while a panel streams in (its own Suspense boundary).
export function PanelSkeleton() {
  return <div className="h-32 rounded-xl border border-border bg-surface animate-pulse" />
}
