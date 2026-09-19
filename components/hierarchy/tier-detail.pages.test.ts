import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// LIVE-242 superseded HYG-046's page-twin test. The Hub and Nexus member detail pages are
// gone; those URLs 308 onto Space. Geography tables and the shared loader remain for
// staff consoles and Circle.hub_id. This file now pins the fold, not the twins.

const ROOT = process.cwd()

describe('LIVE-242 folded the Hub and Nexus member trees into Space', () => {
  it('removes the member route directories the backlog probe names', () => {
    expect(existsSync(join(ROOT, 'app/(main)/hubs'))).toBe(false)
    expect(existsSync(join(ROOT, 'app/(main)/nexuses'))).toBe(false)
  })

  it('keeps the shared loader the twins extracted into (staff + Circle geography still use it)', () => {
    expect(existsSync(join(ROOT, 'lib/hierarchy/tier-detail.ts'))).toBe(true)
    expect(existsSync(join(ROOT, 'components/hierarchy/tier-detail.tsx'))).toBe(true)
  })
})
