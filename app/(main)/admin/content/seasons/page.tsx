import Link from 'next/link'
import { CalendarRange, ArrowRight } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { isJanitor } from '@/lib/core/roles'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { EmptyState } from '@/components/ui/empty-state'
import { createAdminClient } from '@/lib/supabase/admin'
import { SeasonCreateForm } from './season-create'

// The season calendar. Creating the NEXT season is janitor-only; ending the
// current one (the destructive reset) stays in /admin/gamification.

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-success/10 text-success',
  upcoming: 'bg-primary/10 text-primary',
  ended: 'bg-border/60 text-muted',
}

function fmtDate(d: string | null): string {
  if (!d) return 'Open'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function AdminSeasonsPage() {
  const { webRole } = await requireAdmin('host', { staff: 'community' })
  const janitor = isJanitor(webRole)

  const admin = createAdminClient()
  const { data: seasons } = await admin
    .from('seasons')
    .select('id, season_number, name, theme, starts_at, ends_at, status')
    .order('season_number', { ascending: false })

  const rows = seasons ?? []
  const nextNumber = (rows[0]?.season_number ?? 0) + 1

  return (
    <AdminPage
      title="Seasons"
      eyebrow="Engage"
      description="The 13-week cycles the Quest runs on. Each season carries a theme, a Quest of official Journeys, and its challenges."
      width="default"
    >
      {janitor && (
        <AdminSection
          title={`Create season ${nextNumber}`}
          description="Opens as upcoming. The season reset in Gamification is what closes the active season."
        >
          <SeasonCreateForm nextNumber={nextNumber} />
        </AdminSection>
      )}

      <AdminSection title={`All seasons (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState icon={CalendarRange} title="No seasons yet" description="The first season appears once it is seeded or created." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="hidden border-b border-border px-4 py-2 sm:grid sm:grid-cols-[56px_1fr_1fr_220px_100px] sm:items-center sm:gap-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">No.</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Name</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Theme</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Window</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Status</span>
            </div>
            <div className="divide-y divide-border/50">
              {rows.map((s) => (
                <div
                  key={s.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[56px_1fr_1fr_220px_100px] sm:gap-4"
                >
                  <span className="hidden text-sm font-bold tabular-nums text-subtle sm:block">{s.season_number}</span>
                  <span className="truncate text-sm font-medium text-text">{s.name}</span>
                  <span className="hidden truncate text-xs text-muted sm:block">{s.theme ?? 'No theme set'}</span>
                  <span className="hidden text-xs tabular-nums text-muted sm:block">
                    {fmtDate(s.starts_at)} to {fmtDate(s.ends_at)}
                  </span>
                  <span
                    className={`inline-flex w-fit items-center rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[s.status] ?? STATUS_STYLES.ended}`}
                  >
                    {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </AdminSection>

      <AdminSection>
        <p className="text-xs text-muted">
          Ending the active season (trophies, Zap to Gem conversion, resets) lives in{' '}
          <Link href="/admin/gamification" className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline">
            Gamification <ArrowRight className="h-3 w-3" />
          </Link>
          .
        </p>
      </AdminSection>
    </AdminPage>
  )
}
