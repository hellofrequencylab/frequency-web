import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE REDUCED-MOTION GATE (HYG-058 · a11y). A SOURCE-reading test, not a build gate.
//
// Every bespoke `@keyframes` in app/globals.css must be neutralized for a member who has asked
// their OS for less motion. There is no blanket `* { animation: none }` in this repo — the global
// reduced-motion block only collapses the `--motion-*` duration tokens and Tailwind's stock
// `.animate-pulse` / `.animate-spin` — so EVERY hand-written keyframe needs its own guard, and a
// keyframe that never gets one animates for exactly the people who asked it not to.
//
// 🔴 THE BUG THIS WAS WRITTEN AGAINST, and it was live when the gate was written: `slideUp` was
// the eleventh keyframe and the only one with no guard. Ten of eleven were correct, which is the
// shape a hand-checked invariant always decays into. Its consumers carried the rule instead —
// `motion-safe:animate-[slideUp_…]` at fifteen of seventeen call sites — so the guarantee rested
// on every future author remembering a prefix, and two had already forgotten it
// (components/ui/toast.tsx and app/join/(induction)/induction.tsx). A comment in
// components/journey/v2/trophy-celebration.tsx had ALREADY written the finding down
// ("`@keyframes slideUp` carries no guard of its own in globals.css, so every consumer must add
// `motion-safe:`") and fixed its own call site without closing the hole. Prose noticed; nothing
// enforced. That is what this file is for.
//
// WHY IT LIVES IN scripts/ AS A *.test.ts: the ARM-C precedent (ADR-1140, SCAN-506) — a guard that
// reads SOURCE runs on every PR under `pnpm test`, which is earlier and stronger than a gate that
// can only run where a build exists.
//
// HOW IT DECIDES, and it measures the CONSEQUENCE rather than the presence of the words:
//   1. Parse globals.css into rules, tracking which sit inside `@media (prefers-reduced-motion:
//      reduce)`. `@keyframes` bodies are skipped so their `from`/`to`/`0%` steps are never mistaken
//      for selectors.
//   2. A keyframe's CONSUMERS are the rules that actually apply it (`animation: <name> …` or
//      `animation-name: <name>`), read out of the file rather than guessed from its name.
//   3. A keyframe is GUARDED when every one of those consumer selectors also appears inside a
//      reduced-motion block on a rule that sets `animation: none`.
//   4. A keyframe applied from OUTSIDE this stylesheet has no consumer rule to find, so it must be
//      declared in EXTERNALLY_APPLIED below — and the test then verifies that the guard selector
//      the entry names really is neutralized in the CSS. The map is an index, never the evidence.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const ROOT = path.join(import.meta.dirname, '..')
const GLOBALS = 'app/globals.css'

/** Keyframes applied from outside this stylesheet, so step 2 finds no consumer rule for them.
 *  Each entry names the selector that MUST be neutralized under reduced-motion; the test asserts
 *  that selector really is, so an entry cannot make an unguarded keyframe pass by existing. */
const EXTERNALLY_APPLIED: Record<string, { guard: string; why: string }> = {
  slideUp: {
    guard: '[class*="animate-[slideUp"]',
    why:
      'Applied from TSX as a Tailwind arbitrary value (`animate-[slideUp_0.4s_ease-out]`), so there ' +
      'is no single consumer class to guard. The attribute selector is the backstop that makes the ' +
      'keyframe safe by construction rather than by every author remembering `motion-safe:`.',
  },
  'spotlight-bg-pan': {
    guard: '.spotlight-root',
    why:
      'Applied INLINE from lib/spotlight/theme.ts (the duration comes from a member-set, validated ' +
      'value), so the animation never appears in a stylesheet rule. The guard sits on the Spotlight ' +
      'root that carries it — components/spotlight/spotlight-shell.tsx.',
  },
}

// ── The analyser (pure; every control below runs it on synthetic CSS) ────────────────────────

type Rule = { selector: string; body: string; inReduced: boolean }

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Brace-aware walk. Descends into at-rules (so `@media` nesting is followed), tracks the
 *  reduced-motion context, and never descends into `@keyframes` — its steps are not selectors. */
