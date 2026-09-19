import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// THE THREE SUBSCRIPTION CREATORS LIVE-359 CONVERTED (Crew, household bundle, Space plan).
//
// Space membership already ran this conversion; these three still redirected. The compiler cannot
// see any of it: `stripe` ships no type declarations, so a `success_url` under ui_mode elements
// or a dropped subscription_data.metadata key is a RUNTIME failure that silently stops granting
// access to someone who paid (docs/CHECKOUT.md §8). Comments are stripped first.

const ROOT = path.join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

const CREATORS = [
  {
    file: 'lib/billing/checkout.ts',
    create: 'createMembershipCheckout(',
    record: 'recordCrewCheckoutFromSessionId(',
    reconciler: 'confirmCheckout(',
    kindless: true,
  },
  {
    file: 'lib/billing/bundle-checkout.ts',
    create: 'createBundleCheckout(',
    record: 'recordBundleFromSessionId(',
    reconciler: 'reconcileBundleSubscription(',
    kindless: false,
  },
  {
    file: 'lib/billing/space-plan-checkout.ts',
    create: 'createSpaceLoadoutCheckout(',
    record: 'recordSpacePlanFromSessionId(',
    reconciler: 'routeSpaceSubscription(',
    kindless: false,
  },
] as const

const ACTIONS = [
  {
    file: 'app/(main)/upgrade/actions.ts',
    settle: 'settleMembershipCheckoutAction(',
    record: 'recordCrewCheckoutFromSessionId(',
  },
  {
    file: 'app/(main)/settings/billing/actions.ts',
    settle: 'settleBundleCheckoutAction(',
    record: 'recordBundleFromSessionId(',
  },
  {
    file: 'app/(main)/spaces/[slug]/settings/billing/actions.ts',
    settle: 'settleSpaceLoadoutAction(',
    record: 'recordSpacePlanFromSessionId(',
  },
] as const

const DOORS = [
  'app/(main)/upgrade/pwyw-picker.tsx',
  'app/(main)/settings/billing/bundle-offer-controls.tsx',
  'app/(main)/spaces/[slug]/settings/billing/choose-plan.tsx',
  'app/(main)/spaces/[slug]/settings/billing/go-business.tsx',
] as const

describe('the remaining subscription creators issue an on-page session (LIVE-359)', () => {
  it.each(CREATORS.map((c) => [c.file, c.create]))('%s routes both halves through the seam', (file) => {
    const src = code(read(file as string))
    expect(src).toContain('checkoutReturnFields(')
    expect(src).toContain('resolveCheckoutSession(')
  })

  it.each(CREATORS.map((c) => [c.file, c.record, c.reconciler]))(
    '%s settles through the webhook reconciler, not a second writer',
    (file, record, reconciler) => {
      const src = code(read(file as string))
      expect(src, `${file} lost its on-page recorder`).toContain(record)
      expect(src, `${file} no longer calls ${reconciler}`).toContain(reconciler)
    },
  )

  it('Crew stays kind-less, which is the member-entitlement allowlist (SCAN-541)', () => {
    const src = code(read('lib/billing/checkout.ts'))
    const create = src.slice(src.indexOf('export async function createMembershipCheckout'))
    const block = create.slice(0, create.indexOf('export async function recordCrewCheckoutFromSessionId'))
    expect(block).not.toMatch(/\bkind\s*:/)
    expect(block).toContain('subscription_data:')
    expect(block).toContain('profile_id:')
    expect(block).toContain('pwyw_amount_cents:')
  })
})

describe('the actions hand both shapes back and settle after a charge', () => {
  it.each(ACTIONS.map((a) => [a.file, a.settle, a.record]))('%s', (file, settle, record) => {
    const src = code(read(file as string))
    expect(src).toContain(settle)
    expect(src).toContain(record)
    expect(src).toContain('forceHosted')
    expect(src).toContain('onPageCheckoutAvailable()')
    expect(src).toMatch(/\.clientSecret\b/)
    expect(src).toMatch(/\bwhenUnconfigured:\s*'allow'/)
  })
})

describe('the buy controls mount the form, can force hosted, and settle', () => {
  it.each(DOORS)('%s', (file) => {
    const src = code(read(file))
    expect(src).toContain('<CheckoutPanel')
    expect(src).toMatch(/\bforceHosted\s*[:,]/)
    expect(src).toMatch(/onPaid=\{/)
    expect(src).toMatch(/warmStripeBrowser\s*\(/)
  })
})
