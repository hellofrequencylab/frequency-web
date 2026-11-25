import Link from 'next/link'
import { AlarmClock, CalendarRange, Inbox, ListTodo, UserPlus } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { RowCard } from '@/components/cards/row-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { requireAdmin } from '@/lib/admin/guard'
import { HOME_TZ } from '@/lib/time/home-zone'
import { loadWorkRollup } from '@/lib/work/rollup'
import type { WorkTodo } from '@/lib/work/rollup-core'

// /admin/work: THE CONSOLE WORK ROLLUP (LIVE-2534, owner ruling 2026-11-24). The Frequency team
// plans inside the Frequency Space like any Space; this page rolls up what needs you across that
// Space and every Space you run: your to-dos, the ones nobody has picked up, and the live Plans.
// Each row opens the Plan in its Space's calendar, where the work actually happens. Read-only on
// purpose: one place to see it, one place (the Plan) to change it.

export const dynamic = 'force-dynamic'

const STAGE_LABEL = { pencil: 'Pencil', plan: 'Plan', production: 'Production' } as const

function dueLabel(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: HOME_TZ })
}

function TodoRows({ todos }: { todos: WorkTodo[] }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {todos.map((t) => (
        <RowCard
          key={t.id}
          href={t.href}
          title={t.title}
          context={t.planTitle ? `${t.space.name} · ${t.planTitle}` : t.space.name}
          trailing={
            t.overdue ? (
              <Badge tone="danger">Overdue</Badge>
            ) : dueLabel(t.dueAt) ? (
              <Badge>{dueLabel(t.dueAt)}</Badge>
            ) : undefined
          }
        />
      ))}
    </div>
  )
}

export default async function WorkPage() {
  const { profileId } = await requireAdmin('janitor')
  const { rollup, spaces } = await loadWorkRollup(profileId)
  const { mine, unassigned, plans, counts, datesPassed } = rollup

  return (
    <AdminTemplate
      eyebrow="Operations"
      title="Work"
      icon={ListTodo}
      width="wide"
      description={`Your to-dos and live Plans across ${spaces.length === 1 ? '1 Space' : `${spaces.length} Spaces`}, starting with Frequency's own. Open a row to work it in its Plan.`}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/inbox">
            <Inbox size={16} aria-hidden /> Inbox
          </Link>
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Yours" value={counts.mine} icon={ListTodo} bordered />
        <StatCard label="Overdue" value={counts.overdue} icon={AlarmClock} bordered />
        <StatCard label="Unclaimed" value={counts.unassigned} icon={UserPlus} bordered />
        <StatCard label="Live Plans" value={counts.plans} icon={CalendarRange} bordered />
      </div>

      <AdminSection title="Your to-dos" description="Handed to you in any Plan, overdue first.">
        {mine.length ? (
          <TodoRows todos={mine} />
        ) : (
          <EmptyState title="Nothing on your plate" description="When someone hands you a to-do in a Plan, it shows up here." />
        )}
      </AdminSection>

      <AdminSection title="Nobody has these yet" description="Open to-dos with no one on them.">
        {unassigned.length ? (
          <TodoRows todos={unassigned} />
        ) : (
          <EmptyState title="Every to-do has an owner" description="Unclaimed to-dos land here so they don't slip." />
        )}
      </AdminSection>

      <AdminSection
        title="Live Plans"
        description={`Production first, then Planning, then Pencil.${datesPassed ? ` ${datesPassed === 1 ? '1 Pencil' : `${datesPassed} Pencils`} whose dates all passed ${datesPassed === 1 ? 'is' : 'are'} left out.` : ''}`}
      >
        {plans.length ? (
          <div className="stack" style={{ gap: 8 }}>
            {plans.map((p) => (
              <RowCard
                key={p.id}
                href={p.href}
                title={p.title}
                badge={<Badge tone={p.stage === 'production' ? 'success' : p.stage === 'plan' ? 'primary' : 'neutral'}>{STAGE_LABEL[p.stage]}</Badge>}
                context={p.space.name}
                trailing={p.openTodos ? <Badge>{p.openTodos === 1 ? '1 open' : `${p.openTodos} open`}</Badge> : undefined}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No live Plans" description="Start one from a Space's calendar and it shows up here." />
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
