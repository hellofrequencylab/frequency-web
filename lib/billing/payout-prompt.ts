// THE ONE CONNECT ONBOARDING PROMPT (LIVE-233). PURE: no imports, no IO, safe in a client bundle.
//
// 🔴 WHY THIS FILE EXISTS. Nothing has ever been charged on this platform. Production, 2026-09-08:
// commerce_orders 0, event_tickets 0, space_subscription_items 0, financial_transactions 0, tips 0.
// Five money loops are built and none has completed once, and the diagnosis is not the loops: it is
// that an operator who tries to sell anything hits a dead end unless their Stripe Connect account is
// already onboarded, and NOTHING ever offers to fix it. Five paths each failed their own way:
//
//   memberships → the join card SILENTLY fell back to the free join path (a paid tier became free)
//   bookings    → deposit checkout no-oped and the booking took no deposit
//   orders      → the buyer read "This storefront can't take payment yet", the operator read nothing
//   donations   → there was no checkout at all
//   tickets     → the buyer read "Tickets aren't on sale yet"; the host got a link to another page
//
// Four separate hand-written payout prompts had grown up around that (settings/billing, market
// manage, the shop storefront tab, the event page), each with its own sentence and each pointing at
// /settings/billing rather than starting onboarding. This module is the single source those collapse
// into, exactly as three broadcast-channel literals were de-duplicated in this same rework.
//
// THE FRAME IS A SETUP STEP, NEVER A GATE (lib/events/ticket-eligibility.ts states the ruling at
// length): Stripe will not move money to an unverified account at any price, which is a banking fact
// and not a tier. A gate says "you cannot"; a setup step says "two minutes and you can". Only the
// second one ever gets completed.
//
// PURE ON PURPOSE. The decision is the whole interesting part, the copy has to be identical on five
// surfaces, and one of those surfaces (the event form) is a CLIENT component. Keeping the kernel
// import-free means the same sentence reaches a client price control and a server settings card
// without two copies of it. The IO half lives in ./payout-prompt-resolve.ts.

/** The five money paths. Each one costs an operator the same setup step and gets the same prompt. */
export type PayoutChannel = 'memberships' | 'bookings' | 'orders' | 'donations' | 'tickets'

export const PAYOUT_CHANNELS: readonly PayoutChannel[] = [
  'memberships',
  'bookings',
  'orders',
  'donations',
  'tickets',
]

/** How each channel names itself. `verb` completes "Add a payout account to start ___"; `noun` is the
 *  list form used when a surface covers several channels at once. */
export const PAYOUT_CHANNEL_WORDS: Record<PayoutChannel, { verb: string; noun: string }> = {
  memberships: { verb: 'selling memberships', noun: 'memberships' },
  bookings: { verb: 'taking paid bookings', noun: 'bookings' },
  orders: { verb: 'taking orders', noun: 'orders' },
  donations: { verb: 'taking donations', noun: 'donations' },
  tickets: { verb: 'selling tickets', noun: 'tickets' },
}

/** Join a list in plain English with no serial comma and no dashes: [a] -> "a", [a,b] -> "a and b",
 *  [a,b,c] -> "a, b and c". Pure. */