export function parseRules(css: string, inReduced = false, out: Rule[] = []): Rule[] {
  let i = 0
  let start = 0
  while (i < css.length) {
    const ch = css[i]
    if (ch === '{') {
      const prelude = norm(css.slice(start, i))
      let depth = 1
      let j = i + 1
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++
        else if (css[j] === '}') depth--
        j++
      }
      const body = css.slice(i + 1, j - 1)
      if (prelude.startsWith('@')) {
        if (!/^@keyframes\b/.test(prelude)) {
          const isReduced = /prefers-reduced-motion\s*:\s*reduce/.test(prelude)
          parseRules(body, inReduced || isReduced, out)
        }
      } else if (prelude) {
        out.push({ selector: prelude, body, inReduced })
      }
      i = j
      start = j
    } else if (ch === '}') {
      i++
      start = i
    } else {
      i++
    }
  }
  return out
}

export const keyframeNames = (css: string): string[] => [
  ...new Set([...stripComments(css).matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1])),
]

/** Selectors neutralized (`animation: none`) inside a reduced-motion block, one per comma part. */
export function neutralizedSelectors(css: string): Set<string> {
  const out = new Set<string>()
  for (const r of parseRules(stripComments(css))) {
    if (!r.inReduced) continue
    if (!/animation(?:-name)?\s*:\s*none/.test(r.body)) continue
    for (const part of r.selector.split(',')) out.add(norm(part))
  }
  return out
}

/** The rules that actually APPLY a keyframe, outside any reduced-motion block. */
export function consumerSelectors(css: string, name: string): string[] {
  const applies = new RegExp(`animation(?:-name)?\\s*:[^;}]*(?<![\\w-])${name}(?![\\w-])`)
  const out = new Set<string>()
  for (const r of parseRules(stripComments(css))) {
    if (r.inReduced) continue
    if (applies.test(r.body)) for (const part of r.selector.split(',')) out.add(norm(part))
  }
  return [...out]
}

export type Verdict =
  | { name: string; guarded: true; via: 'consumer-guard' | 'external-guard' }
  | { name: string; guarded: false; reason: string }

export function auditReducedMotion(
  css: string,
  external: Record<string, { guard: string; why: string }> = EXTERNALLY_APPLIED,
): Verdict[] {
  const neutralized = neutralizedSelectors(css)
  return keyframeNames(css).map((name): Verdict => {
    const consumers = consumerSelectors(css, name)
    if (consumers.length > 0) {
      const unguarded = consumers.filter((s) => !neutralized.has(s))
      return unguarded.length === 0
        ? { name, guarded: true, via: 'consumer-guard' }
        : {
            name,
            guarded: false,
            reason: `applied by ${unguarded.map((s) => `\`${s}\``).join(', ')}, which ${
              unguarded.length === 1 ? 'is' : 'are'
            } not set to \`animation: none\` in any @media (prefers-reduced-motion: reduce) block`,
          }
    }
    const entry = external[name]
    if (!entry) {
      return {
        name,
        guarded: false,
        reason:
          'no rule in this stylesheet applies it, so it is applied from TSX or inline — add it to ' +
          'EXTERNALLY_APPLIED in scripts/check-reduced-motion.test.ts naming the selector that is ' +
          'neutralized under reduced-motion',
      }
    }
    return neutralized.has(norm(entry.guard))
      ? { name, guarded: true, via: 'external-guard' }
      : {
          name,
          guarded: false,
          reason: `EXTERNALLY_APPLIED names \`${entry.guard}\` as its guard, but that selector is not set to \`animation: none\` in any reduced-motion block`,
        }
  })
}

// ── The gate ─────────────────────────────────────────────────────────────────────────────────

const css = readFileSync(path.join(ROOT, GLOBALS), 'utf8')

