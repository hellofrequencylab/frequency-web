import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

// Exercise the ACTIVE loader: failures must be retryable, concurrent cards share reads,
// and pooled Buffer bytes must never escape through an oversized ArrayBuffer.
afterEach(() => { vi.doUnmock('node:fs/promises'); vi.resetModules() })

async function loader(failFirst = false) {
  vi.resetModules()
  let failed = false
  const read = vi.fn(async () => {
    if (failFirst && !failed) { failed = true; throw Error('transient missing face') }
    return Buffer.from([99, 10, 20, 30, 88]).subarray(1, 4)
  })
  vi.doMock('node:fs/promises', () => ({ readFile: read }))
  return { read, load: (await import('./load-stage-fonts')).loadStageFonts }
}

describe('active share-card font bytes', () => {
  it('deduplicates concurrent cards and caches only resolved, detached bytes', async () => {
    const { read, load } = await loader()
    const [first, second] = await Promise.all([load(), load()])
    expect(read).toHaveBeenCalledTimes(5)
    expect(first).toBe(second)
    for (const face of first) expect(Array.from(new Uint8Array(face.data))).toEqual([10, 20, 30])
    expect(await load()).toBe(first)
    expect(read).toHaveBeenCalledTimes(5)
  })

  it('retries after a transient read failure instead of poisoning future cards', async () => {
    const { read, load } = await loader(true)
    await expect(load()).rejects.toThrow('transient missing face')
    const recovered = await load()
    expect(recovered).toHaveLength(5)
    expect(read).toHaveBeenCalledTimes(10)
    expect(await load()).toBe(recovered)
  })
})

describe('share-card trace scope', () => {
  const cfg = readFileSync('next.config.ts', 'utf8')
  const block = cfg.match(/outputFileTracingIncludes:\s*\{([\s\S]*?)\n {2}\}/)?.[1] ?? ''
  it('keeps explicit font lists off the catch-all and preserves help content', () => {
    for (const key of ["'/opengraph-image'", "'/twitter-image'"]) expect(block).toContain(`${key}: OG_CARD_FONTS`)
    expect(block).toContain("'/dev/og-root-card': ROOT_CARD_FONTS")
    expect(block.match(/'\/\*\*':\s*\[([\s\S]*?)\]/)?.[1] ?? '').not.toContain('public/fonts')
    expect(cfg).not.toContain("'./public/fonts/*.ttf'")
    expect(block).toMatch(/'\/\*\*': \[[\s\S]*?'\.\/content\/help\/\*\*\/\*'/)
    const keys = [...block.matchAll(/^\s*'([^']+)':/gm)].map(m => m[1])
    expect(keys.length).toBe(new Set(keys).size)
  })
  it('does not force unused retired faces back into every card', () => {
    expect(cfg).not.toContain("'./public/fonts/Nunito-Black.ttf'")
    expect(cfg).not.toContain("'./public/fonts/LiberationSans-Bold.ttf'")
    expect(cfg).not.toContain("'./public/fonts/LiberationSans-Regular.ttf'")
  })
})
