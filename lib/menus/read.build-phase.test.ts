import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// LIVE-325 / ADR-1327. The menu reader's fallback is right at request time and wrong at build time:
// a menu read that fails during `next build` used to print "falling back to defaults" and carry on,
// which bakes the default header and footer into the STATIC marketing pages. Every build inside the
// 2026-09-14 Supabase window did exactly that; only the discover pages, which throw, failed those
// builds. This pins the two branches on the helper both catch sites route through, and pins by
// source shape that they DO route through it, so a future catch site cannot quietly go back to a
// bare console.error.

vi.mock('./db', () => ({ menuDb: () => { throw new Error('no database in this test') } }))

const ORIGINAL_PHASE = process.env.NEXT_PHASE
function restorePhase() {
  if (ORIGINAL_PHASE === undefined) delete process.env.NEXT_PHASE
  else process.env.NEXT_PHASE = ORIGINAL_PHASE
}

describe('menuReadFailed: the fallback is a request-time promise, never a build-time one', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
    restorePhase()
  })

  it('at request time it logs and returns, so the caller falls back to the defaults', async () => {
    delete process.env.NEXT_PHASE
    const { menuReadFailed } = await import('./read')
    expect(() => menuReadFailed('getMenu header', new Error('boom'))).not.toThrow()
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain('falling back to defaults')
  })

  it('during next build it THROWS a MenuBuildReadError naming the read, and logs nothing', async () => {
    process.env.NEXT_PHASE = 'phase-production-build'
    const { menuReadFailed, MenuBuildReadError } = await import('./read')
    expect(() => menuReadFailed('getMenu header', new Error('upstream connect error'))).toThrow(
      MenuBuildReadError,
    )
    expect(() => menuReadFailed('getMenuSettings', new Error('x'))).toThrow(/getMenuSettings/)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('the dev server and the development phase keep the fallback', async () => {
    process.env.NEXT_PHASE = 'phase-development-server'
    const { menuReadFailed } = await import('./read')
    expect(() => menuReadFailed('getMenu header', new Error('boom'))).not.toThrow()
  })
})

describe('every catch site in the reader routes through menuReadFailed (source shape)', () => {
  const src = readFileSync(join(process.cwd(), 'lib/menus/read.ts'), 'utf8')
  it('no catch site logs "falling back to defaults" on its own', () => {
    // The helper's own line is a template literal; a catch site that went back to logging for
    // itself would be the single-quoted form the two sites used before LIVE-325.
    const bare = src.match(/console\.error\('\[menus\] \w+ failed, falling back to defaults/g) ?? []
    expect(bare, 'a catch site bypasses menuReadFailed').toEqual([])
  })
  it('the two known fallbacks call it', () => {
    expect(src).toMatch(/menuReadFailed\(`getMenu \$\{surfaceKey\}`, err\)/)
    expect(src).toMatch(/menuReadFailed\('getMenuSettings', err\)/)
  })
})
