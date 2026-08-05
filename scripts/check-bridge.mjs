#!/usr/bin/env node
// check:bridge — the token a theme declares and Tailwind silently overrules.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE BUG CLASS
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Tailwind v4 generates utilities from the `@theme` block, NOT from `:root`. app/globals.css
// declares the DAWN palette and scale in `:root` (so it cascades, and so skins can re-declare it
// per scope) and then BRIDGES each token into `@theme inline` with a line like:
//
//     --color-primary: var(--color-primary);
//
// That line looks like a tautology and is doing all the work: it is what makes `bg-primary`
// resolve to the repo's value instead of Tailwind's own.
//
// Forget the bridge and nothing breaks loudly. If Tailwind ships a DEFAULT under the same name,
// the utility keeps working — painted with TAILWIND's value, while `:root` sits there holding the
// designed one and every reviewer reads the declaration and believes it. That is the failure this
// gate exists to catch, and it had already happened three times:
//
//   --tracking-tight   declared -0.015em, never bridged → 57 sites render Tailwind's -0.025em,
//                      a 67% overshoot on the tightening the design system asked for.
//   --radius-3xl       never authored at all, so `rounded-3xl` inherits Tailwind's 1.5rem = 25.5px
//                      against the repo's own `--radius-2xl: 24px` — a 1.5px "step" that is
//                      invisible, and 0.72px at the tightest density generation.
//   --radius-xs/4xl    same shape.
//
// THE RULE, and why it is this one. "Every `:root` token must be bridged" would be wrong and
// noisy: plenty of tokens are consumed by raw `var()` in hand-written CSS and need no utility at
// all (`--color-focus-ring` is read directly by the `:focus-visible` rule). The precise, low-noise
// condition is a COLLISION:
//
//     the repo declares a token · Tailwind defines one under the same name · the repo does not
//     bridge it  ⇒  Tailwind's value wins and the repo's is dead text.
//
// Anything else is a judgement call. This is not: two definitions exist and the wrong one is live.
//
// Usage: `node scripts/check-bridge.mjs`

import { readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const GLOBALS = 'app/globals.css'
const TAILWIND_THEME = 'node_modules/tailwindcss/theme.css'

/**
 * Strip /* … *\/ comments.
 *
 * NOT optional hygiene — it is load-bearing here, and getting it wrong was this script's first
 * bug. app/globals.css documents itself heavily and names its own tokens in prose ("declared in
 * :root alone, Tailwind v4 …", "@theme inline below"). Without stripping, the `@theme inline`
 * block lookup latched onto a MENTION of that phrase in a comment 1,000 lines above the real
 * at-rule and sliced out an unrelated block, and every "is this token declared?" answer counted
 * prose as code.
 */
export function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Every custom property Tailwind's own theme layer defines (its defaults). */
export function tailwindDefaults(css) {
  const names = new Set()
  for (const m of stripComments(css).matchAll(/(^|[;{}\s])(--[a-zA-Z0-9-]+)\s*:/g)) names.add(m[2])
  return names
}

/**
 * Slice out a top-level block by an at-rule/selector prelude REGEXP, brace-counting so nested
 * blocks (media queries, `@utility`, nested rules) do not end it early. Expects comment-stripped
 * CSS — see stripComments.
 */
export function blockBody(css, opener) {
  const re = opener instanceof RegExp ? opener : new RegExp(opener.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const hit = re.exec(css)
  if (!hit) return null
  const start = hit.index
  const open = css.indexOf('{', start)
  if (open === -1) return null
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  return null
}

/** Custom properties DECLARED (assigned a value) directly in a block. */
export function declaredIn(body) {
  const names = new Set()
  if (!body) return names
  for (const m of body.matchAll(/(^|[;{])\s*(--[a-zA-Z0-9-]+)\s*:/g)) names.add(m[2])
  return names
}

/**
 * Find tokens the repo declares that Tailwind also defines, where the repo never bridged them —
 * so the utility renders Tailwind's value and the repo's declaration is inert.
 */
export function findUnbridged(globalsCss, tailwindCss) {
  const css = stripComments(globalsCss)
  const defaults = tailwindDefaults(tailwindCss)
  const themeBody = blockBody(css, /@theme\b/) ?? ''
  const theme = declaredIn(themeBody)

  // Everything OUTSIDE @theme: the `:root` palette plus every skin / generation / occasion
  // override. A token declared only in a skin scope is still a repo value Tailwind can overrule.
  const outside = declaredIn(css.replace(themeBody, ''))

  const findings = []
  for (const name of [...outside].sort()) {
    if (!defaults.has(name)) continue // no collision — Tailwind has no opinion on this name
    if (theme.has(name)) continue // bridged: the repo's value wins
    findings.push(name)
  }
  return findings
}

function main() {
  if (!existsSync(TAILWIND_THEME)) {
    console.error(`✗ cannot find ${TAILWIND_THEME}. Run pnpm install first.`)
    process.exit(1)
  }
  const globals = readFileSync(GLOBALS, 'utf8')
  const tw = readFileSync(TAILWIND_THEME, 'utf8')
  const unbridged = findUnbridged(globals, tw)

  if (unbridged.length === 0) {
    console.log('✓ bridge: every token the repo declares that Tailwind also defines is bridged into @theme.')
    return
  }

  console.error(`\n✗ bridge: ${unbridged.length} token(s) are declared in ${GLOBALS} but NOT bridged into`)
  console.error("  `@theme inline`, and Tailwind ships a default under the same name. The utility")
  console.error("  therefore renders TAILWIND's value and the declared one is dead text:\n")
  for (const n of unbridged) console.error(`    ${n}`)
  console.error('\n  Fix by adding the bridge line inside `@theme inline`:\n')
  console.error(`    ${unbridged[0]}: var(${unbridged[0]});\n`)
  console.error('  If the token is deliberately NOT a utility (consumed only by raw var() in hand-written')
  console.error('  CSS), it must not share a name with a Tailwind default — rename it so the collision,')
  console.error('  and the silent override, cannot exist.\n')
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
