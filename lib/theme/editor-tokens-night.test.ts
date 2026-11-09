import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// BLD-002, second half. The builder at night is the Thermal room: Commons under `.dark`. Its four editor colours
// are declared from Frequency's room tokens on the editor roots (app/themes/frequency/editor-shell.css), so the
// night set comes from the night tokens the design export declares, never from a CSS filter that inverts the day.
// This reads the export's own day and night blocks and holds both halves: every editor colour points at a room
// token that the night block re-declares, and no sheet the builder, the editor or the admin wears inverts.

const CORE = readFileSync('app/themes/frequency/core.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const SHELL = readFileSync('app/themes/frequency/editor-shell.css', 'utf8')

/** Every declaration in the blocks whose selector list contains `selector` exactly. */
function block(selector: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of CORE.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim()).includes(selector)) continue
    for (const d of m[2].split(';')) {
      const at = d.indexOf(':')
      if (at > 0 && d.slice(0, at).trim().startsWith('--')) out.set(d.slice(0, at).trim(), d.slice(at + 1).trim())
    }
  }
  return out
}

const DAY = block(':root[data-design="frequency"]')
const NIGHT = block('.dark[data-design="frequency"]')
const EDITOR = ['--editor-canvas', '--editor-thumb', '--editor-ring', '--editor-select'] as const

describe('the builder at night renders from Thermal tokens (BLD-002)', () => {
  it('every editor colour points at a room token the night block re-declares', () => {
    for (const name of EDITOR) {
      const m = new RegExp(`${name}: var\\((--fq-[a-z0-9-]+)\\)`).exec(SHELL)
      expect(m, `${name} must read a --fq- room token`).not.toBeNull()
      const token = m![1]
      expect(DAY.has(token), `${token} is declared by day`).toBe(true)
      expect(NIGHT.has(token), `${token} is re-declared at night`).toBe(true)
    }
  })

  it('the night canvas is a different colour from the day canvas, so night is real, not a copy', () => {
    const token = /--editor-canvas: var\((--fq-[a-z0-9-]+)\)/.exec(SHELL)![1]
    expect(NIGHT.get(token)).not.toBe(DAY.get(token))
  })

  it('no sheet the builder, the editor or the admin wears inverts its colours', () => {
    const sheets = [
      'app/themes/frequency/editor-shell.css', 'app/themes/frequency/kit-editor.css', 'app/themes/frequency/kit-admin.css',
      'app/themes/frequency/admin-shell.css', 'app/themes/frequency/admin-pages.css',
      'components/builder/shell/builder-shell.module.css', 'components/builder/tune/tune-rail.module.css', 'components/builder/command/command-bar.module.css',
    ]
    for (const f of sheets) expect(readFileSync(f, 'utf8'), f).not.toMatch(/invert\(/)
  })
})
