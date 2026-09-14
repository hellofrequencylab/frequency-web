import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'

// THE ONE CONNECT PROMPT, MEASURED (LIVE-233). Two halves, because the row has two claims:
//
//   1. SOURCE SHAPE. Each of the five money paths (memberships, bookings, orders, donations,
//      tickets) reaches the SHARED prompt module at the operator's first sell attempt, and names
//      its own channel to it. The row was closed by #2507 and then sat `open` with a manual probe
//      for six days; this pins the consequence so the next hand-written payout card fails here
//      rather than in a walk nobody does.
//
//   2. BEHAVIOUR. The rendered component offers onboarding to the payee who can act, renders
//      NOTHING for a payee who is already ready (ADR-1158: never ask twice), and hands a viewer
//      who is not the payee no onboarding call at all. The kernel's truth table lives in
//      payout-prompt.test.ts; this file proves the Server Component honours it end to end, with
//      the two reads (the platform switch and the mirrored Stripe flags) stubbed at the seam.

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const PROMPT_MODULE = 'components/billing/payout-setup-prompt'

/** Where an operator first tries to sell on each path, and the file that renders the prompt there.
 *  Three paths share Offerings because that is where their prices are set (SECTION_CHANNEL). */
const SELL_PATHS: { channel: string; file: string }[] = [
  { channel: 'memberships', file: 'app/(main)/spaces/[slug]/settings/offerings/offerings-body.tsx' },
  { channel: 'bookings', file: 'app/(main)/spaces/[slug]/settings/offerings/offerings-body.tsx' },
  { channel: 'donations', file: 'app/(main)/spaces/[slug]/settings/offerings/offerings-body.tsx' },
  { channel: 'orders', file: 'app/(main)/spaces/[slug]/settings/shop/storefront-tab.tsx' },
  { channel: 'tickets', file: 'app/(main)/events/[slug]/page.tsx' },
]

