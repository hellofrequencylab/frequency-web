import Link from 'next/link'
import { CalendarRange, ArrowRight } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { isJanitor } from '@/lib/core/roles'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EntityHeader } from '@/components/admin/entity-header'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip } from '@/components/admin/status'
import { EmptyState } from '@/components/ui/empty-state'
import { createAdminClient } from '@/lib/supabase/admin'
import { SeasonCreateLauncher } from './season-create'
import { StateBadge } from './state-badge'

// The season calendar. Entity-Detail template (ADR-233 §3.4): the active (Live) season
// as the entity context band, all seasons in a DataTable below — each row drilling into
// the Season Composer (/[id]). The lifecycle vocabulary (Draft / Scheduled / Live /
// Ended) is the shared StateBadge. Creating the NEXT season is janitor-only; ending the
// running one (the destructive reset) stays in /admin/gamification.

function fmtDate(d: string | null): string {
  if (!d) return 'Open'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type SeasonRow = {
  id: string
  season_number: number
  name: string
  theme: string | null
  starts_at: string | null
  ends_at: string | null
  status: string
}

export default async function AdminSeasonsPage() {
  const { webRole } = await requireAdmin('host', { staff: 'community' })
  const janitor = isJanitor(webRole)

  const ub = createAdminClient()
  const { data: seasons } = await ub
    .from('seasons')
    .select('id, season_number, name, theme, starts_at, ends_at, status')
    .order('season_number', { ascending: false })

  const rows = (seasons ?? []) as SeasonRow[]
  const activeSeason = rows.find((s) => s.status === 'active') ?? null
  // The most recent season (highest number) is the clone source — rows are sorted desc.
  const lastSeason = rows[0] ?? null
  const nextNumber = (lastSeason?.season_number ?? 0) + 1

  const columns: ColumnDef<SeasonRow>[] = [
    {
      key: 'season_number',
      header: 'No.',
      type: 'number',
      width: '56px',
      render: (s) => <span className="font-bold tabular-nums text-subtle">{s.season_number}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      render: (s) => <span className="font-medium text-text">{s.name}</span>,
    },
    {
      key: 'theme',
      header: 'Theme',
      render: (s) => <span className="text-muted">{s.theme ?? 'No theme set'}</span>,
    },
    {
      key: 'window',
      header: 'Window',
      render: (s) => (
        <span className="tabular-nums text-muted">
          {fmtDate(s.starts_at)} to {fmtDate(s.ends_at)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => <StateBadge status={s.status} />,
    },
  ]

  return (
    <AdminTemplate
      title="Seasons"
      eyebrow="Content"
      description="The 13-week cycles the Quest runs on. Each season carries a theme, a Quest of official Journeys, and its challenges. Open a season to edit its name, theme, and window, move it through its lifecycle, and compose its Journeys."
      width="default"
      actions={
        janitor ? (
          <SeasonCreateLauncher
            nextNumber={nextNumber}
            cloneSourceId={lastSeason?.id}
            cloneSourceName={lastSeason?.name}
          />
        ) : undefined
      }
    >
      {/* Entity context band: the live season as the entity */}
      <EntityHeader
        eyebrow="Season"
        title={activeSeason ? activeSeason.name : 'No season running'}
        badges={
          activeSeason ? <StateBadge status={activeSeason.status} /> : <StatusChip tone="neutral">None live</StatusChip>
        }
        facts={
          activeSeason
            ? [
                { label: 'Season number', value: `${activeSeason.season_number}` },
                { label: 'Theme', value: activeSeason.theme ?? 'No theme set' },
                {
                  label: 'Window',
                  value: `${fmtDate(activeSeason.starts_at)} to ${fmtDate(activeSeason.ends_at)}`,
                },
                {
                  label: 'Status',
                  value: <StateBadge status={activeSeason.status} size="sm" />,
                },
              ]
            : []
        }
        actions={
          activeSeason ? (
            <Link
              href={`/admin/content/seasons/${activeSeason.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              Edit &amp; compose <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : undefined
        }
      />

      <AdminSection title={`All seasons (${rows.length})`}>
        <DataTable
          caption="All seasons"
          columns={columns}
          rows={rows}
          getRowId={(s) => s.id}
          rowHref={(s) => `/admin/content/seasons/${s.id}`}
          empty={
            <EmptyState
              variant="first-use"
              icon={CalendarRange}
              title="No seasons yet"
              description="The first season appears once it is seeded or created."
            />
          }
        />
      </AdminSection>

      <AdminSection>
        <p className="text-xs text-muted">
          Ending the active season (trophies, Zap to Gem conversion, resets) lives in{' '}
          <Link
            href="/admin/gamification"
            className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline"
          >
            Gamification <ArrowRight className="h-3 w-3" />
          </Link>
          .
        </p>
      </AdminSection>
    </AdminTemplate>
  )
}
