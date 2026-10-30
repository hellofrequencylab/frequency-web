import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
// @ts-expect-error plain .mjs script
import { scaffoldManifest } from './ds-intake.mjs'

// LIVE-1867: a new design system starts with a hidden manifest and every role in the coverage baseline.
describe('ds-intake --scaffold-manifest', () => {
  it('lists every role as missing and baselined, and offers nothing', () => {
    const roles = readdirSync('lib/blocks/roles').filter((f) => f.endsWith('.role.json')).map((f) => f.replace('.role.json', ''))
    const { manifest, coverage } = scaffoldManifest('newtheme', roles)
    expect(manifest.status).toBe('hidden')
    expect(Object.keys(manifest.roles).sort()).toEqual([...roles].sort())
    expect(Object.values(manifest.roles).every((r) => (r as { level: string }).level === 'missing')).toBe(true)
    expect(coverage.ids).toHaveLength(roles.length)
  })
})
