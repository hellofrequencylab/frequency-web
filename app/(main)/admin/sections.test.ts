import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The Studio catalog stores icon NAMES (framework-free strings); app/(main)/admin/sections.ts
// resolves them back to lucide components through an ICONS map. `icon(name)` falls back to
// LayoutDashboard for anything unregistered, which is the right runtime behaviour — a menu row
// must never render icon-less — and exactly why a missing entry is invisible: the row draws a
// plausible dashboard glyph and nobody files a bug.
//
// Measured 2026-08-10: two names had been missing for some time (MessageSquare, LayoutGrid), so
// those rows had been drawing the fallback rather than their own mark. This test is the totality
// assertion that keeps the two files in step, mirroring the FACE_VAR map-totality test in
// lib/theme/space-themes.test.ts.

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')
const SECTIONS = read('./sections.ts')
const STUDIO = read('../../../lib/nav/studio.ts')

/** The registered names, read out of the `ICONS` map body. */
function registeredIcons(): string[] {
  const body = /const ICONS: Record<string, LucideIcon> = \{([\s\S]*?)\n\}/.exec(SECTIONS)?.[1] ?? ''
  return body
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Every distinct `icon: 'Name'` the Studio catalog declares. */
function usedIcons(): string[] {
  return [...new Set([...STUDIO.matchAll(/icon: '([A-Za-z0-9]+)'/g)].map((m) => m[1]))]
}

describe('studio icon map totality', () => {
  it('parses both sides (a test that reads nothing asserts nothing)', () => {
    expect(registeredIcons().length).toBeGreaterThan(30)
    expect(usedIcons().length).toBeGreaterThan(30)
  })

  it('every icon name the Studio catalog uses is registered in the ICONS map', () => {
    const registered = new Set(registeredIcons())
    const missing = usedIcons().filter((n) => !registered.has(n))
    expect(
      missing,
      `These Studio rows resolve to the LayoutDashboard fallback instead of their own glyph.\n` +
        `Add each to the import AND the ICONS map in app/(main)/admin/sections.ts: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('every registered name is actually imported, so the map cannot reference a free variable', () => {
    const importBlock = /import \{([\s\S]*?)\} from 'lucide-react'/.exec(SECTIONS)?.[1] ?? ''
    expect(importBlock).not.toBe('')
    const imported = new Set(
      importBlock.split(/[,\n]/).map((s) => s.trim().replace(/^type\s+/, '')).filter(Boolean),
    )
    const unimported = registeredIcons().filter((n) => !imported.has(n))
    expect(unimported, `registered but not imported: ${unimported.join(', ')}`).toEqual([])
  })
})
