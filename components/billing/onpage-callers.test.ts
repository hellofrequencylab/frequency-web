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
  { call: 'startMembershipCheckout(', definition: path.join('upgrade', 'actions.ts') },
  { call: 'startBundleCheckout(', definition: path.join('settings', 'billing', 'actions.ts') },
  { call: 'startSpaceLoadoutCheckout(', definition: path.join('spaces', '[slug]', 'settings', 'billing', 'actions.ts') },
  { call: 'startSpaceMembershipCheckout(', definition: path.join('spaces', 'memberships-actions.ts') },
]

/** The creators themselves. A module that ASKS for elements mode must read what elements returns. */
const CREATORS = [
  'createTicketCheckout(',
  'createTipCheckout(',
  'createSpaceDonationCheckout(',
  'createCommerceCheckout(',
  'createMembershipCheckout(',
  'createBundleCheckout(',
  'createSpaceLoadoutCheckout(',
  'createSpaceMembershipCheckout(',
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

/**
 * Source with comments blanked.
 *
 * 🔴 REQUIRED, not tidiness. The fallback guard below first matched `forceHosted` anywhere in the
 * file and PASSED against a ticket-button reverted to the shipped bug -- because the explanatory
 * comment above the fix still said the word. A guard that is satisfied by a comment describing
 * the fix is the shape-not-truth failure this repo names in four ADRs, and it appeared here in a
 * test written to prevent exactly that.
 */
const code = (f: string) =>
  readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

const callers = ACTIONS.flatMap(({ call, definition }) =>
  ALL.filter((f) => !f.endsWith(definition) && readFileSync(f, 'utf8').includes(call)).map((f) => ({ file: f, call })),
)

describe('every on-page checkout caller handles both session shapes', () => {
  it('found callers at all — a walk that finds nothing would pass vacuously', () => {
    // The floor. Without it this whole file reports a clean bill of health on an empty list,
    // which is the failure mode AGENTS.md names in four ADRs.
    expect(callers.length, 'no on-page checkout callers found; the walk or an action name is wrong').toBeGreaterThan(6)
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
    // ⚠️ Matches anywhere in the `ui:` expression, not just its first token. The first version
    // anchored on `ui: onPageCheckoutAvailable` and matched ZERO modules the moment the
    // forceHosted fix made every call site read `ui: opts?.forceHosted ? 'hosted' : ...`. The
    // floor below is the only reason that was caught rather than passing as a clean bill of health.
    // ⚠️ THREE ways this detector has already been wrong, every one caught by the floor below.
    // (1) Anchored on `ui: onPageCheckoutAvailable`, it matched ZERO modules once the forceHosted
    //     fix made every call site read `ui: opts?.forceHosted ? 'hosted' : ...`.
    // (2) Widened to match anywhere on the line, it matched the CREATORS' own normalisation,
    //     `const ui: CheckoutUi = opts.ui === 'elements' ? ...` -- a declaration, not a call site.
    // (3) A negative lookahead did not fix (2): `\s*` backtracks to zero width, so the lookahead
    //     was evaluated at the space and passed. Regex-golf lost; this is line-wise instead.
    //
    // An option being PASSED, never a variable being declared.
    if (!CREATORS.some((c) => src.includes(c))) return false
    return src.split('\n').some((line) => {
      if (/\b(const|let|var)\s+ui\s*:/.test(line)) return false
      return /\bui:/.test(line) && /(onPageCheckoutAvailable|'elements')/.test(line)
    })
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

describe('a fallback must be able to REACH the hosted page', () => {
  /**
   * 🔴 THIS WAS LIVE IN PRODUCTION ON 2026-09-15, and it is the reason this block exists.
   *
   * Every on-page control has an `onFellBack` escape for when the card form cannot mount. Each one
   * called its action again -- and the action re-read the publishable key, found it still set, and
   * issued ANOTHER elements session. The control then looked for `url`, found none, and showed
   * "Could not start checkout. Please try again." The buyer could not pay by any route, having
   * burned two Stripe sessions and two pending rows per attempt.
   *
   * event_tickets carries the fingerprint: pairs of rows 14-90s apart, one click each.
   *
   * The escape only works if the retry asks for something DIFFERENT, so a control that renders
   * CheckoutPanel must pass `forceHosted` somewhere. This measures that consequence rather than
   * the presence of a fallback function, because a fallback that cannot reach hosted is the bug.
   */
  const mounts = ALL.filter((f) => readFileSync(f, 'utf8').includes('<CheckoutPanel'))

  it('found controls that mount the card form', () => {
    expect(mounts.length, 'nothing renders CheckoutPanel; the walk or the component name is wrong').toBeGreaterThan(2)
  })

  it.each(mounts)('%s can demand a hosted session when the form fails', (file) => {
    const src = code(file)
    expect(
      // The PROPERTY being passed, in real code: `forceHosted:` or `forceHosted,` in an object.
      // A bare mention cannot satisfy it, and neither can a comment (blanked by `code`).
      /\bforceHosted\s*[:,]/.test(src),
      `${file} mounts CheckoutPanel but never passes forceHosted. When its form fails to mount, ` +
        `its fallback asks for the same elements session again, receives another client secret, ` +
        `finds no url and dead-ends the buyer. That exact loop shipped on 2026-09-15.`,
    ).toBe(true)
  })
})

describe('the two slow things overlap', () => {
  /**
   * The owner's report, 2026-09-15: "It took forever for it to load. Then you had to wait for the
   * stripe stuff to load above it."
   *
   * Both halves were real and they were SEQUENTIAL. The server builds a Checkout Session (several
   * reads, a Connect check, a fee calculation, the Stripe call, a reservation), and only once a
   * client secret came back did anything ask for Stripe.js -- so the buyer paid for both waits end
   * to end. `warmStripeBrowser()` starts the download on intent and again at the top of the click
   * handler, so the script arrives while the server is still working.
   *
   * This measures the CONSEQUENCE -- a control that mounts the form must also pre-warm -- rather
   * than that the function exists. Comments are blanked first: a control whose only mention of
   * warming is a comment about warming has not warmed anything.
   */
  const mounts = ALL.filter((f) => readFileSync(f, 'utf8').includes('<CheckoutPanel'))

  it('found controls that mount the card form', () => {
    expect(mounts.length, 'nothing renders CheckoutPanel; the walk or the component name is wrong').toBeGreaterThan(2)
  })

  it.each(mounts)('%s starts Stripe.js before it needs it', (file) => {
    const src = code(file)
    // ⚠️ THE CALL OR THE PROP, never the identifier. A first version accepted
    // `warmStripeBrowser\s*[({=}]` so that it would match a JSX prop -- and the `}` in that class
    // matched the IMPORT LINE's closing brace, so a control that had lost every call still passed.
    // That is the fourth time in this file's history that a guard matched a name somewhere it does
    // nothing. Blanking comments was not enough; an import is not a comment.
    const calls = /warmStripeBrowser\s*\(/.test(src)
    const passedAsHandler = /=\{\s*warmStripeBrowser\s*\}/.test(src)
    expect(
      calls || passedAsHandler,
      `${file} mounts the card form but never calls warmStripeBrowser. Its buyer waits for the ` +
        `session round trip and THEN for Stripe.js, one after the other, which is the lag the ` +
        `owner reported on 2026-09-15.`,
    ).toBe(true)
  })
})
