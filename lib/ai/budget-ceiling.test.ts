import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GLOBAL_DAILY_CAP_USD } from './budget'

// SCAN-824: the TypeScript cap is passed to the reservation RPC, which refuses any cap above its SQL
// ceiling. Raising one without the other turns every paid AI call into an 'Invalid AI reservation'.
describe('the global AI cap fits the reservation RPC ceiling', () => {
  it('GLOBAL_DAILY_CAP_USD is at most the newest SQL ceiling', () => {
    const dir = 'supabase/migrations'
    const ceilings = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(join(dir, f), 'utf8').match(/p_global_cap > (\d+(?:\.\d+)?)/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => Number(m[1]))
    expect(ceilings.length).toBeGreaterThan(0)
    expect(GLOBAL_DAILY_CAP_USD).toBeLessThanOrEqual(ceilings[ceilings.length - 1])
  })
})
