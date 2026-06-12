import Link from 'next/link'
import { GraduationCap, Plus, CalendarClock } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  getWalkthroughs,
  TRIGGER_CHIP,
  CADENCE_LABELS,
  type Walkthrough,
} from '@/lib/walkthroughs'
import { EditNextStepsButton, NewWalkthroughButton, WalkthroughRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

// The Walkthroughs management suite (Phase A) — every operator-authored instructional
// sequence in one place, grouped Live → Scheduled → Drafts. Best-effort read: if the
// `walkthrough` table isn't migrated yet, the list is empty and shows the teaching empty
// state; the editor still works on an in-memory draft until the first save.

function scheduleLabel(w: Walkthrough): string | null {
  if (!w.startsAt && !w.endsAt) return null
  const fmt = (s: string | null) =>
    s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null
  const from = fmt(w.startsAt)
  const to = fmt(w.endsAt)
  if (from && to) return `${from} – ${to}`
  if (from) return `From ${from}`
  return `Until ${to}`
}

/** Bucket: a scheduled (windowed) walkthrough sorts above an evergreen one. */
function isScheduled(w: Walkthrough): boolean {
  return !!(w.startsAt || w.endsAt)
}

function WalkthroughCard({ w }: { w: Walkthrough }) {
  const schedule = scheduleLabel(w)
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/walkthroughs/${w.id}`} className="truncate text-base font-bold text-text hover:text-primary-strong">
            {w.name || 'Untitled walkthrough'}
          </Link>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${
              w.active ? 'bg-success-bg text-success' : 'bg-surface-elevated text-subtle'
            }`}
          >
            {w.active ? 'On' : 'Off'}
          </span>
        </div>
        {w.description && <p className="mt-1 line-clamp-1 text-sm text-muted">{w.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
          <span className="inline-flex items-center rounded-full bg-broadcast-bg px-2 py-0.5 font-medium text-broadcast-strong">
            {TRIGGER_CHIP[w.trigger]}
          </span>
          {w.audience && <span>Target: {w.audience}</span>}
          <span>{w.steps.length} {w.steps.length === 1 ? 'slide' : 'slides'}</span>
          <span>{CADENCE_LABELS[w.cadence]}</span>
          {schedule && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3 w-3" aria-hidden /> {schedule}
            </span>
          )}
        </div>
      </div>
      <WalkthroughRowActions id={w.id} active={w.active} />
    </div>
  )
}

function Group({ title, hint, items }: { title: string; hint: string; items: Walkthrough[] }) {
  if (items.length === 0) return null
  return (
    <AdminSection title={title} description={hint}>
      <div className="space-y-3">
        {items.map((w) => (
          <WalkthroughCard key={w.id} w={w} />
        ))}
      </div>
    </AdminSection>
  )
}

export default async function WalkthroughsPage() {
  await requireAdmin('host', { staff: 'marketing' })
  const all = await getWalkthroughs()

  const live = all.filter((w) => w.active)
  const scheduled = all.filter((w) => !w.active && isScheduled(w))
  const drafts = all.filter((w) => !w.active && !isScheduled(w))
  const totalSlides = all.reduce((n, w) => n + w.steps.length, 0)

  return (
    <AdminTemplate
      title="Walkthroughs"
      icon={GraduationCap}
      eyebrow="Acquisition · Onboarding"
      description="Instructional walkthroughs you write once and target by role and trigger. A welcome for a new member, a primer the day someone becomes a Host, a heads-up when a season launches."
      width="wide"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <EditNextStepsButton />
          <NewWalkthroughButton />
        </div>
      }
    >
      {all.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No walkthroughs yet"
          description="A walkthrough is a short set of slides that meets a member at the right moment: their first day, the day they become a Host, a season launch. Write one, target it by trigger, then switch it on."
          action={<NewWalkthroughButton />}
        />
      ) : (
        <>
          <AdminSection>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard bordered label="Live now" value={live.length} icon={GraduationCap} />
              <StatCard bordered label="Scheduled" value={scheduled.length} icon={CalendarClock} />
              <StatCard bordered label="Total slides" value={totalSlides} icon={Plus} />
            </div>
          </AdminSection>
          <Group title="Live" hint="Switched on and reaching members." items={live} />
          <Group title="Scheduled" hint="Off, but built for a dated window (a season or project)." items={scheduled} />
          <Group title="Drafts" hint="In progress. Switch one on when it's ready." items={drafts} />
        </>
      )}
    </AdminTemplate>
  )
}
