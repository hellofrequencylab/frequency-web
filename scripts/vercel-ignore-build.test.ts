import { describe, expect, it } from 'vitest'
import { decide, decideQueue, isDocOnly } from './vercel-ignore-build.mjs'

describe('vercel-ignore-build (HYG-162)', () => {
  it('skips a push that only touches documentation', () => {
    const d = decide(['docs/ledger/rows/HYG-162.json', 'docs/ledger/adr/ADR-1706.md', 'AGENTS.md'])
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

describe('vercel-ignore-build preview queue (HYG-166)', () => {
  const preview = { env: 'preview', sha: 'aaa111', branchHead: 'aaa111', prs: [{ draft: false }] }

  it('skips a preview whose branch has moved on, or is gone', () => {
    expect(decideQueue({ ...preview, branchHead: 'bbb222' }).skip).toBe(true)
    expect(decideQueue({ ...preview, branchHead: '' }).skip).toBe(true)
  })

  it('skips a preview when every open pull request on the branch is a draft', () => {
    expect(decideQueue({ ...preview, prs: [{ draft: true }] }).skip).toBe(true)
    expect(decideQueue({ ...preview, prs: [{ draft: true }, { draft: false }] }).skip).toBe(false)
  })

  it('builds only the current head of a ready pull request; a branch with no pull request skips (HYG-167)', () => {
    expect(decideQueue({ ...preview, prs: [{ draft: false }] }).skip).toBe(false)
    expect(decideQueue({ ...preview, prs: [] }).skip).toBe(true)
  })

  it('never skips production, and builds when GitHub cannot be read', () => {
    expect(decideQueue({ ...preview, env: 'production', branchHead: 'bbb222', prs: [{ draft: true }] }).skip).toBe(false)
    expect(decideQueue({ ...preview, branchHead: null, prs: null }).skip).toBe(false)
    expect(decideQueue({ ...preview, branchHead: null, prs: [{ draft: false }] }).skip).toBe(false)
  })
})
