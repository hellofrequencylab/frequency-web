import { Radar, MapPin, Users, Building2, Sparkles } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
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
// only renders. Doubles as the grant-funder + for-profit growth story.
export const dynamic = 'force-dynamic'

const STAGE: Record<ExpansionStage, { glyph: string; label: string }> = {
  ready: { glyph: '✅', label: 'Ready' },
  growing: { glyph: '⏳', label: 'Growing' },
  seed: { glyph: '🌱', label: 'Seed' },
}

const pct = (n: number) => `${Math.round(n * 100)}%`

function StageBadge({ p }: { p: DensityPlace }) {
  const s = STAGE[p.stage]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden>{s.glyph}</span>
      {s.label}
      {p.capacityCrunch && (
        <span className="inline-flex items-center rounded-full bg-warning-bg px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-warning">
          ⚠️ full
        </span>
      )}
    </span>
  )
}

function Table({ places }: { places: DensityPlace[] }) {
  if (places.length === 0) {
    return <p className="text-sm text-muted">No located cities yet. Density appears as members and circles pick a place.</p>
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-elevated/60 text-left">
            {['City', 'Stage', 'Score', 'Circles', 'Members', 'Fill', 'Residents', 'New (30d)', 'Unmet', 'Listings'].map((h, i) => (
              <th key={h} className={`px-3 py-2 font-semibold text-subtle ${i <= 1 ? '' : 'text-right'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {places.map((p) => (
            <tr key={p.city} className="border-b border-border last:border-0">
              <td className="px-3 py-2 font-medium text-text">{p.city}</td>
              <td className="px-3 py-2 text-text"><StageBadge p={p} /></td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-text">{p.score}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">{p.circles}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">{p.circle_members}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">{p.capacity > 0 ? pct(p.saturation) : '–'}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">{p.residents}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">{p.new_residents_30d}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">{p.unmet}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">{p.listings}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function ExpansionPage() {
  await requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' })
  const signal = await getDensitySignal()
  const { totals, places, ready } = signal
  const next = places.find((p) => p.stage !== 'ready') // closest-to-ready when none are ready

  return (
    <AdminPage
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
              <div key={p.city} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-text">{p.city}</h3>
                  <span className="rounded-full bg-success-bg px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-success">✅ {p.score}</span>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {p.circle_members} members across {p.circles} circle{p.circles === 1 ? '' : 's'} at {pct(p.saturation)} full.
                  {p.unmet > 0 && ` ${p.unmet} more residents not yet in a circle.`}
                </p>
                {p.capacityCrunch && (
                  <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-warning">⚠️ Circles are full. People are being turned away.</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            No city has crossed the threshold yet.{' '}
            {next
              ? <>Closest is <span className="font-semibold text-text">{next.city}</span> (score {next.score} of {READY_SCORE}). Keep seeding circles and members there.</>
              : 'Density appears here as members and circles take root in a place.'}
          </p>
        )}
      </AdminSection>

      <AdminSection
        title="All cities by readiness"
        description="Ranked by a 0–100 readiness score. The ladder: 🌱 Seed → ⏳ Growing → ✅ Ready. ⚠️ full means existing circles are at capacity."
      >
        <Table places={places} />
      </AdminSection>

      <AdminSection title="How readiness is scored">
        <p className="text-sm text-muted">
          A deterministic blend of three grounded signals: how full existing circles are
          (45%), the local population on the platform (35%, maxing at {READY_MEMBERS} residents),
          and how fast that population is growing (20%). A place with people but no circles caps at
          ⏳ Growing. Seed a circle first, not a building. ✅ Ready (score ≥ {READY_SCORE}) means
          circles are filling <em>and</em> the population is there to fill a third space.
        </p>
      </AdminSection>
    </AdminPage>
  )
}
