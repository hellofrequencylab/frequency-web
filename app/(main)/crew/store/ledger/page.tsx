import { redirect } from 'next/navigation'
import {
  Zap, Gem, Flame, Trophy, CalendarCheck, PenTool, Mic, LogIn, Receipt, type LucideIcon,
} from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getEarningLog, ledgerLabel, type LedgerEntry, type LedgerStreakType } from '@/lib/economy/ledger'
import { RANK_LABELS, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'
import { PageHeading } from '@/components/templates/page-heading'
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
function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default async function VaultLedgerPage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const { entries, streaks, totals } = await getEarningLog(profileId)
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
    <div>
      <PageHeading
        eyebrow="The Vault"
        title="How you earned"
        description="Every Gem and Zap you’ve banked, and your live streaks. Online care earns Gems; showing up in the real world earns Zaps."
        back={{ href: '/crew/store', label: 'Vault Store' }}
      />

      {/* Headline totals */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Zaps · season" value={totals.seasonZaps.toLocaleString()} icon={Zap} />
        <StatCard label="Gems · season" value={totals.seasonGems.toLocaleString()} icon={Gem} />
        <StatCard label="Streak" value={`${totals.currentStreak}w`} icon={Flame} />
        <StatCard
          label="Rank"
          value={
            rank ? (
              <span className="rank-badge text-sm leading-tight" style={seasonRankStyle(rank)}>
                {RANK_LABELS[rank] ?? rank}
              </span>
            ) : (
              '—'
            )
          }
          icon={Trophy}
        />
      </div>

      {/* Streaks */}
      <section className="mb-8">
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
                  <p className="text-xs font-medium text-subtle">{label}</p>
                  <Icon className="h-4 w-4 shrink-0 text-subtle" />
                </div>
                <p className="mt-1 flex items-baseline gap-1 text-2xl font-bold tabular-nums leading-none text-text">
                  {current}
                  <span className="text-xs font-medium text-subtle">wk</span>
                </p>
                <p className="mt-2 text-xs text-subtle">Best {longest}w</p>
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
            title="No points yet"
            description="Log a practice, RSVP to a gathering, or share a post — every reward you bank shows up here, with how you earned it."
          />
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <div key={g.label}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-subtle">{g.label}</p>
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
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                            isZap ? 'bg-primary-bg text-primary' : 'bg-signal-bg text-signal-strong'
                          }`}
                        >
                          <Icon className="h-4 w-4" strokeWidth={2.5} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text">{ledgerLabel(e.actionType)}</p>
                          <p className="text-xs text-subtle">{clockLabel(e.createdAt)}</p>
                        </div>
                        <span
                          className={`shrink-0 text-sm font-bold tabular-nums ${
                            isZap ? 'text-primary' : 'text-signal-strong'
                          }`}
                        >
                          +{e.amount.toLocaleString()} {isZap ? 'zaps' : 'gems'}
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
    </div>
  )
}
