import { describe, expect, it } from 'vitest'
import { PLACEHOLDER_METER_LIMITS } from '@/lib/pricing/meter-limits'
import { NETWORK_PLAN } from '@/lib/pricing/plans'
import { allowanceAt, siblingAllowanceText } from '@/lib/pricing/feature-meters'
import { baseSeatAllowance } from '@/lib/spaces/seats'
import { catalogConfigByKey, defaultCatalogConfig } from '@/lib/pricing/catalog-config'
import { PRICING_DEFAULTS } from '@/lib/pricing/settings'
import { spaceFeatureGrid, type FeatureGrid, type PricingGridInput } from '@/lib/pricing/pricing-grid'
import { SPACES } from '@/components/frequency/site/pages/features/features-data'

// LIVE-992: Network's ten central admins are seats, the pricing table shows a sibling plan's own
// number, and /features carries the Collective and Network group.

const input: PricingGridInput = { values: PRICING_DEFAULTS, catalog: catalogConfigByKey(defaultCatalogConfig()) }

function cell(grid: FeatureGrid, rowKey: string, column: string): string {
  const row = grid.groups.flatMap((g) => g.rows).find((r) => r.key === rowKey)!
  const i = grid.columns.findIndex((c) => c.id === column)
  return row.cells[i]!.text
}

describe('Network seats are its central admins (LIVE-992)', () => {
  it('the space_team row names Network at the central-admin count', () => {
    expect(PLACEHOLDER_METER_LIMITS.space_team!.network).toBe(NETWORK_PLAN.centralAdmins)
    expect(allowanceAt('space_team', 'network')).toBe(NETWORK_PLAN.centralAdmins)
    expect(baseSeatAllowance('network')).toBe(NETWORK_PLAN.centralAdmins)
  })

  it('a sibling plan the row names has its own line; one it does not falls back', () => {
    expect(siblingAllowanceText('space_team', 'network')).toContain('10 seats')
    expect(siblingAllowanceText('space_qr', 'nonprofit')).not.toBeNull()
    expect(siblingAllowanceText('space_team', 'nonprofit')).toBeNull()
    expect(siblingAllowanceText('space_team', 'collective')).toBeNull()
  })

  it('the pricing table shows the sibling number, not the rung it ranks with', () => {
    const grid = spaceFeatureGrid(input)
    if (grid.columns.some((c) => c.id === 'network')) {
      expect(cell(grid, 'space_team', 'network')).toContain('10 seats')
    }
    expect(cell(grid, 'space_team', 'collective')).toContain('3 seats')
    // Non Profit's 5 managed QR codes (owner ruling 2026-10-06) beside Business's 3.
    expect(cell(grid, 'space_qr', 'nonprofit')).not.toBe(cell(grid, 'space_qr', 'business'))
  })
})

describe('/features carries the Collective and Network group (LIVE-992)', () => {
  it('one job names both plans by their chips, with a feature each', () => {
    const job = SPACES.jobs.find((j) => j.title === 'Grow together')!
    expect(job).toBeTruthy()
    expect(job.features.map((f) => [f.id, f.tier])).toEqual([
      ['f-partners', 'Collective'],
      ['f-chapters', 'Network'],
    ])
  })
})
