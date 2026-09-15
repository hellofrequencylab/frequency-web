import { describe, expect, it } from 'vitest'
import { authoredCount, decide, isGenerated, listPullRequestFiles } from './pr-size-gate.mjs'

const png = (i: number) => `test/e2e/__screenshots__/visual.spec.ts/surface-${i}--dawn-light-desktop.png`
const authored = (i: number) => `lib/thing-${i}.ts`

describe('the PR size gate counts authored files, not runner output (HYG-072, ADR-1338)', () => {
  it('names the generated paths and nothing else', () => {
    expect(isGenerated(png(1))).toBe(true)
    expect(isGenerated('test/e2e/template-fingerprints.json')).toBe(true)
    expect(isGenerated('test/e2e/visual.spec.ts')).toBe(false)
    expect(isGenerated('lib/billing/pricing-keys.ts')).toBe(false)
  })

  it('CONTROL, must PASS: a recapture with 20 authored files and 64 generated ones', () => {
    const files = [...Array.from({ length: 20 }, (_, i) => authored(i)), ...Array.from({ length: 63 }, (_, i) => png(i)), 'test/e2e/template-fingerprints.json']
    expect(files).toHaveLength(84)
    const count = authoredCount(files)
    expect(count).toBe(20)
    const v = decide({ authored: count, total: files.length, title: 'A real change (LIVE-230)', listed: true })
    expect(v.ok).toBe(true)
    expect(v.lines.join('\n')).toContain('64 generated baseline file(s) not counted')
  })

  it('CONTROL, must FAIL: 41 authored files with no [sweep] tag', () => {
    const files = Array.from({ length: 41 }, (_, i) => authored(i))
    const v = decide({ authored: authoredCount(files), total: 41, title: 'Too wide (LIVE-000)', listed: true })
    expect(v.ok).toBe(false)
    expect(v.lines.join('\n')).toContain('exceeds the 40-file gate')
  })

  it('41 authored files still pass under [sweep], the way the gate always allowed', () => {
    const v = decide({ authored: 41, total: 41, title: '[sweep] one mechanical edit', listed: true })
    expect(v.ok).toBe(true)
  })

  it('generated files never lift a PR over the line, however many there are', () => {
    const files = [...Array.from({ length: 40 }, (_, i) => authored(i)), ...Array.from({ length: 300 }, (_, i) => png(i))]
    const v = decide({ authored: authoredCount(files), total: files.length, title: 'Forty plus a capture', listed: true })
    expect(v.ok).toBe(true)
  })

  it('warns past the 15-file guidance and stays quiet under it', () => {
    expect(decide({ authored: 16, total: 16, title: 'x', listed: true }).lines[0]).toContain('past the 15-file guidance')
    expect(decide({ authored: 15, total: 15, title: 'x', listed: true }).lines[0]).toBe('PR size: 15 authored file(s) (0 generated baseline file(s) not counted; 15 changed in all)')
  })

  it('when the listing fails it gates on the total and SAYS so (a fail-safe that fires must be seen)', () => {
    const v = decide({ authored: 84, total: 84, title: 'x', listed: false })
    expect(v.ok).toBe(false)
    expect(v.lines[0]).toContain('could not list the PR')
  })

  it('follows pagination and stops on a short page', async () => {
    const pages = [Array.from({ length: 100 }, (_, i) => ({ filename: png(i) })), [{ filename: 'lib/a.ts' }, { filename: 'lib/b.ts' }]]
    const calls: string[] = []
    const fetchImpl = (async (url: string) => {
      calls.push(url)
      const page = Number(new URL(url).searchParams.get('page'))
      return { ok: true, status: 200, json: async () => pages[page - 1] ?? [] }
    }) as unknown as typeof fetch
    const names = await listPullRequestFiles({ repo: 'o/r', number: '1', token: 't', fetchImpl })
    expect(names).toHaveLength(102)
    expect(calls).toHaveLength(2)
    expect(authoredCount(names)).toBe(2)
  })

  it('throws on a non-2xx page rather than counting a partial list as the truth', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 403, json: async () => ({}) })) as unknown as typeof fetch
    await expect(listPullRequestFiles({ repo: 'o/r', number: '1', token: 't', fetchImpl })).rejects.toThrow('HTTP 403')
  })
})
