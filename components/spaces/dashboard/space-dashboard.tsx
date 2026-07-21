import { Suspense } from 'react'
import Link from 'next/link'
import {
  Activity,
  BadgeDollarSign,
  CalendarClock,
  HeartPulse,
  Inbox,
  Mail,
  MessageSquare,
  Sparkles,
  Ticket,
  UserPlus,
  Users,
} from 'lucide-react'
import { PageHeading } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Worklist } from '@/components/dashboard/worklist'
import { relativeTime } from '@/lib/utils'
import { spaceEarningsSummary } from '@/lib/commerce/orders'
import { getSpaceHealth, getWorklist } from '@/lib/dashboard/scores'
import { listActiveSpaceMemberIds } from '@/lib/spaces/resonance-roster'
import { listInboxThreads } from '@/lib/crm/inbox'
import { listContactInteractions, type ContactInteraction } from '@/lib/crm/interactions'
import { listEventsForSpace } from '@/lib/events/store'

// THE SPACE COMMAND-CENTER HOME (ADR-796). The default landing of the /manage console: at-a-glance revenue,
// members, what needs attention, the latest activity, and what's coming up — with inline links to act. Every
// read is fail-safe (zeros / empty) and bound to this space_id; the console's own manage gate authorized the
// caller before this renders. SPEED (PAGE-FRAMEWORK §5): each band is its own async section behind Suspense,
// so the slow reads stream in parallel and never block the header. COPY: plain, no em/en dashes.

function usd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100)
}

export async function SpaceDashboard({
  spaceId,
  slug,
  spaceName,
}: {
  spaceId: string
  slug: string
  spaceName: string
}) {
  return (
    <div>
      <PageHeading
        eyebrow={spaceName}
        title={
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
            Home
          </span>
        }
        description={<span className="block truncate">Your space at a glance, and what needs you today.</span>}
        adminBar={false}
      />

      <div className="space-y-8">
        <Suspense fallback={<StatRowSkeleton />}>
          <DashboardStats spaceId={spaceId} slug={slug} />
        </Suspense>

        <Suspense fallback={<BlockSkeleton />}>
          <DashboardNeedsAttention spaceId={spaceId} slug={slug} />
        </Suspense>

        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <Suspense fallback={<BlockSkeleton />}>
            <DashboardActivity spaceId={spaceId} slug={slug} />
          </Suspense>
          <Suspense fallback={<BlockSkeleton />}>
            <DashboardUpcoming spaceId={spaceId} slug={slug} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

// ── The top stat row: revenue (30d) + members + active + at risk ────────────────────────────────────
async function DashboardStats({ spaceId, slug }: { spaceId: string; slug: string }) {
  // "Members" is the TRUE active-member count (space_members active + the owner), the same source the
  // Resonance roster counts from — NOT the health RPC's scored-and-contact-reachable subset, which reads 0
  // for a space full of members who joined but were never emailed-as-contacts or scored yet. Health,
  // At risk, and active-this-week stay on the scored subset (that IS what they measure).
  const [earnings, health, memberIds] = await Promise.all([
    spaceEarningsSummary(spaceId, 30),
    getSpaceHealth(spaceId),
    listActiveSpaceMemberIds(spaceId),
  ])
  const memberCount = memberIds.length
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Revenue, last 30 days"
        value={usd(earnings.netCents)}
        icon={BadgeDollarSign}
        detail={earnings.orderCount > 0 ? `${earnings.orderCount} paid ${earnings.orderCount === 1 ? 'order' : 'orders'}` : 'No sales yet'}
        href={`/spaces/${slug}/settings/billing`}
        size="sm"
      />
      <StatCard
        label="Members"
        value={memberCount}
        icon={Users}
        detail={memberCount === 0 ? 'No members yet' : `${health.weeklyActive} active this week`}
        href={`/spaces/${slug}?panel=manage&area=resonance`}
      />
      <StatCard
        label="Space health"
        value={health.members === 0 ? 'Not scored' : Math.round(health.meanHealth)}
        icon={HeartPulse}
        detail={health.members === 0 ? 'no scored members yet' : 'mean across members'}
      />
      <StatCard
        label="At risk"
        value={health.atRisk}
        icon={Activity}
        detail="members in the red tier"
        href={`/spaces/${slug}/crm`}
      />
    </div>
  )
}

// ── Needs attention: the worklist + the unanswered-messages count ────────────────────────────────────
async function DashboardNeedsAttention({ spaceId, slug }: { spaceId: string; slug: string }) {
  const [worklist, threads] = await Promise.all([
    getWorklist({ spaceId }),
    listInboxThreads({ spaceId, limit: 50 }),
  ])
  const unanswered = threads.filter((t) => t.awaitingReply).length
  const boardHref = `/spaces/${slug}/crm`

  return (
    <section className="space-y-3">
      <SectionHeader title="Needs attention" />
      {unanswered > 0 && (
        <Link
          href={`/spaces/${slug}/crm/inbox`}
          className="flex items-center gap-3 rounded-2xl border border-warning/40 bg-warning-bg/40 px-4 py-3 text-sm font-medium text-text transition-colors hover:bg-warning-bg/60"
        >
          <Inbox className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          {unanswered} {unanswered === 1 ? 'conversation is' : 'conversations are'} waiting on your reply
        </Link>
      )}
      {worklist.rows.length > 0 ? (
        <Worklist
          rows={worklist.rows}
          laterCount={worklist.laterCount}
          title="Who needs you"
          hrefFor={(row) => `${boardHref}?contact=${row.contactId}`}
          laterHref={boardHref}
        />
      ) : (
        unanswered === 0 && (
          <EmptyState
            variant="cleared"
            icon={HeartPulse}
            title="All clear"
            description="No one is waiting and nothing is at risk right now. Nice."
          />
        )
      )}
    </section>
  )
}

// ── Recent activity: the unified touch stream, space-scoped ──────────────────────────────────────────
const CHANNEL_ICON: Record<string, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
  in_app: MessageSquare,
  event: Ticket,
  in_person: UserPlus,
  call: MessageSquare,
  note: Sparkles,
  system: Activity,
}

