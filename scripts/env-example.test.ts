import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// 2026-09-05 (scan2 L3-04 / L3-05 / L3-08). .env.example is the environment contract a new
// deploy is copied from, and the file had drifted from the code in three ways:
//   * "dark unless set" keys shipped with truthy placeholders, so a copied env turned every
//     env-gated feature ON with junk credentials, inverting the documented degrade paths;
//   * four Stripe knobs were documented that no code reads, and the platform fee example (10)
//     disagreed with the code default (3);
//   * a dozen keys that scripts and CI read were documented nowhere.
// Each assertion below measures the file, not its prose: a key is blank, absent, or present.

const src = readFileSync('.env.example', 'utf8')

/** The value of KEY's uncommented assignment, or null when the key has no such line. */
function valueOf(key: string): string | null {
  const m = src.match(new RegExp(`^${key}=(.*)$`, 'm'))
  return m ? m[1].trim() : null
}

// Every key a truthy `process.env.X` check turns a feature ON with. The reader is named so the
// next person can verify the gate is still a bare truthiness check before adding to the list.
const DARK_UNLESS_SET = [
  'STRIPE_SECRET_KEY', // lib/billing/stripe.ts billingEnabled()
  'STRIPE_WEBHOOK_SECRET', // lib/billing/stripe.ts (webhook route 503s without it)
  'ANTHROPIC_API_KEY', // lib/ai aiEnabled()
  'RESEND_API_KEY', // lib/email.ts getClient()
  'RESEND_WEBHOOK_SECRET', // app/api/webhooks/resend/route.ts
  'GOOGLE_WALLET_ISSUER_ID', // lib/wallet/google.ts isGoogleWalletConfigured()
  'GOOGLE_WALLET_SA_EMAIL',
  'GOOGLE_WALLET_SA_PRIVATE_KEY',
  'GOOGLE_MAPS_API_KEY', // app/api/geocode/venues/route.ts prefers Google when set
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY', // lib/push.ts configure()
  'VAPID_PRIVATE_KEY',
]

describe('.env.example ships every dark-unless-set key BLANK', () => {
  for (const key of DARK_UNLESS_SET) {
    it(`${key} is present and blank`, () => {
      expect(valueOf(key)).toBe('')
    })
  }
})

describe('.env.example documents only Stripe knobs the code reads', () => {
  for (const key of ['STRIPE_PRICE_CREW', 'STRIPE_PRICE_SUPPORTER', 'STRIPE_MEMBERSHIP_AMOUNT', 'STRIPE_SUPPORTER_AMOUNT']) {
    it(`${key} has no assignment line`, () => {
      expect(valueOf(key)).toBeNull()
    })
  }

  it('STRIPE_PLATFORM_FEE_PCT matches the code default (lib/billing/fees.ts platformFeePct)', () => {
    expect(valueOf('STRIPE_PLATFORM_FEE_PCT')).toBe('3')
  })
})

describe('.env.example names the keys scripts and CI read', () => {
  for (const key of [
    'SENTRY_DSN',
    'NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA',
    'DEMO_OWNER_PROFILE_ID',
    'PERF_BASELINE_BASE_URL',
    'PERF_BASELINE_SAMPLES',
    'PERF_BASELINE_WARMUP',
    'SUPABASE_MONTHLY_SPEND_USD',
    'VERCEL_MONTHLY_SPEND_USD',
    'ANTHROPIC_MONTHLY_SPEND_USD',
    'RESEND_MONTHLY_SPEND_USD',
    'UPSTASH_MONTHLY_SPEND_USD',
    'BASELINE_ACTIVE_MEMBERS',
    'SUPABASE_ACCESS_TOKEN',
    'SUPABASE_PROJECT_REF',
    'MIGRATION_LEDGER_JSON',
    'PW_BASE_URL',
    'PW_MEMBER_EMAIL',
    'PW_ROOM_PATH',
    'PW_SPACE_SLUG',
    'PW_STORAGE_STATE',
    'PW_REQUIRE_SHELL',
    'VERCEL_AUTOMATION_BYPASS_SECRET',
  ]) {
    it(`${key} is documented, blank`, () => {
      expect(valueOf(key)).toBe('')
    })
  }
})
