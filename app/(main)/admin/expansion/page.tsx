import { Radar, MapPin, Users, Building2, Sparkles } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { StatusChip } from '@/components/admin/status'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import {
  getDensitySignal,
  READY_MEMBERS,
  READY_SCORE,
  type DensityPlace,
  type ExpansionStage,
} from '@/lib/analytics/density'

// Janitor-only: the Density / demand read-model (ADR-151, PLATFORM-VISION §6).
// The expansion decision-engine — where local community density is crossing the
// threshold that justifies a Lab (a physical third space). Deterministic + dark-
// safe: the SQL spine supplies facts, lib/analytics/density scores them, this page
// only renders. Analytics (ADR-233 §3): StatCard KPIs + a DataTable; the ad-hoc
// STAGE glyph dict retires into the tokenized StatusChip vocabulary.
export const dynamic = 'force-dynamic'

// The readiness ladder maps onto the shared StatusChip tones (the PRESENTATION
// status legend): Ready = success, Growing = warning, Seed = neutral.
const STAGE: Record<ExpansionStage, { tone: 'success' | 'warning' | 'neutral'; label: string }> = {
  ready: { tone: 'success', label: 'Ready' },
  growing: { tone: 'warning', label: 'Growing' },
  seed: { tone: 'neutral', label: 'Seed' },
}

const pct = (n: number) => `${Math.round(n * 100)}%`

function StageChips({ p }: { p: DensityPlace }) {
  const s = STAGE[p.stage]
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusChip tone={s.tone} size="sm">{s.label}</StatusChip>
      {p.capacityCrunch && <StatusChip tone="warning" size="sm">Full</StatusChip>}
    </span>
  )
}

export default async function ExpansionPage() {
  await requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' })
  const signal = await getDensitySignal()
  const { totals, places, ready } = signal
  const next = places.find((p) => p.stage !== 'ready') // closest-to-ready when none are ready

  const columns: ColumnDef<DensityPlace>[] = [
    { key: 'city', header: 'City', render: (p) => <span className="font-medium text-text">{p.city}</span> },
    { key: 'stage', header: 'Stage', render: (p) => <StageChips p={p} /> },
    { key: 'score', header: 'Score', type: 'number', render: (p) => <span className="font-semibold">{p.score}</span> },
    { key: 'circles', header: 'Circles', type: 'number', render: (p) => p.circles.toLocaleString() },
    { key: 'circle_members', header: 'Members', type: 'number', render: (p) => p.circle_members.toLocaleString() },
    { key: 'fill', header: 'Fill', type: 'number', render: (p) => (p.capacity > 0 ? pct(p.saturation) : '–') },
    { key: 'residents', header: 'Residents', type: 'number', render: (p) => p.residents.toLocaleString() },
    { key: 'new_residents_30d', header: 'New · 30d', type: 'number', render: (p) => p.new_residents_30d.toLocaleString() },
    { key: 'unmet', header: 'Unmet', type: 'number', render: (p) => p.unmet.toLocaleString() },
    { key: 'listings', header: 'Listings', type: 'number', render: (p) => p.listings.toLocaleString() },
  ]

  return (
    <AdminTemplate
      title="Expansion signal"
      icon={Radar}
      eyebrow="Insights"
      description="Where local community density is crossing the threshold that justifies a Lab (a physical third space). Deterministic signal off the place-tree; the same data is the grant-funder and growth story."
      width="wide"
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Cities with signal" value={totals.cities} icon={MapPin} />
          <StatCard label="Members in circles" value={totals.members} icon={Building2} />
          <StatCard label="Residents on platform" value={totals.residents} icon={Users} />
          <StatCard
            label="Lab-ready now"
            value={ready.length}
            icon={Sparkles}
            delta={ready.length > 0 ? { label: 'scout a space', trend: 'up' } : { label: 'none yet', trend: 'flat' }}
          />
        </div>
      </AdminSection>

      <AdminSection
        title="Lab-ready now"
        description="These cities cleared the readiness threshold. Circles are filling and the population is there. This is where to scout a third space next."
      >
        {ready.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ready.map((p) => (
              <div key={p.city} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-text">{p.city}</h3>
                  <StatusChip tone="success" size="sm">
                    <span className="tabular-nums">{p.score}</span>
                  </StatusChip>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {p.circle_members} members across {p.circles} circle{p.circles === 1 ? '' : 's'} at {pct(p.saturation)} full.
                  {p.unmet > 0 && ` ${p.unmet} more residents not yet in a circle.`}
                </p>
                {p.capacityCrunch && (
                  <p className="mt-2 text-xs font-medium text-warning">Circles are full. People are being turned away.</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            variant="first-use"
            icon={Sparkles}
            title="No city has crossed the threshold yet"
            description={
              next
                ? `Closest is ${next.city} (score ${next.score} of ${READY_SCORE}). Keep seeding circles and members there.`
                : 'Density appears here as members and circles take root in a place.'
            }
          />
        )}
      </AdminSection>

      <AdminSection
        title="All cities by readiness"
        description="Ranked by a 0 to 100 readiness score. The ladder runs Seed → Growing → Ready; a Full chip means existing circles are at capacity."
      >
        <DataTable
          rows={places}
          getRowId={(p) => p.city}
          columns={columns}
          density="compact"
          caption="Cities ranked by Lab-readiness score."
          empty={
            <EmptyState
              variant="first-use"
              icon={MapPin}
              title="No located cities yet"
              description="Density appears as members and circles pick a place."
            />
          }
        />
      </AdminSection>

      <AdminSection title="How readiness is scored">
        <p className="max-w-3xl text-sm text-muted">
          A deterministic blend of three grounded signals: how full existing circles are
          (45%), the local population on the platform (35%, maxing at {READY_MEMBERS} residents),
          and how fast that population is growing (20%). A place with people but no circles caps at
          Growing. Seed a circle first, not a building. Ready (score ≥ {READY_SCORE}) means
          circles are filling <em>and</em> the population is there to fill a third space.
        </p>
      </AdminSection>
    </AdminTemplate>
  )
}
