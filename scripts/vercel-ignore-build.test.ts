import { describe, expect, it } from 'vitest'
import { decide, isDocOnly } from './vercel-ignore-build.mjs'

describe('vercel-ignore-build (HYG-162)', () => {
  it('skips a push that only touches documentation', () => {
    const d = decide(['docs/ledger/rows/HYG-162.json', 'docs/ledger/adr/ADR-1704.md', 'AGENTS.md'])
    expect(d.skip).toBe(true)
  })

  it('builds when any file can change the artifact', () => {
    expect(decide(['docs/DEPLOY-SAFETY.md', 'proxy.ts']).skip).toBe(false)
    expect(decide(['public/sw.js']).skip).toBe(false)
    expect(decide(['test/e2e/smoke.test.ts']).skip).toBe(false)
    expect(decide(['.github/workflows/e2e.yml']).skip).toBe(false)
    expect(decide(['package.json']).skip).toBe(false)
  })

  it('fails safe: an unknown or empty diff builds', () => {
    expect(decide(null).skip).toBe(false)
    expect(decide([]).skip).toBe(false)
  })

  it('classifies paths, not names: a .md anywhere is documentation, a docs/ script is too', () => {
    expect(isDocOnly('content/help/thing.md')).toBe(true)
    expect(isDocOnly('docs/research/findings/2026-10-05.md')).toBe(true)
    expect(isDocOnly('lib/readme.ts')).toBe(false)
    expect(isDocOnly('docs.ts')).toBe(false)
  })
})
