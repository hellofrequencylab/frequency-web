import { describe, expect, it } from 'vitest'
import { config } from '@/lib/page-editor/config'
import { rolesComponents } from '@/components/page-editor/blocks/roles'
import { ROLES, ROLE_IDS } from '@/lib/blocks/roles/roles'
import { tuneProjection } from './tune'

// Split from variants.test.ts so the BLD-203 probe does not import the whole editor block config, which costs about
// 2s (HYG-242, owner approval 2026-11-16). pnpm test runs this file on every PR.
describe('layout chips (BLD-203)', () => {
  it('the editor config serves the same role blocks variants.test.ts renders', () => {
    const roles = rolesComponents as Record<string, unknown>
    for (const r of ROLE_IDS) expect(config.components[ROLES[r].type], ROLES[r].type).toBe(roles[ROLES[r].type])
  })

  it('the Tune rail leaves a role\'s layout to the chips', () => {
    for (const r of ROLE_IDS) expect([...tuneProjection(ROLES[r].type, config).layer1, ...tuneProjection(ROLES[r].type, config).layer2].some((f) => f.key === 'variant')).toBe(false)
  })
})
