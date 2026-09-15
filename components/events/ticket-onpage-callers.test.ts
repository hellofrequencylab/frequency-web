import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

/**
 * EVERY CALLER OF `startTicket` MUST HANDLE BOTH RESPONSE SHAPES.
 *
 * 🔴 THIS GUARD EXISTS BECAUSE THE BUG WAS REAL, not hypothetical. When the server began issuing
 * `ui_mode: 'elements'` sessions, `startTicket` stopped returning `url` and started returning
 * `clientSecret`. `components/events/rsvp-payment-flow.tsx` only ever read `r.data.url`, so its
 * pay button went DEAD: the buyer clicked, a session was created and reserved against their seat,
 * and nothing happened on screen. It typechecked cleanly, because both fields are optional.
 *
 * That is the shape of failure this file catches: a caller that silently drops the new branch.
 * A dead buy button reports nothing and looks like a slow page.
 */

const ROOTS = ['app', 'components']
const ACTION = 'startTicket('

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue
      walk(p, out)
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(p)
    }
  }
  return out
}

/** The action's own definition is not a caller. */
const isDefinition = (f: string) => f.endsWith(path.join('events', '[slug]', 'ticket-actions.ts'))

const callers = ROOTS.flatMap((r) => walk(r)).filter(
  (f) => !isDefinition(f) && readFileSync(f, 'utf8').includes(ACTION),
)

describe('every startTicket caller handles the on-page session', () => {
  it('found callers at all — a walk that finds nothing would pass vacuously', () => {
    // The floor. Without it this whole file reports a clean bill of health on an empty list,
    // which is the failure mode AGENTS.md names in four ADRs.
    expect(callers.length, 'no startTicket callers found; the walk or the action name is wrong').toBeGreaterThan(0)
  })

  it.each(callers)('%s reads clientSecret, not only url', (file) => {
    const src = readFileSync(file, 'utf8')
    // ⚠️ Must be the RESPONSE BRANCH, not the word anywhere in the file. A first version of this
    // checked `src.includes('clientSecret')` and PASSED against a mutated rsvp-payment-flow that
    // had lost its branch but still mentioned the name in a fallback helper and a prop. Proven by
    // mutation, which is the only reason the weakness was found.
    expect(
      /\bdata\.clientSecret\b/.test(src),
      `${file} calls startTicket but never reads clientSecret. When the server issues an ` +
        `on-page session this caller's button does nothing at all: the session is created, the ` +
        `seat is reserved, and the buyer sees no form and no redirect. Handle both shapes.`,
    ).toBe(true)
  })

  it.each(callers)('%s still handles the hosted url fallback', (file) => {
    const src = readFileSync(file, 'utf8')
    // The other direction: dropping the url branch breaks every deployment without a
    // publishable key, and every case where Stripe declines to issue a secret.
    expect(
      /\bdata\.url\b/.test(src),
      `${file} no longer handles the hosted redirect, so checkout breaks wherever the on-page ` +
        `path declines — including any environment with no NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.`,
    ).toBe(true)
  })
})
