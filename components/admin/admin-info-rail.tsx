import Link from 'next/link'
import { Users, Zap, CalendarDays, ShieldAlert, LifeBuoy, HelpCircle, Lightbulb, ClipboardCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { OPEN_STATUSES } from '@/lib/support/types'
import { pendingReviewCount } from '@/lib/library'
import { visibleLinks } from '@/app/(main)/admin/sections'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'

// The admin RIGHT info column (ADR-228 + ADR-233 §7). A slim live-signal rail framing
// every admin page: the glance numbers (LIVE), the ranked "what needs me now" spine
// (NEEDS ATTENTION — the engagement principle: surface actionable items, route each to
// its next action, role-gated so an operator only sees what they can act on and never a
// noisy firehose), and who just arrived. Server component (admin client, head-counts —
// cheap on every admin render); the deep optics live on the dashboards.

const DAY = 24 * 60 * 60 * 1000

// The attention catalog — each actionable queue, its surface, glyph, and priority weight.
// `count` is filled from the live signal; items are gated by the viewer's access to the
// surface and shown only when they have something waiting.
interface AttentionDef {
  id: string
  label: string
  href: string
  Icon: LucideIcon
  weight: number
}

const ATTENTION: AttentionDef[] = [
  { id: 'reports', label: 'Open reports', href: '/admin/moderation', Icon: ShieldAlert, weight: 5 },
  { id: 'tickets', label: 'Support tickets', href: '/admin/support', Icon: LifeBuoy, weight: 4 },
  { id: 'reviews', label: 'Pending reviews', href: '/admin/content', Icon: ClipboardCheck, weight: 3 },
  { id: 'helpgaps', label: 'Help gaps', href: '/admin/help-gaps', Icon: HelpCircle, weight: 2 },
  { id: 'studio', label: 'Studio prompts', href: '/admin/studio', Icon: Lightbulb, weight: 1 },
]

async function railData() {
  const admin = createAdminClient()
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * DAY).toISOString()
  const monthAgo = new Date(now.getTime() - 30 * DAY).toISOString()
  const weekAhead = new Date(now.getTime() + 7 * DAY).toISOString()

  const [members, wamRows, events, reports, tickets, helpgaps, studio, reviews, newest] =
    await Promise.all([
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
      admin.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', OPEN_STATUSES),
      admin.from('ai_help_queries').select('id', { count: 'exact', head: true }).eq('deflected', true).gte('created_at', monthAgo),
      admin.from('agent_actions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      pendingReviewCount(),
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
    counts: {
      reports: reports.count ?? 0,
      tickets: tickets.count ?? 0,
      helpgaps: helpgaps.count ?? 0,
      studio: studio.count ?? 0,
      reviews: reviews ?? 0,
    } as Record<string, number>,
    newest: (newest.data ?? []) as unknown as Array<{
      id: string
      display_name: string
      handle: string
      avatar_url: string | null
      created_at: string
    }>,
  }
}

function InfoStat({ label, value, href, icon: Icon }: { label: string; value: string | number; href: string; icon: LucideIcon }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-elevated"
    >
      <span className="flex items-center gap-2.5 text-sm font-medium text-muted">
        <Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
        {label}
      </span>
      <span className="text-base font-bold tabular-nums text-text">{value}</span>
    </Link>
  )
}

// A needs-attention row: glyph + queue + a tonal count chip; risk-tinted when it's
// piling up (the high-priority queues, or any queue past a threshold).
function AttentionRow({ item }: { item: AttentionDef & { count: number; risk: boolean } }) {
  return (
    <Link
      href={item.href}
      className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-elevated"
    >
      <span className="flex items-center gap-2.5 text-sm font-medium text-muted">
        <item.Icon className={`h-4 w-4 shrink-0 ${item.risk ? 'text-danger' : 'text-warning'}`} aria-hidden />
        {item.label}
      </span>
      <span
        className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
          item.risk ? 'bg-danger-bg text-danger' : 'bg-warning-bg text-warning'
        }`}
      >
        {item.count}
      </span>
    </Link>
  )
}

export async function AdminInfoRail({
  role,
  webRole = 'none',
  staffRole = null,
}: {
  role: CommunityRole
  webRole?: WebRole
  staffRole?: StaffRole | null
}) {
  const d = await railData()

  // Gate the attention catalog to the surfaces this operator can actually open, then
  // keep the ones with something waiting, ranked (risk first, then priority weight).
  const reachable = new Set(visibleLinks(role, webRole, staffRole).map((l) => l.href))
  const candidates = ATTENTION.filter((a) => reachable.has(a.href))
  const attention = candidates
    .map((a) => {
      const count = d.counts[a.id] ?? 0
      const risk = count >= 5 || ((a.id === 'reports' || a.id === 'tickets') && count > 0)
      return { ...a, count, risk }
    })
    .filter((a) => a.count > 0)
    .sort((x, y) => Number(y.risk) - Number(x.risk) || y.weight - x.weight)

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-surface p-2">
        <p className="px-3 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Live</p>
        <InfoStat label="Members" value={d.members.toLocaleString()} href="/admin/members" icon={Users} />
        <InfoStat label="Active this week" value={d.wam} href="/admin/engagement" icon={Zap} />
        <InfoStat label="Upcoming events" value={d.eventsAhead} href="/admin/events" icon={CalendarDays} />
      </section>

      {candidates.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-2">
          <p className="px-3 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Needs attention
          </p>
          {attention.length > 0 ? (
            attention.map((a) => <AttentionRow key={a.id} item={a} />)
          ) : (
            <p className="px-3 pb-2 pt-0.5 text-sm text-success">All clear. Nothing waiting.</p>
          )}
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between px-1 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Just joined</p>
          <Link href="/admin/members" className="text-xs font-semibold text-primary-strong hover:underline">
            Roster →
          </Link>
        </div>
        <div className="space-y-0.5">
          {d.newest.map((m) => (
            <Link
              key={m.id}
              href={`/people/${m.handle}`}
              className="flex items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-surface-elevated"
            >
              <span className="min-w-0 truncate text-sm font-medium text-text">{m.display_name}</span>
              <span className="shrink-0 pl-2 text-xs text-subtle">
                {new Date(m.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </Link>
          ))}
          {d.newest.length === 0 && <p className="px-3 py-2 text-sm text-subtle">No members yet.</p>}
        </div>
      </section>
    </div>
  )
}
