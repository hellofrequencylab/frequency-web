import { describe, it, expect } from 'vitest'
import { NICHE_DEFAULTS, isUntouchedSetup, nicheBundle, nicheStartTools } from './niche-defaults'
import { MEGA_NICHES } from '@/lib/theme/mega-theme'
import { CORE_SPACE_FUNCTION_KEYS, capabilityBundle } from '@/lib/pricing/bundles'
import { SPACE_FUNCTIONS } from './functions'

describe('niche starting setup (ADR-1882)', () => {
  it('has a row for every niche, each naming a registered bundle or none', () => {
    expect(Object.keys(NICHE_DEFAULTS).sort()).toEqual([...MEGA_NICHES].sort())
    for (const n of MEGA_NICHES) {
      const { preset } = NICHE_DEFAULTS[n]
      if (preset) expect(capabilityBundle(preset)).not.toBeNull()
    }
  })

  it('keeps the core on and never names a tier-marked tool on, so it cannot grant past a plan', () => {
    const tiered = SPACE_FUNCTIONS.filter((f) => f.entitlement !== null).map((f) => f.key)
    for (const n of MEGA_NICHES) {
      const b = nicheBundle(n)
      if (!b) continue
      for (const key of CORE_SPACE_FUNCTION_KEYS) expect(b.functions).toContain(key)
      for (const key of tiered) expect(b.functions).not.toContain(key)
    }
  })

  it('reads an unknown niche as none', () => {
    expect(nicheBundle('bogus')).toBeNull()
    expect(nicheBundle(null)).toBeNull()
    expect(nicheStartTools('networks')).toEqual([])
    expect(nicheStartTools('coaches').length).toBeGreaterThan(0)
  })

  it('treats only a Space with no function switch or role floor as untouched', () => {
    expect(isUntouchedSetup({}, {})).toBe(true)
    expect(isUntouchedSetup(null, undefined)).toBe(true)
    expect(isUntouchedSetup({ billing: { plan: 'x' }, 'crm.autonomy': 2 }, {})).toBe(true)
    expect(isUntouchedSetup({ shop: false }, {})).toBe(false)
    expect(isUntouchedSetup({}, { events: 'admin' })).toBe(false)
  })
})
