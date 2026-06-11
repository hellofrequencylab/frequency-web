import Link from 'next/link'
import { CalendarRange, ArrowRight } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { isJanitor } from '@/lib/core/roles'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EntityHeader } from '@/components/admin/entity-header'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { EmptyState } from '@/components/ui/empty-state'
import { createAdminClient } from '@/lib/supabase/admin'
import { SeasonCreateForm } from './season-create'
import type { SupabaseClient } from '@supabase/supabase-js'

// The season calendar. Entity-Detail template (ADR-233 §3.4): the active season as
// the entity context band, all seasons in a DataTable below. Status vocabulary via
// StatusChip (local STATUS_STYLES retired). Creating the NEXT season is janitor-only;
// ending the current one (the destructive reset) stays in /admin/gamification.

const STATUS_TONE: Record<string, { tone: StatusTone; label: string }> = {
  active:   { tone: 'success', label: 'Active' },
  upcoming: { tone: 'info',    label: 'Upcoming' },
  ended:    { tone: 'neutral', label: 'Ended' },
}

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

  const ub = createAdminClient() as unknown as SupabaseClient
  const { data: seasons } = await ub
    .from('seasons')
    .select('id, season_number, name, theme, starts_at, ends_at, status')
    .order('season_number', { ascending: false })

  const rows = (seasons ?? []) as SeasonRow[]
  const activeSeason = rows.find((s) => s.status === 'active') ?? null
  const nextNumber = (rows[0]?.season_number ?? 0) + 1

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
      render: (s) => {
        const st = STATUS_TONE[s.status] ?? STATUS_TONE.ended
        return <StatusChip tone={st.tone}>{st.label}</StatusChip>
      },
    },
  ]

  const activeStatus = activeSeason ? (STATUS_TONE[activeSeason.status] ?? STATUS_TONE.ended) : null

  return (
    <AdminTemplate
      title="Seasons"
      eyebrow="Content"
      description="The 13-week cycles the Quest runs on. Each season carries a theme, a Quest of official Journeys, and its challenges."
      width="default"
    >
      {/* Entity context band: the active season as the entity */}
      <EntityHeader
        eyebrow="Season"
        title={activeSeason ? activeSeason.name : 'No active season'}
        badges={
          activeStatus ? (
            <StatusChip tone={activeStatus.tone}>{activeStatus.label}</StatusChip>
          ) : (
            <StatusChip tone="neutral">No season running</StatusChip>
          )
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
                  value: (
                    <StatusChip tone={activeStatus!.tone} size="sm">
                      {activeStatus!.label}
                    </StatusChip>
                  ),
                },
              ]
            : []
        }
      />

      {janitor && (
        <AdminSection
          title={`Create season ${nextNumber}`}
          description="Opens as upcoming. The season reset in Gamification is what closes the active season."
        >
          <SeasonCreateForm nextNumber={nextNumber} />
        </AdminSection>
      )}

      <AdminSection title={`All seasons (${rows.length})`}>
        <DataTable
          caption="All seasons"
          columns={columns}
          rows={rows}
          getRowId={(s) => s.id}
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
