// Growth OS · Engine 8 — the Keystone density-by-city read (GE8-1,
// docs/GROWTH-OS-BUILD-PLAN.md §5 E8). The operator's read on the cold-start solver:
// where is the community dense enough to be self-sustaining, and where is it still cold
// enough to need a founder seeded? It clusters the fuzzed `resonance_density_cells` into
// city-sized buckets (the pure rollup in lib/keystone/density-rollup.ts) and ranks them.
//
// This is the density READ (GE8-1's admin half); the full Keystone admin suite (the
// hosted-Journey scheduler, threshold editor, per-city console) is GE8-5, out of this
// PR's scope. Composes the kit: AdminTemplate (Dashboard sibling), StatCard KPIs,
// AdminSection, EmptyState.
//
// Gate: a staff web_role OR the insights capability (read). Sensitive-class data (coarse
// location density), so reads are service-role behind this gate; a thin city below the
// anonymity floor renders without a precise head count.

import { Telescope, Sparkles, Globe2, MapPin, Users } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { requireAdmin } from '@/lib/admin/guard'
import { getDensityByCity } from '@/lib/keystone/store'
import type { SeedReadiness } from '@/lib/keystone/density-rollup'

export const dynamic = 'force-dynamic'

const READINESS: Record<SeedReadiness, { label: string; cls: string }> = {
  empty: { label: 'Empty', cls: 'bg-surface-elevated text-subtle' },
  seeding: { label: 'Seeding', cls: 'bg-signal-bg text-signal-strong' },
  warm: { label: 'Warm', cls: 'bg-primary-bg text-primary-strong' },
  live: { label: 'Live', cls: 'bg-success/15 text-success' },
}

export default async function KeystoneDensityPage() {
  await requireAdmin('admin', { staff: 'insights', staffLevel: 'read' })
  const { cities, summary } = await getDensityByCity()

  return (
    <AdminTemplate
      eyebrow="Keystone"
      title="Density by city"
      icon={Telescope}
      width="wide"
      description="The cold-start read. Each row is a city-sized fuzzed bucket: where the community has a real pulse, and where a corner is still cold enough to want a founder seeded. Coarse counts only, never an address."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Cities with activity" value={summary.cities} icon={Globe2} />
        <StatCard label="Live" value={summary.liveCities} icon={Sparkles} detail="self-sustaining" />
        <StatCard label="Want a founder" value={summary.seedableCities} icon={MapPin} detail="not live yet" />
        <StatCard label="Active members" value={summary.totalActiveMembers} icon={Users} />
        <StatCard label="Standing anchors" value={summary.totalAnchors} detail="circles + events" />
      </div>

      <AdminSection
        title="Cities, busiest first"
        description="Ranked by the alive-est cell, then by people. Seed a founder where a corner is empty or seeding; a live city is finding its own feet."
      >
        {cities.length === 0 ? (
          <EmptyState
            variant="first-use"
            title="No density rolled up yet."
            description="Once members set a location and start circles and events, the nightly rollup fills this. Until then there is nowhere with a pulse to read."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated/60 text-left text-xs font-medium text-muted">
                <tr>
                  <th className="px-4 py-2.5">Locality</th>
                  <th className="px-4 py-2.5">State</th>
                  <th className="px-4 py-2.5 text-right">People</th>
                  <th className="px-4 py-2.5 text-right">Circles</th>
                  <th className="px-4 py-2.5 text-right">Events</th>
                  <th className="px-4 py-2.5 text-right">Posts</th>
                  <th className="px-4 py-2.5 text-right">Density</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cities.map((c) => {
                  const r = READINESS[c.readiness]
                  return (
                    <tr key={c.key} className="text-text">
                      <td className="px-4 py-2.5">
                        <span className="font-medium tabular-nums">{c.key}</span>
                        <span className="ml-2 text-xs text-subtle">
                          {c.cells} {c.cells === 1 ? 'cell' : 'cells'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${r.cls}`}>
                          {r.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {c.belowAnonymityFloor ? <span className="text-subtle">few</span> : c.activeMembers}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{c.recentCircles}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{c.recentEvents}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{c.recentPosts}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{c.peakDensity.toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>

      <p className="text-xs text-subtle">
        Localities are fuzzed ~11km buckets of the ~1.1km geocells, coarser than any cell and never a
        raw coordinate. A bucket with only a few people shows &ldquo;few&rdquo; instead of a precise count.
      </p>
    </AdminTemplate>
  )
}
