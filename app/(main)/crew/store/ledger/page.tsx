import { redirect } from 'next/navigation'
import {
  Zap, Gem, Flame, Trophy, CalendarCheck, PenTool, Mic, LogIn, Receipt, type LucideIcon,
} from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getEarningLog, ledgerLabel, type LedgerEntry, type LedgerStreakType } from '@/lib/economy/ledger'
import { RANK_LABELS, type SeasonRank } from '@/lib/season-ranks'
import { RankBadge } from '@/components/ui/rank-badge'
import { amplitudeLevel, formatAmplitude } from '@/lib/amplitude'
import { dayInZone, HOME_TZ } from '@/lib/time/zone'
import { DashboardTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata = { title: 'How you earned · The Vault' }

const STREAK_META: Record<LedgerStreakType, { label: string; icon: LucideIcon }> = {
  attendance: { label: 'Attendance', icon: CalendarCheck },
  posting: { label: 'Posting', icon: PenTool },
  hosting: { label: 'Hosting', icon: Mic },
  login: { label: 'Activity', icon: LogIn },
}
const STREAK_ORDER: LedgerStreakType[] = ['attendance', 'posting', 'hosting', 'login']

// Day bucket for grouping the timeline — "Today" / "Yesterday" / "Mon, Jun 2".
//
// The bucket is the COMMUNITY's calendar day (HOME_TZ), never the server's. This page renders on
// the server, and on Vercel that clock is UTC — so every Zap banked after ~5pm Pacific grouped
// under "Yesterday", and the weekday labels below it shifted by a day.
function dayLabel(iso: string): string {
  const day = dayInZone(new Date(iso), HOME_TZ)
  const today = dayInZone(new Date(), HOME_TZ)
  // Yesterday derived from today's own day string via noon-anchored UTC arithmetic, so a DST
  // change can never make "24 hours ago" land on the wrong calendar day. Day strings are
  // YYYY-MM-DD, so `>=` is a chronological compare (a clock-skewed future row still reads Today).
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  if (day >= today) return 'Today'
  if (day === yesterday) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: HOME_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

// Same rule one level down: the row's clock has to read in the zone its day bucket was built in,
// or a 7pm Pacific earn files under "Today" and then prints "2:00 AM".
function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: HOME_TZ, hour: 'numeric', minute: '2-digit' })
}

export default async function VaultLedgerPage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const { entries, streaks, totals } = await getEarningLog(profileId)
  // The Vault headline is the season rank + Amplitude (the lifetime layer —
  // Rewards Economy v2; supersedes the lifetime-rank display).
  const rank = (totals.rank as SeasonRank | null) ?? null
  const streakBy = new Map(streaks.map((s) => [s.type, s]))

  // Group the merged history into day buckets, preserving newest-first order.
  const groups: { label: string; items: LedgerEntry[] }[] = []
  for (const e of entries) {
    const label = dayLabel(e.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(e)
    else groups.push({ label, items: [e] })
  }

  return (
    <DashboardTemplate
      eyebrow="The Vault"
      title="How you earned"
      description="Every Gem and Zap you’ve banked, and your live streaks. Online care earns Gems; showing up in the real world earns Zaps."
      back={{ href: '/crew/store', label: 'Vault Store' }}
      width="default"
      stats={
        <>
          <StatCard label="Zaps · season" value={totals.seasonZaps.toLocaleString()} icon={Zap} />
          <StatCard label="Gems" value={totals.lifetimeGems.toLocaleString()} icon={Gem} />
          <StatCard label="Streak" value={`${totals.currentStreak}w`} icon={Flame} />
          <StatCard
            label={`Amplitude · L${amplitudeLevel(totals.amplitude)}`}
            value={
              rank && rank !== 'ghost' ? (
                <span className="flex items-center gap-1.5">
                  {/* `lg` is the primitive's largest role. The hand-rolled chip declared
                      `text-body-sm`, which never painted: `.rank-badge` is unlayered CSS and
                      its 12px beats any layered `text-*` utility (see the sweep note in
                      components/ui/rank-badge.tsx). */}
                  <RankBadge rank={rank} size="lg">{RANK_LABELS[rank] ?? rank}</RankBadge>
                  <span>{formatAmplitude(totals.amplitude)}</span>
                </span>
              ) : (
                formatAmplitude(totals.amplitude)
              )
            }
            icon={Trophy}
          />
        </>
      }
    >
      {/* Streaks */}
      <section>
        <SectionHeader title="Streaks" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STREAK_ORDER.map((type) => {
            const s = streakBy.get(type)
            const { label, icon: Icon } = STREAK_META[type]
            const current = s?.current ?? 0
            const longest = s?.longest ?? 0
            return (
              <div key={type} className="rounded-2xl bg-surface-elevated/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-meta font-medium text-subtle">{label}</p>
                  <Icon className="h-4 w-4 shrink-0 text-subtle" />
                </div>
                <p className="mt-1 flex items-baseline gap-1 text-page-title font-bold tabular-nums leading-none text-text">
                  {current}
                  <span className="text-meta font-medium text-subtle">wk</span>
                </p>
                <p className="mt-2 text-meta text-subtle">Best {longest}w</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* The earning timeline */}
      <section>
        <SectionHeader title="Activity" count={entries.length} />
        {groups.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No activity yet"
            description="Log a practice, RSVP to a gathering, or share a post. Every reward you bank shows up here, with how you earned it."
          />
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <div key={g.label}>
                <p className="mb-2 text-2xs font-semibold uppercase tracking-widest text-muted">{g.label}</p>
                <ul className="overflow-hidden rounded-2xl border border-border">
                  {g.items.map((e, i) => {
                    const isZap = e.currency === 'zaps'
                    const Icon = isZap ? Zap : Gem
                    return (
                      <li
                        key={e.id}
                        className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill ${
                            isZap ? 'bg-primary-bg text-primary' : 'bg-signal-bg text-signal-strong'
                          }`}
                        >
                          <Icon className="h-4 w-4" strokeWidth={2.5} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-sm font-medium text-text">{ledgerLabel(e.actionType)}</p>
                          <p className="text-meta text-subtle">{clockLabel(e.createdAt)}</p>
                        </div>
                        <span
                          className={`shrink-0 text-body-sm font-bold tabular-nums ${
                            isZap ? 'text-primary' : 'text-signal-strong'
                          }`}
                        >
                          +{e.amount.toLocaleString()} {isZap ? 'Zaps' : 'Gems'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </DashboardTemplate>
  )
}
