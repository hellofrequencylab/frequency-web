import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { stripComments, tailwindDefaults, blockBody, declaredIn, findUnbridged } from './check-bridge.mjs'

const GLOBALS = readFileSync('app/globals.css', 'utf8')
const TAILWIND = readFileSync('node_modules/tailwindcss/theme.css', 'utf8')

describe('check-bridge — comment stripping is load-bearing, not hygiene', () => {
  // 🔴 THE BUG THIS SCRIPT SHIPPED WITH. app/globals.css documents itself heavily and names its
  // own tokens in prose. The `@theme inline` lookup latched onto a MENTION of that phrase in a
  // comment ~1,000 lines above the real at-rule, sliced out an unrelated block, and reported 15
  // findings of which 13 were prose. Stripping comments took it to 2 — both real.
  it('does not treat a token named in a comment as a declaration', () => {
    const css = '/* we declare --color-primary here */ :root { --color-other: red; }'
    expect(declaredIn(stripComments(css)).has('--color-primary')).toBe(false)
    expect(declaredIn(stripComments(css)).has('--color-other')).toBe(true)
  })

  it('does not open a block at an at-rule named inside a comment', () => {
    const css = '/* see @theme inline below */ .decoy { color: red; } @theme { --radius-sm: 6px; }'
    const body = blockBody(stripComments(css), /@theme\b/)
    expect(body).toContain('--radius-sm')
    expect(body).not.toContain('color: red')
  })
})

describe('check-bridge — the collision rule', () => {
  it('flags a token the repo declares that Tailwind also defines and the repo never bridges', () => {
    const css = ':root { --tracking-tight: -0.015em; } @theme inline { --color-primary: var(--color-primary); }'
    expect(findUnbridged(css, TAILWIND)).toContain('--tracking-tight')
  })

  it('does NOT flag it once bridged', () => {
    const css = ':root { --tracking-tight: -0.015em; } @theme inline { --tracking-tight: var(--tracking-tight); }'
    expect(findUnbridged(css, TAILWIND)).not.toContain('--tracking-tight')
  })

  it('does NOT flag a repo-only token — no Tailwind default means no silent override', () => {
    // The rule is a COLLISION, not "everything must be bridged". Plenty of tokens are read by raw
    // var() in hand-written CSS and need no utility at all.
    const css = ':root { --brand-mark: #6E4A2A; }'
    expect(findUnbridged(css, TAILWIND)).toEqual([])
  })

  it('knows Tailwind actually defines the two names this gate caught', () => {
    const defaults = tailwindDefaults(TAILWIND)
    expect(defaults.has('--tracking-tight')).toBe(true)
    expect(defaults.has('--ease-out')).toBe(true)
  })
})

describe('check-bridge — the shipped stylesheet', () => {
  it('has no unbridged collisions', () => {
    expect(findUnbridged(GLOBALS, TAILWIND)).toEqual([])
  })

  it('bridges the two that were silently rendering Tailwind values', () => {
    const theme = declaredIn(blockBody(stripComments(GLOBALS), /@theme\b/) ?? '')
    expect(theme.has('--tracking-tight'), '57 sites rendered -0.025em instead of -0.015em').toBe(true)
    expect(theme.has('--ease-out'), '19 sites rendered the generic ease instead of the DAWN settle').toBe(true)
  })
})
