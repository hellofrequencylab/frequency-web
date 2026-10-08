import { it, expect } from 'vitest'
import { verifySitemapEligibility } from '../../scripts/check-sitemap-eligibility.mjs'
it('actual sitemap reader agrees with page end instants and preserves series ordinal limits', async () => {
  expect(await verifySitemapEligibility()).toContain('ordinal allowances agree')
})
