import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ONE UPGRADE PROMPT, MANY CALLERS.
//
// 🔴 THE SHAPE THIS REPLACES. `CrewGate` and `CrewGateButton` each held a private `useState` and
// rendered their own `<UpgradeLightbox>`, at nine call sites. Three consequences, all of them the
// same bug wearing different clothes:
//   1. The prompt existed nine times in the tree.
//   2. Only a component that had ALREADY decided to render a gate could open it - so a rejected
//      server action, a meter at its cap, or a nav item a member cannot use had no way to raise it.
//   3. The rail carried a SECOND upgrade surface with its own separately-worded pitch, which is how
//      two wordings for one product drift apart.
//
// The dialog is app chrome, so it mounts once in the shell and everything else dispatches. These are
// source-shape assertions because the defect is structural - "how many of these exist" and "who can
// open one" are not questions you can ask by rendering a single component.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const root = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(root, p), 'utf8')

/** Comments describe the old shape by name, so every "this token is gone" assertion has to read the
 *  CODE. A probe that cannot tell use from mention forces the next person to delete the history. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const GATES = read('components/crew/upgrade-lightbox.tsx')
const GATES_CODE = stripComments(GATES)
const LAUNCHER = read('components/crew/upgrade-launcher.tsx')
const RAIL = read('components/layout/upgrade-crew.tsx')

describe('the prompt is mounted once and raised by event', () => {
  it('is mounted in the member shell, beside the other app-wide launchers', () => {
    expect(read('app/(main)/layout.tsx')).toContain('<UpgradeLauncher />')
  })

  it('the gates hold no dialog and no open-state of their own', () => {
    expect(
      GATES_CODE,
      'a gate is rendering its own <UpgradeLightbox> again. That is the nine-copies shape: the ' +
        'prompt becomes something only an already-rendered gate can open.',
    ).not.toMatch(/<UpgradeLightbox/)
    expect(GATES_CODE, 'a gate is holding open-state again').not.toContain('useState')
  })

  it('both gates raise the shared prompt instead', () => {
    expect(GATES_CODE).toMatch(/CrewGate\b[\s\S]*?openUpgrade\(/)
    expect(GATES_CODE).toMatch(/CrewGateButton\b[\s\S]*?openUpgrade\(/)
  })

  it('openUpgrade is safe to call where there is no window', () => {
    // It is exported from a client module that server components import transitively. A caller in a
    // module evaluated on the server must not take the whole render down.
    expect(LAUNCHER).toMatch(/typeof window === 'undefined'/)
  })

  it('an unknown reason still opens a populated dialog', () => {
    // UPGRADE_COPY lookups return undefined for an unregistered key; the lightbox falls back to
    // DEFAULT_COPY. Without that, a typo'd reason opens an empty box.
    expect(LAUNCHER).toMatch(/UPGRADE_COPY\[reason\]/)
    expect(GATES).toMatch(/title \?\? DEFAULT_COPY\.title/)
    expect(GATES).toMatch(/blurb \?\? DEFAULT_COPY\.blurb/)
  })
})

describe('the rail is a door, not a second pitch', () => {
  it('renders a tab that raises the shared prompt', () => {
    expect(RAIL).toMatch(/openUpgrade\(\)/)
  })

  it('carries no pitch copy of its own', () => {
    // The panel it replaced had its own headline and blurb, which is two wordings for one product.
    expect(stripComments(RAIL)).not.toMatch(/full game|ranks, seasons/i)
  })

  it('holds no dismissal state, because a tab is not an interruption', () => {
    expect(stripComments(RAIL)).not.toMatch(/localStorage|dismiss/i)
  })

  it('is orange: the primary surface with on-primary text, not the pale tint', () => {
    // The collapsed tab used to be `bg-primary-bg/60` + `text-primary-strong`, which reads as a
    // muted chip rather than an action.
    expect(RAIL).toMatch(/bg-primary\b/)
    expect(RAIL).toMatch(/text-on-primary/)
  })
})

describe('the prompt states no price and no beta claim of its own', () => {
  it('routes the membership line through beta-notices rather than writing one', () => {
    // It read "Crew is free during the beta. Upgrade in one tap, no card..." as a literal - a claim
    // with an expiry date, in a dialog now raised by every gate in the app.
    expect(GATES).toContain('crewUpgradeSuffix()')
    expect(GATES_CODE, 'beta copy is hardcoded in the prompt again').not.toMatch(/free during the beta/i)
  })

  it('does not promise a free upgrade in the CTA', () => {
    expect(GATES_CODE).not.toMatch(/Upgrade to Crew, free/)
  })

  it('quotes no fixed price, because Crew is pay-what-you-want', () => {
    // PLACEHOLDER_MEMBER_PRICE_CENTS.crew is a FLOOR ($4.99), not a price. Any bare figure here
    // would be the "$9/mo" defect this repo has closed twice.
    expect(GATES_CODE).not.toMatch(/\$\d/)
  })
})