describe('every sell path reaches the one Connect prompt (source shape)', () => {
  for (const { channel, file } of SELL_PATHS) {
    it(`${channel}: ${file} imports the shared prompt and names its channel`, () => {
      const src = read(file)
      expect(src, `${file} must import ${PROMPT_MODULE}`).toContain(PROMPT_MODULE)
      expect(src, `${file} must pass the '${channel}' channel`).toMatch(new RegExp(`['"]${channel}['"]`))
    })
  }

  it('the maker Market console (orders for a PROFILE payee) renders the same card from the pure kernel', () => {
    const src = read('app/(main)/market/manage/page.tsx')
    expect(src).toContain("from '@/lib/billing/payout-prompt'")
    expect(src).toContain('PayoutPromptCard')
    expect(src).toMatch(/channels:\s*\['orders'\]/)
  })

  it('no sell path links an operator to /settings/billing instead of starting onboarding inline', () => {
    // The four hand-written cards each ended in a link to the billing page. The shared card posts
    // to the onboarding action instead; a surface that re-grows the link has re-grown the dead end.
    for (const file of new Set(SELL_PATHS.map((p) => p.file))) {
      const src = read(file)
      expect(src, `${file} links to /settings/billing`).not.toMatch(/href=["'`]\/settings\/billing/)
    }
  })

  it('the tickets seam derives its seller line from the kernel rather than carrying its own copy', () => {
    const src = read('lib/events/ticket-eligibility.ts')
    expect(src).toContain("import { NEEDS_PAYOUT_ACCOUNT } from '@/lib/billing/payout-prompt'")
    expect(src).not.toMatch(/NEEDS_PAYOUT_ACCOUNT\s*=\s*['"`]/)
  })
})

// ── Behaviour ─────────────────────────────────────────────────────────────────────────────────

const { getConnectStatus, payoutsLive, getCallerProfile } = vi.hoisted(() => ({
  getConnectStatus: vi.fn(),
  payoutsLive: vi.fn(),
  getCallerProfile: vi.fn(),
}))

vi.mock('@/lib/billing/connect', () => ({ getConnectStatus, payoutsLive }))
vi.mock('@/lib/auth', () => ({ getCallerProfile, getMyProfileId: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
// The buttons are client components that import a 'use server' module; the card's contract is
// WHICH button it renders, so a stub that prints the label is the whole thing under test.
vi.mock('@/components/billing/payout-controls', () => ({
  StartPayoutButton: ({ label }: { label?: string }) => (
    <button data-action="onboard">{label ?? 'Set up payouts'}</button>
  ),
  ManagePayoutButton: () => <button data-action="manage">Manage payouts</button>,
}))

import { SpacePayoutSetupPrompt, PayoutSetupPrompt } from '@/components/billing/payout-setup-prompt'

const OWNER = 'owner-1'
const ADMIN = 'admin-2'
const SPACE = { ownerProfileId: OWNER, name: 'Riverbend Studio', brandName: null }

function status(over: Partial<{ accountId: string | null; onboarded: boolean; ready: boolean }> = {}) {
  return {
    accountId: null,
    chargesEnabled: false,
    payoutsEnabled: false,
    detailsSubmitted: false,
    onboarded: false,
    ready: false,
    ...over,
  }
}

async function html(el: Promise<React.ReactElement>) {
  return renderToStaticMarkup(await el)
}

beforeEach(() => {
  vi.clearAllMocks()
  payoutsLive.mockResolvedValue(true)
  getConnectStatus.mockResolvedValue(status())
})

describe('SpacePayoutSetupPrompt (the space OWNER is the payee)', () => {
  it('offers the owner inline onboarding when no account is onboarded', async () => {
    const out = await html(
      SpacePayoutSetupPrompt({ space: SPACE, viewerProfileId: OWNER, channels: ['memberships', 'bookings', 'donations'] }),
    )
    expect(out).toContain('Add a payout account to get paid')
    expect(out).toContain('taking money for memberships, bookings and donations')
    expect(out).toContain('data-action="onboard"')
    expect(out).toContain('Set up payouts')
    expect(getConnectStatus).toHaveBeenCalledWith(OWNER)
  })

  it('says FINISH when an account exists but never completed the hosted form', async () => {
    getConnectStatus.mockResolvedValue(status({ accountId: 'acct_1' }))
    const out = await html(SpacePayoutSetupPrompt({ space: SPACE, viewerProfileId: OWNER, channels: ['orders'] }))
    expect(out).toContain('Finish payout setup')
    expect(out).toContain('data-action="onboard"')
  })

  it('renders NOTHING when the owner is already ready and payouts are live', async () => {
    getConnectStatus.mockResolvedValue(status({ accountId: 'acct_1', onboarded: true, ready: true }))
    const out = await html(SpacePayoutSetupPrompt({ space: SPACE, viewerProfileId: OWNER, channels: ['orders'] }))
    expect(out).toBe('')
  })

  it('shows a ready owner the dashboard, never onboarding, when a surface opts into status', async () => {
    getConnectStatus.mockResolvedValue(status({ accountId: 'acct_1', onboarded: true, ready: true }))
    const out = await html(
      SpacePayoutSetupPrompt({ space: SPACE, viewerProfileId: OWNER, channels: ['orders'], whenReady: 'status' }),
    )
    expect(out).toContain('Your payout account is set up')
    expect(out).toContain('data-action="manage"')
    expect(out).not.toContain('data-action="onboard"')
  })

  it('hands a viewer who is NOT the payee no onboarding call, and names the space instead', async () => {
    const out = await html(SpacePayoutSetupPrompt({ space: SPACE, viewerProfileId: ADMIN, channels: ['donations'] }))
    expect(out).toContain('This space cannot get paid yet')
    expect(out).toContain('Riverbend Studio is who Stripe pays')
    expect(out).not.toContain('data-action=')
    expect(out).not.toContain('Set up payouts')
  })

  it('offers no button at all while the platform payouts switch is off', async () => {
    payoutsLive.mockResolvedValue(false)
    const out = await html(SpacePayoutSetupPrompt({ space: SPACE, viewerProfileId: OWNER, channels: ['tickets'] }))
    expect(out).toContain('Payments are not turned on yet')
    expect(out).not.toContain('data-action=')
  })

  it('asks for nothing to re-enter while Stripe is still verifying', async () => {
    getConnectStatus.mockResolvedValue(status({ accountId: 'acct_1', onboarded: true, ready: false }))
    const out = await html(SpacePayoutSetupPrompt({ space: SPACE, viewerProfileId: OWNER, channels: ['bookings'] }))
    expect(out).toContain('Stripe is checking your details')
    expect(out).toContain('Finish payout setup')
    expect(out).not.toContain('Add a payout account')
  })
})

describe('PayoutSetupPrompt (a PROFILE payee: a personal event, a maker listing)', () => {
  it('offers the host inline onboarding for tickets', async () => {
    const out = await html(PayoutSetupPrompt({ payeeProfileId: OWNER, viewerProfileId: OWNER, channels: ['tickets'] }))
    expect(out).toContain('Add a payout account to start selling tickets')
    expect(out).toContain('data-action="onboard"')
  })

  it('renders nothing for a ready host', async () => {
    getConnectStatus.mockResolvedValue(status({ accountId: 'acct_1', onboarded: true, ready: true }))
    const out = await html(PayoutSetupPrompt({ payeeProfileId: OWNER, viewerProfileId: OWNER, channels: ['tickets'] }))
    expect(out).toBe('')
  })

  it('gives a viewer who is not the host no button', async () => {
    const out = await html(
      PayoutSetupPrompt({ payeeProfileId: OWNER, viewerProfileId: ADMIN, channels: ['tickets'], payeeName: 'Ada' }),
    )
    expect(out).toContain('Ada is who Stripe pays')
    expect(out).not.toContain('data-action=')
  })

  it('never carries an em dash on any rendered arm (CONTENT-VOICE §10)', async () => {
    const arms = [
      html(PayoutSetupPrompt({ payeeProfileId: OWNER, viewerProfileId: OWNER, channels: ['tickets'] })),
      html(PayoutSetupPrompt({ payeeProfileId: OWNER, viewerProfileId: ADMIN, channels: ['tickets'] })),
    ]
    for (const out of await Promise.all(arms)) expect(out).not.toContain('—')
  })
})
