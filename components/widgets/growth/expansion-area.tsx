import { TrendingUp } from 'lucide-react'
import { DashArea, TileGrid, Tile, MiniStat, MiniGrid } from '@/components/admin/dash'
import { getDensitySignal, type DensitySignal } from '@/lib/analytics/density'

// Growth layout module (LP7): "Expansion" — where local member density is crossing the threshold that
// justifies opening the next Lab. Self-fetching RSC; the page owns the marketing-staff gate, so this
// never re-gates. Fail-safe: any read error degrades to a calm zero signal. Semantic tokens + DashArea
// grammar only.

const EMPTY: DensitySignal = {
  places: [],
  ready: [],
  totals: { cities: 0, circles: 0, members: 0, residents: 0, listings: 0 },
}

async function load(): Promise<DensitySignal> {
  try {
    return await getDensitySignal()
  } catch {
    return EMPTY
  }
}

export async function GrowthExpansion() {
  const density = await load()
  const topSignal = density.ready[0] ?? density.places[0]

  return (
    <DashArea
      icon={TrendingUp}
      label="Expansion"
      blurb="Where local member density is crossing the threshold that justifies opening the next Lab."
      href="/admin/insights?tab=expansion"
      hrefLabel="Open Expansion"
    >
      <TileGrid>
        <Tile label="Density signal">
          <MiniGrid>
            <MiniStat value={density.totals.cities.toLocaleString()} label="Cities tracked" />
            <MiniStat
              value={density.ready.length.toLocaleString()}
              label="Labs ready"
              tone={density.ready.length > 0 ? 'good' : 'neutral'}
            />
            <MiniStat value={density.totals.listings.toLocaleString()} label="Listings" />
            <MiniStat value={density.totals.residents.toLocaleString()} label="Residents" />
          </MiniGrid>
        </Tile>
        {topSignal && (
          <Tile label="Strongest signal">
            <p className="leading-none">
              <span className="text-2xl font-bold tabular-nums text-text">{Math.round(topSignal.score)}</span>
              <span className="text-sm text-subtle">/100</span>
            </p>
            <p className="mt-2 text-sm font-semibold text-text">{topSignal.city}</p>
            <p className="mt-0.5 text-xs uppercase tracking-wide text-subtle">{topSignal.stage} stage</p>
          </Tile>
        )}
      </TileGrid>
    </DashArea>
  )
}
