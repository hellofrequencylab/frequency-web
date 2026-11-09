import { describe, expect, it } from 'vitest'
import { ROLES, ROLE_IDS } from '@/lib/blocks/roles/roles'
import { MATRIX_DEVICES, MATRIX_THEMES, matrixCells, matrixCoverage, matrixKey, matrixWidth, matrixWidths } from './matrix'

describe('the full builder matrix (BLD-901)', () => {
  it('declares every role variant in every theme on every surface and device', () => {
    const variants = ROLE_IDS.reduce((n, id) => n + Object.keys(ROLES[id].variants).length, 0)
    expect(matrixCells()).toHaveLength(variants * MATRIX_THEMES.length * 4 * MATRIX_DEVICES.length)
    expect(MATRIX_DEVICES).toEqual([1600, 1200, 900, 390])
    expect(MATRIX_THEMES).toContain('NewWorldDay')
  })

  it('draws a section at the narrower of the device and the surface', () => {
    expect(matrixWidth('site', 1600)).toBe(1280)
    expect(matrixWidth('profile', 1200)).toBe(840)
    expect(matrixWidth('email', 900)).toBe(600)
    for (const surface of ['site', 'profile', 'spotlight', 'email'] as const) expect(matrixWidth(surface, 390)).toBe(390)
    expect(matrixWidths()).toEqual([1280, 1200, 900, 840, 600, 390])
  })

  it('counts coverage over declared cells: a drawn cell needs a measurement, a door or hidden one is covered by its surface', () => {
    const none = matrixCoverage(new Set())
    expect(none.ratio).toBeLessThan(1)
    expect(none.covered).toBeGreaterThan(0)
    const all = new Set(matrixCells().filter((c) => c.shows === 'draw' || c.shows === 'freeze').map((c) => matrixKey(c.role, c.variant, c.theme, c.width)))
    const full = matrixCoverage(all)
    expect(full.ratio).toBe(1)
    expect(full.missing).toEqual([])
  })

  it('every role declares what each surface does with it', () => {
    for (const id of ROLE_IDS) expect(Object.keys(ROLES[id].surfaces).sort()).toEqual(['email', 'profile', 'site', 'spotlight'])
  })
})
