#!/usr/bin/env node
// PHANTOM CLASS GATE — a class the source writes that the compiler emits nothing for.
//
// WHY THIS EXISTS. Every other style check in this repo reads SOURCE: check:tokens greps for
// literals, check:adoption counts them, lint parses the AST. All of them prove a string is
// present. None proves it PAINTS. So `bg-surface-2` sails through every gate we own — it is
// a plausible Tailwind class, it is spelled consistently, tsc has no opinion about strings,
// and eslint has no idea which utilities exist. It just silently renders nothing, and the
// element loses its background with no error anywhere.
//
// Five of these were live when this script was written, found by compiling instead of reading:
//
//   bg-surface-2            practice-builder.tsx      (token is surface-elevated)
//   bg-surface-subtle       authoring-access-note.tsx (invented name)
//   border-line             admin-journeys-library.tsx(token is border)
//   border-primary-border   event-checkin.tsx         (no such token)
//   text-muted-foreground   discover/spaces/[type]    (shadcn's name, not ours)
//
// The last one is the tell: `text-muted-foreground` is what a different design system calls
// this colour. It is the kind of thing that arrives with a pasted snippet and survives review
// because it reads perfectly. Only the compiler disagrees.
//
// HOW IT WORKS. Pull design-system-shaped class tokens out of string literals, run the real
// `globals.css` through the real Tailwind compiler, and assert each one emits a rule.
//
// DELIBERATELY NARROW. Only prefixes this design system owns, and only bare tokens: no
// arbitrary values, no variants, no dynamic `${}` fragments. A broad scan drowns in English
// words that happen to sit in string literals ("texture", "pressure", "textarea"), and a
// noisy gate gets ignored. Better to catch a real subset every run than a superset once.

import { compile } from 'tailwindcss'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const ROOTS = ['app', 'components']
/** Prefixes whose vocabulary is OURS — a miss here is a real token that does not exist. */
const OWNED = /^(?:bg|text|border|rounded|tracking|leading|shadow|lift)-[a-z][a-z0-9-]*$/
/** English words and legitimate non-class strings that the prefix rule cannot distinguish. */
const IGNORE = new Set([
  'text-only', 'text-bearing', 'text-field', 'text-search', 'text-style', 'text-size',
  'text-color', 'text-font', 'border-box', 'text-align', 'text-content', 'text-block',
])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx$/.test(p)) out.push(p)
  }
  return out
}

const seen = new Map()
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/["'`]([^"'`\n$]{2,400})["'`]/g)) {
      for (const tok of m[1].split(/\s+/)) {
        if (!OWNED.test(tok) || IGNORE.has(tok)) continue
        if (!seen.has(tok)) seen.set(tok, `${file}`)
      }
    }
  }
}

const css = readFileSync('app/globals.css', 'utf8')
const compiler = await compile(css, {
  base: process.cwd(),
  loadStylesheet: async (id, base) => {
    const target = id.startsWith('.') ? resolve(base, id) : resolve('node_modules', id)
    const p = target.endsWith('.css') ? target : join(target, 'index.css')
    return { path: p, base: dirname(p), content: readFileSync(p, 'utf8') }
  },
})

const candidates = [...seen.keys()].sort()
const out = compiler.build(candidates)

// SELF-CHECK. A broken extractor and a clean repo produce the same "0 problems", so prove the
// instrument works before trusting its silence: a known-good class must be found emitting CSS.
const control = 'rounded-card'
const controlOk = new RegExp(`\\.${control.replace(/-/g, '\\-')}[\\s,:{]`).test(compiler.build([control]))
if (!controlOk) {
  console.error(`✗ Phantom-class gate is BROKEN: the control class \`${control}\` emitted no CSS.`)
  console.error('  The scan cannot be trusted; a green result here would be meaningless.')
  process.exit(1)
}

const phantom = candidates.filter((c) => {
  const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '\\-')
  return !new RegExp(`\\.${esc}[\\s,:{]`).test(out)
})

if (phantom.length > 0) {
  console.error(`✗ Phantom classes: ${phantom.length} class(es) are written but emit NO CSS.\n`)
  for (const c of phantom) console.error(`    ${c.padEnd(30)} ${seen.get(c)}`)
  console.error('\n  Each of these renders nothing. tsc and eslint cannot see it, because a')
  console.error('  className is just a string to them — only the compiler knows the vocabulary.')
  console.error('  Fix by using the real token (see app/globals.css) or, if the token SHOULD')
  console.error('  exist, define it there and bridge it in @theme inline.')
  process.exit(1)
}

console.log(`✓ Phantom classes: ${candidates.length} design-system class(es) checked, every one emits CSS.`)
