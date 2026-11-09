// THE FULL MATRIX (BLD-901; spec docs/EDITOR-NEXT.md#bld-901). Every role x variant x theme x surface x device the
// builder declares, as plain data, so the render pass (scripts/render/builder-matrix.render.tsx and
// builder-matrix-shots.mjs) can say how much of it was actually drawn and measured. Coverage is measured cells over
// declared cells; the pass fails below 1.00. A cell is MEASURED when its section was drawn at the width the surface
// gives that device (surfaceFrame) and checked for horizontal overflow, zero height and contrast.
//
// A role that a surface does not draw as a block (a door on the Spotlight, or hidden in email) has no block to
// measure there: those cells are declared as `door` or `hidden` and count as covered by the surface's own model
// (BLD-215, lib/builder/surface-view.ts), never silently dropped.
//
// PURE: no React, no IO.

import { ROLES, ROLE_IDS, type RoleId } from '@/lib/blocks/roles/roles'
import { BUILDER_SURFACES, surfaceFrame, type BuilderSurface } from '@/lib/builder/surfaces'

/** The four sizes the spec names. */
export const MATRIX_DEVICES = [1600, 1200, 900, 390] as const
/** The themes the roles are drawn in: every theme with a token sheet, and New World in both of its modes. */
export const MATRIX_THEMES = ['DAWN', 'Menswork', 'Midnight', 'Wildheart', 'Network', 'NetworkKit', 'Temple', 'TempleKit', 'Designer', 'FreeHuman', 'Services', 'NewWorld', 'NewWorldDay'] as const
type MatrixTheme = (typeof MATRIX_THEMES)[number]
type MatrixDevice = (typeof MATRIX_DEVICES)[number]

interface MatrixCell { role: RoleId; variant: string; theme: MatrixTheme; surface: BuilderSurface; device: MatrixDevice; shows: 'draw' | 'freeze' | 'door' | 'hidden'; width: number }

/** The width a section is drawn at for a surface on a device: the narrower of the device and the surface's own width. */
export function matrixWidth(surface: BuilderSurface, device: MatrixDevice): number {
  return surfaceFrame(surface, device).width
}

/** The distinct widths the render has to visit (the same frame on two devices is measured once). */
export function matrixWidths(): number[] {
  return [...new Set(BUILDER_SURFACES.flatMap((s) => MATRIX_DEVICES.map((d) => matrixWidth(s.id, d))))].sort((a, b) => b - a)
}

/** Every declared cell. */
export function matrixCells(): MatrixCell[] {
  const cells: MatrixCell[] = []
  for (const role of ROLE_IDS) for (const variant of Object.keys(ROLES[role].variants)) for (const theme of MATRIX_THEMES)
    for (const surface of BUILDER_SURFACES) for (const device of MATRIX_DEVICES) {
      const declared = ROLES[role].surfaces[surface.id]
      cells.push({ role, variant, theme, surface: surface.id, device, shows: declared === 'hide' ? 'hidden' : declared, width: matrixWidth(surface.id, device) })
    }
  return cells
}

/** The key one measurement is filed under. */
export const matrixKey = (role: string, variant: string, theme: string, width: number) => `${role}:${variant}:${theme}:${width}`

/** Coverage over the declared cells: a drawn cell needs its measurement; a door or hidden one is covered by its model. */
export function matrixCoverage(measured: ReadonlySet<string>): { declared: number; covered: number; ratio: number; missing: string[] } {
  const cells = matrixCells()
  const missing: string[] = []
  let covered = 0
  for (const c of cells) {
    if (c.shows === 'door' || c.shows === 'hidden' || measured.has(matrixKey(c.role, c.variant, c.theme, c.width))) covered++
    else if (missing.length < 20) missing.push(matrixKey(c.role, c.variant, c.theme, c.width))
  }
  return { declared: cells.length, covered, ratio: cells.length ? covered / cells.length : 1, missing }
}
