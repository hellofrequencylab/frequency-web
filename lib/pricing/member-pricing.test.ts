import { describe, it, expect } from 'vitest'
import { buildPricingBox, tierForSpacePlan, PRICING_TIER_KEYS } from './member-pricing'
import { NETWORK_PLAN } from './plans'
import { PWYW_CONFIG_DEFAULT } from './catalog-config'
import { NETWORK_TAKE_RATE_DEFAULT } from '@/lib/billing/pricing-keys'
import { PLACEHOLDER_METER_LIMITS } from './meter-limits'

// The member pricing box's data: every figure is READ from the catalog, the rung order is the canon, and the
// facts the design handoff got wrong stay corrected (a free Space has no funnel, Crew presets are the catalog's,
// the fee is the operator's number, Non Profit Collective is its own price).

const box = buildPricingBox({
  crew: PWYW_CONFIG_DEFAULT,
  trialDays: 14,
  takeRate: NETWORK_TAKE_RATE_DEFAULT,
  now: new Date('2026-10-23T00:00:00Z'),
})
const by = (key: string) => box.tiers.find((t) => t.key === key)!

describe('buildPricingBox', () => {
  it('has the six rungs in ladder order, five features each', () => {
    expect(box.tiers.map((t) => t.key)).toEqual([...PRICING_TIER_KEYS])
    for (const t of box.tiers) expect(t.features).toHaveLength(5)
  })

  it('reads prices from the catalog: Business $49, Collective $99 under a $149 list, Network from $476', () => {
    expect(by('business').monthlyCents).toBe(4900)
    expect(by('business').yearlyCents).toBe(49000)
    expect(by('business').nonprofitMonthlyCents).toBe(3900)
    expect(by('collective').monthlyCents).toBe(9900)
    expect(by('collective').listMonthlyCents).toBe(14900)
    expect(by('collective').nonprofitMonthlyCents).toBe(11900)
    expect(by('network').monthlyCents).toBe(NETWORK_PLAN.baseCents + 3 * NETWORK_PLAN.chapterCents)
    expect(by('network').monthlyCents).toBe(47600)
    expect(by('network').nonprofitMonthlyCents).toBe(38000)
    expect(by('network').from).toBe(true)
  })

  it('gives Crew no single price and carries the catalog amounts', () => {
    expect(by('crew').pwyw).toBe(true)
    expect(by('crew').monthlyCents).toBeNull()
    expect(box.crew.presetCents).toEqual([500, 1000, 2500])
    expect(box.crew.minCents).toBe(499)
  })

  it('states allowances from the meter map, not from typed copy', () => {
    const qr = PLACEHOLDER_METER_LIMITS.space_qr!
    expect(by('business').features.join(' ')).toContain(`${qr.business} editable QR codes`)
    expect(by('collective').features.join(' ')).toContain(`${qr.collective} editable QR codes`)
  })

  it('does not promise a funnel on the free Space (the free limit is 0)', () => {
    expect(PLACEHOLDER_METER_LIMITS.space_funnels!.free).toBe(0)
    expect(by('space').features.join(' ')).not.toMatch(/funnel/i)
  })

  it('prints the operator network fee per rung and never says 0% without card processing', () => {
    const fee = box.comparison.find((r) => r.label === 'Network fee')!
    expect(fee.cells.slice(3)).toEqual(['5%', '3%', '2%'])
    for (const t of box.tiers) for (const f of t.features) if (/\b0%|no fee/i.test(f)) expect(f).toMatch(/card processing/i)
    expect(by('space').features.join(' ')).toContain('plus card processing')
  })

  it('uses no em dashes in any line', () => {
    const lines = [...box.tiers.flatMap((t) => [t.fit, ...t.features, t.note.month, t.note.year]), ...box.comparison.flatMap((r) => [r.label, ...r.cells])]
    for (const l of lines) expect(l).not.toContain('—')
  })

  it('has one comparison cell per rung in every row', () => {
    for (const row of box.comparison) expect(row.cells).toHaveLength(6)
  })

  it('maps a Space plan label to its rung', () => {
    expect(tierForSpacePlan('free')).toBe('space')
    expect(tierForSpacePlan('nonprofit')).toBe('business')
    expect(tierForSpacePlan('nonprofit_collective')).toBe('collective')
    expect(tierForSpacePlan('network')).toBe('network')
    expect(tierForSpacePlan(null)).toBe('space')
  })
})