export function listPhrase(items: string[]): string {
  const clean = items.filter(Boolean)
  if (clean.length === 0) return ''
  if (clean.length === 1) return clean[0]
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`
}

/** De-duplicate + order a channel list the way PAYOUT_CHANNELS declares it, so two surfaces naming
 *  the same set always produce the same sentence. Pure. */
export function normalizeChannels(channels: readonly PayoutChannel[]): PayoutChannel[] {
  const set = new Set(channels)
  return PAYOUT_CHANNELS.filter((c) => set.has(c))
}

/**
 * THE ONE SELLER-FACING SENTENCE. Every seam says this, so the buy path and the price control can
 * never drift apart.
 *
 * CONTENT-VOICE §10: plain, no guilt, names the time cost honestly, narrates no feelings, no em
 * dashes. One channel reads as its verb ("start selling tickets"); several read as a noun list
 * ("start taking money for memberships, bookings and donations").
 */
export function needsPayoutLine(channels: readonly PayoutChannel[]): string {
  const list = normalizeChannels(channels)
  if (list.length === 0) return 'Add a payout account to start taking money. It takes about two minutes, and the money lands in your bank.'
  const what =
    list.length === 1
      ? PAYOUT_CHANNEL_WORDS[list[0]].verb
      : `taking money for ${listPhrase(list.map((c) => PAYOUT_CHANNEL_WORDS[c].noun))}`
  return `Add a payout account to start ${what}. It takes about two minutes, and the money lands in your bank.`
}

/** The tickets seam's long-standing constant, now DERIVED rather than hand-written, so there is
 *  exactly one copy of this sentence in the repo. lib/events/ticket-eligibility.ts re-exports it. */
export const NEEDS_PAYOUT_ACCOUNT = needsPayoutLine(['tickets'])

// ── The decision ────────────────────────────────────────────────────────────────────────────────

/** Where the payee's Stripe account actually is. */
export type PayoutPromptState =
  /** Charges + payouts enabled: money will land. Nothing to prompt. */
  | 'ready'
  /** Onboarding submitted, Stripe still verifying. Nothing for the operator to re-enter yet. */
  | 'in_review'
  /** No account, or an account that never finished the hosted form. THE prompt. */
  | 'needs_setup'
  /** The platform payouts switch is off, so onboarding cannot start yet at any price. */
  | 'not_live'

/** Is the person reading this the person Stripe would pay? Only `self` can act. */
export type PayoutPromptRelation = 'self' | 'other'

/** What the prompt's button does. `none` = there is nothing this reader can press.
 *  `manage` opens the Express dashboard for an account that is already live — the affordance
 *  LIVE-233 dropped when it collapsed four hand-written cards into one prompt, because a prompt
 *  that returns null has no ready state to hang it on. */
export type PayoutPromptAction = 'onboard' | 'resume' | 'manage' | 'none'

/** The payee's mirrored Stripe capability flags (the shape ConnectStatus already has). */
export interface PayoutPayeeStatus {
  accountId: string | null
  onboarded: boolean
  ready: boolean
}

export interface PayoutPromptInput {
  /** The money paths this surface covers. Drives the sentence, nothing else. */
  channels: readonly PayoutChannel[]
  /** The payee's Stripe state, or null when the payee could not be resolved at all. */
  status: PayoutPayeeStatus | null
  /** The platform payouts switch (payoutsLive()). */
  payoutsLive: boolean
  /** Is the reader the payee? A Space admin who is not the OWNER cannot onboard the owner. */
  relation: PayoutPromptRelation
  /** Who gets paid, for the `other` copy. A Space brand name or a display name. */
  payeeName?: string | null
  /** What to say to a payee who is ALREADY READY. `silent` (the default) keeps the nudge semantics
   *  every existing caller has: null, nothing rendered. `status` returns the ready prompt, for a
   *  surface where this card IS the payments UI rather than a banner above other content.
   *
   *  🔴 AN OPT-IN, NOT A FLIP, and the distinction is load-bearing. `/market/manage` renders this
   *  card with NO guard, and a comment there records that losing its standing banner was deliberate.
   *  Making the ready state unconditional would silently put a "you are fine" banner back on that
   *  page. Null-when-ready stays right for a nudge; it was only ever wrong as the ONLY state a
   *  surface has. */
  whenReady?: 'silent' | 'status'
}

export interface PayoutPrompt {
  state: PayoutPromptState
  relation: PayoutPromptRelation
  channels: PayoutChannel[]
  headline: string
  body: string
  action: PayoutPromptAction
  actionLabel: string | null
}

/**
 * Resolve the ONE prompt for a surface, or null when there is nothing to say.
 *
 * 🔴 NULL WHEN READY, and that is a rule rather than an optimisation. The event form used to render
 * "set up a payout account" on `priceMode === 'paid'` alone, so a host who onboarded last week was
 * still told to go and do it: the product not knowing its own user, the same defect class as
 * offering "Sign in" to a signed-in member (ADR-1158). A prompt that fires when it is already
 * satisfied is how a real prompt gets ignored.
 *
 * FAIL-OPEN ON THE PROMPT, never on the money. An unresolvable payee (`status: null`) prompts for
 * setup: telling an operator to check their payout account when it is fine costs one glance, while
 * staying quiet when it is not is the failure that strands a buyer's payment. The BUY paths fail the
 * other way (closed) and always have.
 *
 * PURE and total.
 */
export function payoutPrompt(input: PayoutPromptInput): PayoutPrompt | null {
  const channels = normalizeChannels(input.channels)
  const relation = input.relation
  const who = (input.payeeName ?? '').trim()
  const list = channels.length ? listPhrase(channels.map((c) => PAYOUT_CHANNEL_WORDS[c].noun)) : 'payments'

  // READY. Silent by default, so every surface that treats this card as a nudge is unchanged and
  // `/market/manage` does not grow a standing banner. A surface that opts in gets the one thing the
  // consolidation dropped: a way back to the Stripe dashboard for an account that already works.
  // Placed BEFORE the !payoutsLive check on purpose — a ready account on a dark platform must still
  // read `not_live`, which the truth table already pins.
  if (input.status?.ready && input.payoutsLive) {
    if (input.whenReady !== 'status') return null
    return relation === 'self'
      ? {
          state: 'ready',
          relation,
          channels,
          headline: 'Your payout account is set up',
          body: `Money from ${list} lands in your bank. Open your Stripe dashboard to change your bank details, or to see a payout.`,
          action: 'manage',
          actionLabel: 'Manage payouts',
        }
      : {
          state: 'ready',
          relation,
          channels,
          headline: 'This space is set up to get paid',
          // No button: openPayoutDashboard resolves the CALLER's account, so handing an admin one
          // would open the wrong Stripe account or fail. Same reason `needs_setup` gives them none.
          body: `${who || 'The owner'} has a payout account, so your ${list} can take money. Payouts land in their bank.`,
          action: 'none',
          actionLabel: null,
        }
  }

  // The platform switch is off. Say so plainly rather than offering a button that cannot work:
  // createOnboardingLink returns null while payouts are dark, so the button would fail silently.
  if (!input.payoutsLive) {
    return {
      state: 'not_live',
      relation,
      channels,
      headline: 'Payments are not turned on yet',
      body: `You can set up your ${list} now. Payouts go live with the rest of billing, and this is where you will connect the account they land in.`,
      action: 'none',
      actionLabel: null,
    }
  }

  // Submitted and waiting on Stripe. There is nothing to re-enter, so do not ask for anything.
  if (input.status?.onboarded && !input.status.ready) {
    return {
      state: 'in_review',
      relation,
      channels,
      headline: 'Stripe is checking your details',
      body:
        relation === 'self'
          ? `Your payout account is submitted. This usually clears quickly, and your ${list} start taking money the moment it does.`
          : `${who || 'The owner'} has submitted a payout account and Stripe is verifying it. Your ${list} start taking money the moment it clears.`,
      action: relation === 'self' ? 'resume' : 'none',
      actionLabel: relation === 'self' ? 'Finish payout setup' : null,
    }
  }

  // The real case: no account, or one that never finished the hosted form.
  if (relation === 'other') {
    return {
      state: 'needs_setup',
      relation,
      channels,
      headline: 'This space cannot get paid yet',
      body: `${who || 'The owner'} is who Stripe pays, so their payout account is the one that has to exist. Ask them to add it and your ${list} can take money. It takes about two minutes.`,
      action: 'none',
      actionLabel: null,
    }
  }

  return {
    state: 'needs_setup',
    relation,
    channels,
    headline: 'Add a payout account to get paid',
    body: needsPayoutLine(channels),
    action: 'onboard',
    actionLabel: input.status?.accountId ? 'Finish payout setup' : 'Set up payouts',
  }
}