describe('reduced motion: every @keyframes in app/globals.css is neutralized', () => {
  it('the parser is actually reading the stylesheet', () => {
    // The check-admin-client lesson: a guard whose walk silently finds nothing reports success.
    // These floors sit under the live counts and far above zero.
    expect(keyframeNames(css).length).toBeGreaterThanOrEqual(11)
    expect(neutralizedSelectors(css).size).toBeGreaterThanOrEqual(10)
    expect(parseRules(stripComments(css)).length).toBeGreaterThanOrEqual(120)
  })

  it('no keyframe animates for a member who asked for reduced motion', () => {
    const unguarded = auditReducedMotion(css).filter((v) => !v.guarded)
    expect(
      unguarded.map((v) => `@keyframes ${v.name} — ${'reason' in v ? v.reason : ''}`),
    ).toEqual([])
  })

  it('every EXTERNALLY_APPLIED entry is for a keyframe that exists and has no in-file consumer', () => {
    // Keeps the map from accumulating stale entries that quietly widen the exemption.
    const names = new Set(keyframeNames(css))
    for (const name of Object.keys(EXTERNALLY_APPLIED)) {
      expect(names, `EXTERNALLY_APPLIED lists ${name}, which is no longer a keyframe`).toContain(name)
      expect(
        consumerSelectors(css, name),
        `${name} IS applied by a rule in globals.css now — drop its EXTERNALLY_APPLIED entry and guard that rule`,
      ).toEqual([])
    }
  })
})

// ── Detector controls. A gate that has never been seen to FIRE is not known to work. ─────────

describe('the detector fires', () => {
  const GUARDED = `
    .animate-x { animation: xslide 1s ease-out; }
    @keyframes xslide { from { opacity: 0 } to { opacity: 1 } }
    @media (prefers-reduced-motion: reduce) { .animate-x { animation: none; } }
  `

  it('positive control: a keyframe whose consumer IS neutralized passes', () => {
    expect(auditReducedMotion(GUARDED, {})).toEqual([{ name: 'xslide', guarded: true, via: 'consumer-guard' }])
  })

  it('mutation control: deleting the guard block turns it red', () => {
    const mutated = GUARDED.replace(/@media \(prefers-reduced-motion: reduce\)[^}]*}\s*}/, '')
    const [verdict] = auditReducedMotion(mutated, {})
    expect(verdict.guarded).toBe(false)
    expect('reason' in verdict && verdict.reason).toContain('.animate-x')
  })

  it('mutation control: deleting ONE guard from a live-shaped file turns exactly that one red', () => {
    // The real stylesheet, with the `.animate-marquee` guard removed. Everything else must stay green.
    const mutated = css.replace('.animate-marquee { animation: none; }', '')
    expect(mutated).not.toBe(css)
    const unguarded = auditReducedMotion(mutated).filter((v) => !v.guarded).map((v) => v.name)
    expect(unguarded).toEqual(['marquee'])
  })

  it('negative control: an unguarded keyframe with no consumer is reported, not skipped', () => {
    const orphan = '@keyframes ghostFade { from { opacity: 0 } to { opacity: 1 } }'
    const [verdict] = auditReducedMotion(orphan, {})
    expect(verdict.guarded).toBe(false)
    expect('reason' in verdict && verdict.reason).toContain('EXTERNALLY_APPLIED')
  })

  it('mutation control: an EXTERNALLY_APPLIED entry cannot pass on its own say-so', () => {
    const orphan = '@keyframes ghostFade { from { opacity: 0 } to { opacity: 1 } }'
    const verdicts = auditReducedMotion(orphan, {
      ghostFade: { guard: '.ghost', why: 'claims a guard that the CSS does not contain' },
    })
    expect(verdicts[0].guarded).toBe(false)
    expect('reason' in verdicts[0] && verdicts[0].reason).toContain('not set to `animation: none`')
  })

  it('control: @keyframes step selectors are never mistaken for guarded rules', () => {
    // `from`/`to`/`0%` inside a keyframes body must not leak into the rule list.
    const selectors = parseRules(stripComments(css)).map((r) => r.selector)
    expect(selectors).not.toContain('from')
    expect(selectors).not.toContain('to')
    expect(selectors).not.toContain('0%')
  })
})
