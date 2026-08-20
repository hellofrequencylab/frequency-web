import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── Wiring guard: the Create studio can FORGET a trained brand style (LIVE-062) ──────────
// createBrandStyle and listBrandStyles were wired long before deleteBrandStyle had any caller,
// so trained styles could only ever accumulate. These are source-level assertions in the house
// archetype (components/events/series-wiring.test.ts): unwiring the forget button is SILENT —
// the picker still works, styles just pile up again — so no runtime test would fail.

const studio = readFileSync('app/(main)/admin/library/create-studio.tsx', 'utf8')
const actions = readFileSync('app/(main)/admin/library/recraft-actions.ts', 'utf8')

describe('the Create studio forgets a trained brand style', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(studio.length).toBeGreaterThan(4000)
  })

  it('imports deleteBrandStyle from the recraft actions and calls it', () => {
    expect(studio).toMatch(/import \{[^}]*deleteBrandStyle[^}]*\} from '\.\/recraft-actions'/)
    expect(studio).toContain('await deleteBrandStyle(')
  })

  it('asks twice before forgetting (the drawer idiom in loom-grid)', () => {
    // First press arms, second press fires — the same Delete / Confirm delete shape the asset
    // drawer uses, so a stray click never drops a style.
    expect(studio).toContain('confirmForget ? forgetStyle() : setConfirmForget(true)')
    expect(studio).toContain('Confirm forget')
  })

  it('drops the forgotten style from the picker without a refetch', () => {
    expect(studio).toContain('prev.filter((s) => s.id !== id)')
    expect(studio).toContain("setStyleId('')")
  })

  it('the action stays janitor-gated and only removes our pointer', () => {
    const body = actions.slice(actions.indexOf('export async function deleteBrandStyle'))
    expect(body).toContain("requireAdmin('janitor')")
    expect(body).toContain('deleteStyle(spaceId, styleId)')
  })
})