async function DashboardActivity({ spaceId, slug }: { spaceId: string; slug: string }) {
  const items = await listContactInteractions({ spaceId, limit: 8 })
  return (
    <section>
      <SectionHeader title="Latest activity" href={`/spaces/${slug}?panel=manage&area=resonance`} action="Open Resonance" />
      {items.length === 0 ? (
        <EmptyState
          variant="first-use"
          icon={Activity}
          title="No activity yet"
          description="Emails, messages, event check-ins, and joins show up here as they happen."
        />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
          {items.map((it) => (
            <ActivityRow key={it.id} item={it} />
          ))}
        </ul>
      )}
    </section>
  )
}

function ActivityRow({ item }: { item: ContactInteraction }) {
  const Icon = CHANNEL_ICON[item.channel] ?? Activity
  const line = item.summary?.trim() || channelFallback(item.channel)
  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text">{line}</p>
        <p className="text-2xs text-subtle">{relativeTime(item.occurredAt)}</p>
      </div>
    </li>
  )
}

function channelFallback(channel: string): string {
  switch (channel) {
    case 'email':
      return 'Email'
    case 'sms':
      return 'Text message'
    case 'in_app':
      return 'Message'
    case 'event':
      return 'Event activity'
    case 'in_person':
      return 'Checked in'
    default:
      return 'Activity'
  }
}

// ── Upcoming: the next events for the space ──────────────────────────────────────────────────────────
async function DashboardUpcoming({ spaceId, slug }: { spaceId: string; slug: string }) {
  const events = await listEventsForSpace(spaceId, { upcomingOnly: true, limit: 5 })
  return (
    <section>
      <SectionHeader title="Coming up" href={`/spaces/${slug}/settings/offerings#availability`} action="Bookings" />
      {events.length === 0 ? (
        <EmptyState
          variant="first-use"
          icon={CalendarClock}
          title="Nothing on the calendar"
          description="Upcoming events and bookings for your space show up here."
        />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/events/${e.slug}`} className="truncate text-sm font-medium text-text hover:underline">
                  {e.title || 'Event'}
                </Link>
                <p className="text-2xs text-subtle">
                  {e.is_cancelled ? 'Cancelled' : formatWhen(e.starts_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'Date to be set'
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return 'Date to be set'
  return new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// ── Skeletons (dimension-matched, no CLS) ────────────────────────────────────────────────────────────
function StatRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 rounded-2xl" />
      ))}
    </div>
  )
}

function BlockSkeleton() {
  return <Skeleton className="h-40 rounded-2xl" />
}
