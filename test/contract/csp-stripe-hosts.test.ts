import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ── The Stripe half of the enforced CSP (ADR-1369, checkout Phase 1) ────────────────────────────
//
// THE FAILURE THIS EXISTS FOR, and it is the one an integration cannot see coming: the CSP in
// next.config.ts is ENFORCED, it is a single joined string, and a host that is missing from it does
// not throw anywhere in our code. Stripe.js simply never loads, or loads and mounts an Element that
// is a blank rectangle, or takes a card right up to a 3D Secure challenge that cannot open. The
// browser says so in a console line and a report to /api/csp-report; no test, gate or type does.
//
// So the host set is pinned HERE, per directive, rather than left to a reviewer reading a 400-char
// string. Every assertion below fails against the tree before that ADR, which is what makes it a
// gate and not a restatement.
//
// The counterpart for media embeds is lib/spotlight/embeds.test.ts (frame-src by containment) and
// for Google Maps components/maps/maps-wiring.test.ts. Same shape, different vendor.

const CONFIG = readFileSync(path.join(__dirname, '..', '..', 'next.config.ts'), 'utf8')

/**
 * The sources declared for one directive, as the browser would read them.
 *
 * Parsed from the line rather than from a built string because `script-src` is a TEMPLATE literal
 * ('unsafe-eval' is dev-only), so there is no plain quoted line to match and a naive
 * /"script-src ([^"]+)"/ finds nothing at all — it would report an EMPTY source list and pass every
 * "is not present" assertion while the directive said anything it liked.
 */
function sources(directive: string): string[] {
  const line = CONFIG.split('\n').find((l) => new RegExp('^["`]' + directive + ' ').test(l.trim()))
  expect(line, `${directive} is not declared in next.config.ts`).toBeDefined()
  const body = (line as string).trim().replace(/^["`]/, '').replace(/["`],?$/, '')
  // Drop any `${...}` interpolation (the dev-only 'unsafe-eval'), then the directive name itself.
  return body.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean).slice(1)
}

describe('CSP — the on-page Stripe host set (ui_mode: custom)', () => {
  it('script-src loads Stripe.js and frame-src lets it mount an Element', () => {
    // Both, or nothing: script-src alone loads the library and then blanks every field, because an
    // Element is an iframe served from the same host as the script.
    expect(sources('script-src')).toContain('https://js.stripe.com')
    expect(sources('frame-src')).toContain('https://js.stripe.com')
  })

  it('frame-src carries the authentication frame, which a clean card never requests', () => {
    // hooks.stripe.com only appears on a 3DS challenge or a redirect method. It cannot be added
    // "when we see it fail", because the first time we see it fail is a real payment.
    expect(sources('frame-src')).toContain('https://hooks.stripe.com')
  })

  it('connect-src carries every XHR the browser half makes', () => {
    const connect = sources('connect-src')
    expect(connect).toContain('https://api.stripe.com')
    expect(connect).toContain('https://merchant-ui-api.stripe.com')
  })

  it('img-src needs no Stripe host, and this is why — the blanket https: source covers them', () => {
    // The "no change needed" claim in the audit comment, pinned. Stripe serves wallet marks and
    // card-brand art from https://*.stripe.com; narrowing img-src later is what would break
    // checkout, so this fails with Stripe's name on it rather than as a mystery.
    const img = sources('img-src')
    expect(img).toContain('https:')
    expect(img.some((s) => s.includes('stripe'))).toBe(false)
  })

  it('keeps the directives Stripe depends on but does not name', () => {
    // Stripe.js builds workers from blobs. A MISSING worker-src falls back to script-src, which is
    // the most reported Stripe CSP failure of all; ours is explicit and must stay so.
    expect(sources('worker-src')).toContain('blob:')
    // The reporting channel is the ONLY thing that will tell us a Stripe host is missing in
    // production, so an enforced policy without it is a silent one.
    expect(CONFIG).toContain("'report-uri /api/csp-report'")
  })

  it('names the hosts exactly, never a Stripe wildcard', () => {
    // `https://*.stripe.com` in script-src or frame-src would quietly grant every Stripe subdomain
    // script and framing rights on our origin. The audited set is five names.
    for (const directive of ['script-src', 'frame-src', 'connect-src']) {
      expect(sources(directive), directive).not.toContain('https://*.stripe.com')
    }
  })

  it('leaves the fail-soft beacons OUT until a CSP report proves one fires', () => {
    // Telemetry and fraud signals (a blocked one costs a Radar signal and a console line, never a
    // payment). If you are adding one, you have a report from /api/csp-report naming it: take it
    // off this list AND out of the "deliberately left out" paragraph in next.config.ts, together.
    const declared = new Set([...sources('script-src'), ...sources('frame-src'), ...sources('connect-src')])
    for (const beacon of [
      'https://q.stripe.com',
      'https://r.stripe.com',
      'https://errors.stripe.com',
      'https://m.stripe.com',
      'https://m.stripe.network',
    ]) {
      expect(declared.has(beacon), `${beacon} is allowlisted but the audit comment says it is not`).toBe(false)
    }
  })
})

describe('CSP — the parser this file depends on', () => {
  // A source list that comes back empty passes every "does not contain" assertion above, so the
  // reader itself gets a positive control: these are hosts the policy has carried for months.
  it('reads a template-literal directive and a plain quoted one', () => {
    expect(sources('script-src')).toContain('https://www.googletagmanager.com')
    expect(sources('connect-src')).toContain('https://tiles.openfreemap.org')
    expect(sources('frame-src')).toContain("'self'")
  })
})
