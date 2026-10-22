#!/usr/bin/env node
// check:marketing-kit — a public marketing page composes the kit; it never hand-rolls a layout.
//
// THE RULE (owner, 2026-10-22): every public marketing page wears the standard site header, footer and
// rail through the (marketing) layout, and its body is kit components (components/frequency/site) whose
// colours, type and spacing are tokens. A page.tsx under app/(marketing), app/for, app/privacy or
// app/terms carries no Tailwind layout classes of its own: it loads data, sets metadata and renders a
// component. Hand-built markup belongs in a kit component, where the design-system gates (check:tokens,
// check:adoption) already measure it.
//
// The seven pages below predate the rule: their Tailwind markup is the DAWN fallback of a page that
// already renders a Frequency kit component. The baseline may only shrink.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['app/(marketing)', 'app/for', 'app/privacy', 'app/terms']
const BASELINE = new Set(readFileSync('scripts/marketing-kit-baseline.txt', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')))
const UTILITY = /className="[^"]*\b(p[xytblr]?-\d|m[xytblr]?-(auto|\d)|max-w-|bg-|text-[a-z]|grid|flex|gap-|rounded|border|space-[xy]-)/

function pages(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return pages(p)
    return name === 'page.tsx' ? [p] : []
  })
}

const offenders = ROOTS.flatMap((r) => { try { return pages(r) } catch { return [] } })
  .filter((p) => readFileSync(p, 'utf8').split('\n').some((l) => UTILITY.test(l)))

const fresh = offenders.filter((p) => !BASELINE.has(p))
const healed = [...BASELINE].filter((p) => !offenders.includes(p))
if (fresh.length) {
  console.error('✗ marketing-kit: these pages hand-roll Tailwind layout instead of composing a kit component:\n')
  for (const p of fresh) console.error('    - ' + p)
  console.error('\n  Move the markup into a component under components/frequency/site/pages and use kit sections (phero, sec, tg-card, KeepGoing).')
  process.exit(1)
}
if (healed.length) {
  console.error('✗ marketing-kit: these baseline entries are clean now, remove them from scripts/marketing-kit-baseline.txt:\n')
  for (const p of healed) console.error('    - ' + p)
  process.exit(1)
}
console.log(`✓ marketing-kit: ${offenders.length} legacy page(s) on the baseline, no new hand-rolled marketing page.`)
