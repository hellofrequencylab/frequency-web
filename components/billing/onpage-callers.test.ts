import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

/**
 * EVERY CALLER OF AN ON-PAGE CHECKOUT ACTION MUST HANDLE BOTH RESPONSE SHAPES.
 *
 * 🔴 THIS GUARD EXISTS BECAUSE THE BUG WAS REAL, not hypothetical. When the server began issuing
 * `ui_mode: 'elements'` sessions, `startTicket` stopped returning `url` and started returning
 * `clientSecret`. `components/events/rsvp-payment-flow.tsx` only ever read `r.data.url`, so its
 * pay button went DEAD: the buyer clicked, a session was created and reserved against their seat,
 * and nothing happened on screen. It typechecked cleanly, because both fields are optional.
 *
 * Generalised from the ticket-only version in LIVE-359, when three more creators gained the same
 * seam and the same way to fail. A dead buy button reports nothing and looks like a slow page.
 */

const ROOTS = ['app', 'components']

/** Each on-page action, and the module that DEFINES it (a definition is not a caller). */
const ACTIONS: { call: string; definition: string }[] = [
  { call: 'startTicket(', definition: path.join('events', '[slug]', 'ticket-actions.ts') },
  { call: 'startTip(', definition: path.join('people', '[handle]', 'tip-actions.ts') },
  { call: 'startSpaceDonationCheckout(', definition: path.join('lib', 'billing', 'donation-actions.ts') },
  { call: 'startCheckoutAction(', definition: path.join('marketplace', 'commerce-actions.ts') },
]

/** The creators themselves. A module that ASKS for elements mode must read what elements returns. */
const CREATORS = [
  'createTicketCheckout(',
  'createTipCheckout(',
  'createSpaceDonationCheckout(',
  'createCommerceCheckout(',
]

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

const ALL = [...ROOTS, 'lib'].flatMap((r) => walk(r))

const callers = ACTIONS.flatMap(({ call, definition }) =>
  ALL.filter((f) => !f.endsWith(definition) && readFileSync(f, 'utf8').includes(call)).map((f) => ({ file: f, call })),
)

describe('every on-page checkout caller handles both session shapes', () => {
  it('found callers at all — a walk that finds nothing would pass vacuously', () => {
    // The floor. Without it this whole file reports a clean bill of health on an empty list,
    // which is the failure mode AGENTS.md names in four ADRs.
    expect(callers.length, 'no on-page checkout callers found; the walk or an action name is wrong').toBeGreaterThan(3)
  })

  it('covers every action in the table — a renamed action must not silently drop out', () => {
    // Each listed action needs at least one caller. Renaming `startTip` without updating this
    // table would otherwise leave its callers unguarded while the suite stayed green.
    for (const { call } of ACTIONS) {
      expect(
        callers.some((c) => c.call === call),
        `${call} has no caller. Either it was renamed (update ACTIONS) or its buy control is gone.`,
      ).toBe(true)
    }
  })

  it.each(callers.map((c) => [c.file, c.call]))('%s (%s) reads clientSecret, not only url', (file, call) => {
    const src = readFileSync(file as string, 'utf8')
    // ⚠️ Must be a PROPERTY READ, not the word anywhere in the file. A first version of this
    // checked `src.includes('clientSecret')` and PASSED against a mutated rsvp-payment-flow that
    // had lost its branch but still mentioned the name in a fallback helper and a prop. Proven by
    // mutation, which is the only reason the weakness was found.
    expect(
      /\.clientSecret\b/.test(src),
      `${file} calls ${call} but never reads clientSecret. When the server issues an on-page ` +
        `session this caller's button does nothing at all: the session is created, the money path ` +
        `is committed against it, and the buyer sees no form and no redirect. Handle both shapes.`,
    ).toBe(true)
  })

  it.each(callers.map((c) => [c.file, c.call]))('%s (%s) still handles the hosted url fallback', (file, call) => {
    const src = readFileSync(file as string, 'utf8')
    // The other direction: dropping the url branch breaks every deployment without a
    // publishable key, and every case where Stripe declines to issue a secret.
    expect(
      /\.url\b/.test(src),
      `${file} no longer handles the hosted redirect for ${call}, so checkout breaks wherever the ` +
        `on-page path declines — including any environment with no NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.`,
    ).toBe(true)
  })
})

describe('asking for elements obliges you to read what elements returns', () => {
  // The seam's OTHER end. `ui` defaults to hosted, so a creator's existing callers are safe by
  // construction -- but the moment a module passes `ui:` it starts receiving a shape it may not
  // read. This arm is what keeps a future fifth creator from repeating the dead-button bug at the
  // server boundary instead of the browser one, where no component test would see it.
  const askers = ALL.filter((f) => {
    const src = readFileSync(f, 'utf8')
    return CREATORS.some((c) => src.includes(c)) && /\bui:\s*(onPageCheckoutAvailable|'elements')/.test(src)
  })

  it('found modules that ask for elements mode', () => {
    expect(askers.length, 'nothing asks for elements mode; the detector or the wiring is wrong').toBeGreaterThan(0)
  })

  it.each(askers)('%s reads clientSecret off the result it asked for', (file) => {
    const src = readFileSync(file, 'utf8')
    expect(
      /\.clientSecret\b/.test(src),
      `${file} passes ui: 'elements' to a checkout creator but never reads clientSecret off the ` +
        `result. It will receive a session with url: null and hand its caller nothing at all.`,
    ).toBe(true)
  })
})
