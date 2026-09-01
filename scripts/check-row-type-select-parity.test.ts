import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ── ONE HAND-WRITTEN ROW TYPE, SEVERAL SELECTS, AND ONE BRANCH FORGOT A COLUMN ──────────────────
//
// 🔴 THE DEFECT THIS CLOSES, found 2026-09-01 and it DESTROYED DATA. `/admin/circles` builds its
// list from four role-scoped queries — janitor, host, guide, mentor — and casts all four to one
// hand-written `CircleRow`. The janitor and host branches selected `image_url, city, neighborhood,
// resonance_public, featured_at`. The guide branch omitted the first four; the mentor branch omitted
// all five. TypeScript could not see it: this repo casts the payload rather than regenerating
// database.types (ADR-246), so a missing column is `undefined` at runtime, not a type error.
//
// The consequence was not a blank field. `circles-client.tsx` prefills its form with
// `initial?.image_url ?? ''`, `handleSubmit` then `fd.set`s all four UNCONDITIONALLY, and
// `updateCircle` guards with `fd.has(...)` — which is always true once the form set them. So a guide
// or mentor who opened a circle, changed only its name, and saved, wrote
// `image_url: null, city: null, neighborhood: null, resonance_public: false` over live data. The
// action's own comment states the invariant that broke: "Optional fields are only written when
// present in the form, so a partial form never clears image/location/resonance it didn't show."
//
// The same file's `featured_at` miss is quieter and still wrong: for a mentor every
// `c.featured_at != null` was false, so a featured circle rendered unstarred and `FeatureStar`'s
// toggle always sent `act(true)` — a mentor could feature a circle and could never unfeature one.
// `/admin/events` had the identical shape: the directly-hosted branch of `load-events.ts` omitted
// `featured_at` while the circle-scoped branch selected it, and both merge into one `AdminEvent[]`.
//
// ⚠️ WHY THIS GUARD IS SCOPED TO NAMED PAIRS RATHER THAN THE WHOLE REPO. The obvious general rule —
// "all selects on the same table in one file must request the same columns" — was written and
// MEASURED FIRST: it fires on **346 files**, almost all of them legitimate, because a count query
// and a detail query on one table are supposed to differ. Divergence is only a defect when the
// branches feed ONE row type, and that relation is what makes it a bug rather than a difference. A
// gate with a 346-file false-positive rate is one that gets an allowlist and then reads as coverage
// (ADR-970). The general version is filed as HYG-039; this pins the two that actually bled.

const ROOT = path.join(import.meta.dirname, '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

/** A row type fed by more than one select in its own file. */
const PAIRS = [
  { file: 'app/(main)/admin/circles/page.tsx', type: 'CircleRow' },
  { file: 'app/(main)/admin/events/load-events.ts', type: 'AdminEvent' },
] as const

/** The scalar (non-embedded) keys a hand-written row type declares. */
export function scalarKeys(src: string, typeName: string): string[] {
  const start = src.search(new RegExp(`(type|interface)\\s+${typeName}\\s*=?\\s*\\{`))
  if (start < 0) return []
  let depth = 0
  let end = start
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  const body = src.slice(src.indexOf('{', start) + 1, end)
  // Drop nested object literals — those are embedded joins, checked by name not by shape.
  const flat = body.replace(/\{[^{}]*\}/g, 'OBJ')
  return [...flat.matchAll(/^\s*([a-z_][a-z0-9_]*)\s*\??\s*:/gim)]
    .map((m) => m[1])
    .filter((k) => !new RegExp(`^\\s*${k}\\s*\\??\\s*:\\s*OBJ`, 'm').test(flat))
}

/** Every select in the file whose result is cast to `typeName`. */
export function selectsFeeding(src: string, typeName: string): string[] {
  const out: string[] = []
  const re = /\.select\(\s*(?:\n\s*)?[`'"]([\s\S]*?)[`'"]\s*[,)]/g
  for (const m of src.matchAll(re)) {
    // The cast follows the awaited query within a few lines.
    const after = src.slice(m.index! + m[0].length, m.index! + m[0].length + 400)
    if (new RegExp(`as\\s+(unknown\\s+as\\s+)?${typeName}\\b`).test(after)) out.push(m[1])
  }
  return out
}

const named = (sel: string) =>
  new Set(
    sel
      .replace(/[a-z_]+:[a-z_]+![a-z_]+\s*\([^)]*\)/gi, (m) => m.split(':')[0])
      .split(',')
      .map((c) => c.trim().split(/[\s:(]/)[0])
      .filter((c) => /^[a-z_]+$/.test(c)),
  )

describe('a row type fed by several selects gets every column from every branch', () => {
  it.each(PAIRS)('$file · $type', ({ file, type }) => {
    const src = read(file)
    const keys = scalarKeys(src, type)
    expect(keys.length, `could not parse ${type}`).toBeGreaterThan(4)

    const selects = selectsFeeding(src, type)
    // Fewer than two branches means the class cannot occur — and also means this pin has gone
    // stale and should be re-pointed rather than silently passing.
    expect(selects.length, `${type} is no longer fed by multiple selects — re-point this pin`).toBeGreaterThan(1)

    for (const sel of selects) {
      const got = named(sel)
      const missing = keys.filter((k) => !got.has(k))
      expect(
        missing,
        `a branch feeding ${type} omits ${missing.join(', ')} — the form prefills undefined and can write it back as null`,
      ).toEqual([])
    }
  })
})
