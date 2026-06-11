import Link from 'next/link'
import { Users, Zap, CalendarDays, ShieldAlert } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'

// The admin RIGHT info column (ADR-228 addendum: "Navigation left, info right").
// A slim live-signal rail framing every admin page: the four numbers an operator
// glances at constantly, who just arrived, and what needs attention. Server
// component (admin client, head-counts only — cheap on every admin render); the
// deep optics live on the Home dashboard and /admin/engagement.

const DAY = 24 * 60 * 60 * 1000

async function railData() {
  const admin = createAdminClient()
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * DAY).toISOString()
  const weekAhead = new Date(now.getTime() + 7 * DAY).toISOString()

  const [members, wamRows, events, reports, newest] = await Promise.all([
    // Members = real (non-system) person profiles — the canonical count
    // (lib/analytics/members.ts), matching the dashboard's top stat + Pulse.
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_system', false),
    admin
      .from('engagement_events')
      .select('actor_profile_id')
      .eq('event_type', 'practice.verified')
      .gte('created_at', weekAgo),
    admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .gte('starts_at', now.toISOString())
      .lte('starts_at', weekAhead),
    admin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin
      .from('profiles')
      .select('id, display_name, handle, avatar_url, created_at')
      .eq('is_system', false)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const wam = new Set(
    (wamRows.data ?? []).map((r) => r.actor_profile_id).filter((id): id is string => !!id),
  ).size

  return {
    members: members.count ?? 0,
    wam,
    eventsAhead: events.count ?? 0,
    openReports: reports.count ?? 0,
    newest: (newest.data ?? []) as unknown as Array<{
      id: string
      display_name: string
      handle: string
      avatar_url: string | null
      created_at: string
    }>,
  }
}

function InfoStat({
  label,
  value,
  href,
  icon: Icon,
  alert,
}: {
  label: string
  value: string | number
  href: string
  icon: typeof Users
  alert?: boolean
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-surface-elevated"
    >
      <span className="flex items-center gap-2 text-xs font-medium text-muted">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${alert ? 'text-danger' : 'text-subtle'}`} aria-hidden />
        {label}
      </span>
      <span className={`text-sm font-bold ${alert ? 'text-danger' : 'text-text'}`}>{value}</span>
    </Link>
  )
}

export async function AdminInfoRail() {
  const d = await railData()

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-surface p-2">
        <p className="px-3 pb-1 pt-2 text-3xs font-semibold uppercase tracking-wider text-subtle">
          Live
        </p>
        <InfoStat label="Members" value={d.members.toLocaleString()} href="/admin/members" icon={Users} />
        <InfoStat label="Active this week" value={d.wam} href="/admin/engagement" icon={Zap} />
        <InfoStat label="Upcoming events" value={d.eventsAhead} href="/admin/events" icon={CalendarDays} />
        <InfoStat
          label="Open reports"
          value={d.openReports}
          href="/admin/moderation"
          icon={ShieldAlert}
          alert={d.openReports > 0}
        />
      </section>

      <section>
        <div className="flex items-baseline justify-between px-1 pb-1.5">
          <p className="text-3xs font-semibold uppercase tracking-wider text-subtle">Just joined</p>
          <Link href="/admin/members" className="text-2xs font-semibold text-primary-strong hover:underline">
            Roster →
          </Link>
        </div>
        <div className="space-y-0.5">
          {d.newest.map((m) => (
            <Link
              key={m.id}
              href={`/people/${m.handle}`}
              className="flex items-center justify-between rounded-xl px-3 py-1.5 transition-colors hover:bg-surface-elevated"
            >
              <span className="min-w-0 truncate text-xs font-medium text-text">
                {m.display_name}
              </span>
              <span className="shrink-0 pl-2 text-2xs text-subtle">
                {new Date(m.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </Link>
          ))}
          {d.newest.length === 0 && (
            <p className="px-3 py-2 text-xs text-subtle">No members yet.</p>
          )}
        </div>
      </section>
    </div>
  )
}
