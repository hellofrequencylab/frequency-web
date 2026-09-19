import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// THE SUBSCRIPTION METADATA ROUND-TRIP (docs/CHECKOUT.md §8, the precondition for converting a
// subscription creator to on-page checkout).
//
// WHY THIS FILE EXISTS. A space membership grants entitlement from metadata, not from a row the
// checkout wrote. `createSpaceMembershipCheckout` stamps `subscription_data.metadata`;
// `lib/billing/space-subscriptions.ts` reads those keys back off the Stripe subscription and uses
// them to decide WHICH member, in WHICH space, gets WHICH tier. Nothing in between is typed:
// `Stripe.Metadata` is `Record<string, string>`, so a renamed or dropped key type-checks perfectly,
// ships, and then silently stops granting access to someone who paid. There is no error, no failed
// build, and no row to notice is missing.
//
// That section names this as the one thing to prove before converting these creators, in those words:
// "prove the metadata round-trips before anything else."
//
// WHAT THIS ASSERTS. Every key the MEMBERSHIP arm of the reconciler reads is a key the creator
// stamps. Not the reverse: the creator may legitimately stamp extra (`kind` is read by the
// dispatcher, and a future key may land before its reader).
//
// WHY IT READS SOURCE TEXT. Calling either side needs a Stripe session, which needs the network and
// a live key, so a unit test cannot observe the real round-trip. The next best thing is to pin the
// two halves against each other and fail when they diverge. Comments are stripped before matching,
// because a key named only in prose is not a key anyone reads (docs/CHECKOUT.md §6: match the act,
// never the identifier, and blank the comments first).

const ROOT = path.join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

/** Strip line and block comments so a key mentioned only in prose never counts as stamped or read. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

const CREATOR_REL = 'lib/billing/space-membership-checkout.ts'
const RECONCILER_REL = 'lib/billing/space-subscriptions.ts'

/** The keys of the `const metadata = { … }` object the creator hands to Stripe. */
function stampedKeys(): string[] {
  const src = code(read(CREATOR_REL))
  const m = src.match(/const\s+metadata\s*=\s*\{([\s\S]*?)\n\s*\}/)
  if (!m) throw new Error('could not find the creator metadata object literal')
  return [...m[1].matchAll(/^\s*([a-z_]+)\s*:/gm)].map((x) => x[1])
}

/** Every `sub.metadata?.<key>` / `subscription.metadata?.<key>` the reconciler reads. */
function readKeys(): string[] {
  const src = code(read(RECONCILER_REL))
  return [
    ...new Set(
      [...src.matchAll(/\b(?:sub|subscription)\.metadata\?\.([a-z_]+)/g)].map((x) => x[1]),
    ),
  ]
}

/** `plan` belongs to the OTHER subscription kind (`space_plan`, a Space's own plan). A membership
 *  session has no plan and must not be expected to stamp one. */
const SPACE_PLAN_ONLY = new Set(['plan'])

describe('the space-membership subscription metadata round-trips', () => {
  const stamped = stampedKeys()
  const reads = readKeys()

  it('reads a real corpus from both halves, so a regex that matched nothing cannot pass', () => {
    // Non-triviality floors. Without these, a renamed `const metadata` or a reshaped read would
    // return [] and every assertion below would pass vacuously, which is the exact shape of guard
    // failure this repo keeps writing ADRs about.
    expect(stamped.length).toBeGreaterThanOrEqual(4)
    expect(reads.length).toBeGreaterThanOrEqual(4)
  })

  it('🔴 stamps every key the membership arm of the reconciler reads', () => {
    const needed = reads.filter((k) => !SPACE_PLAN_ONLY.has(k))
    const missing = needed.filter((k) => !stamped.includes(k))
    expect(
      missing,
      `lib/billing/space-subscriptions.ts reads ${missing.join(', ')} off the subscription ` +
        `metadata, and ${CREATOR_REL} no longer stamps it. Entitlement is granted from these keys, ` +
        `so a member would pay and receive nothing, with no error anywhere.`,
    ).toEqual([])
  })

  it('stamps the four keys entitlement is actually resolved from', () => {
    // Named explicitly rather than derived, so a change that drops a key from BOTH halves at once
    // still fails here. A round-trip test that only compares the two sides agrees with itself when
    // both are wrong.
    for (const key of ['space_id', 'member_id', 'tier_id', 'billing_interval']) {
      expect(stamped, `${key} must be stamped: it is how the webhook knows who to grant`).toContain(
        key,
      )
    }
  })

  it('stamps the kind the dispatcher narrows on', () => {
    // subscriptionKind() returns null for anything but 'space_plan' | 'space_membership', and a null
    // kind means the reconciler ignores the subscription entirely.
    expect(stamped).toContain('kind')
    expect(code(read(CREATOR_REL))).toContain("kind: 'space_membership'")
    expect(code(read(RECONCILER_REL))).toContain("'space_membership'")
  })

  it('hands the metadata to subscription_data, not only to the session', () => {
    // The reconciler reads it off the SUBSCRIPTION. A session-only stamp round-trips through
    // checkout.session.completed and then vanishes, so every later subscription event (renewal,
    // cancellation, a tier switch) arrives with nothing to resolve.
    const src = code(read(CREATOR_REL))
    const block = src.match(/subscription_data:\s*\{([\s\S]*?)\n\s*\}/)
    expect(block, 'subscription_data block not found in the creator').toBeTruthy()
    expect(block![1]).toMatch(/\bmetadata\b/)
  })
})
