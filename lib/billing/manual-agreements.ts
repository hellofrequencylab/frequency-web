// MANUAL BILLING AGREEMENTS (ADR-872). The durable record of an OFF-STRIPE deal: a Space that
// pays cash (or check/transfer) for a plan, at a locked rate, on a real calendar. Today "the
// space's plan is the payment state-of-record" (lib/billing/space-subscriptions.ts) and every
// renewal path assumes Stripe; this table is where a cash deal's money memory lives, WITHOUT
// touching the plan/entitlement authority: staff still set `spaces.plan` (the access authority),
// and the agreement records what was paid, at what locked rate, through when.
//
// The reminder ladder (30-day / 7-day / overdue, one notice each) is driven by the
// billing-renewals cron off the three per-row stamps; the PURE window/date math lives in
// ./manual-agreement-dates.ts so it is unit-testable without a clock or a database.
//
// Server-only (service-role admin client). The table is not in the generated types yet
// (ADR-246), so it is reached untyped like its sibling space_subscription_items. Writes are
// staff/cron-mediated only (RLS grants no client write); reads on the owner surface flow through
// the already-gated billing body.

import { createAdminClient } from '@/lib/supabase/admin'
import { SPACE_PLANS, type SpacePlan } from '@/lib/pricing/plans'
import {
  addInterval,
  bucketAgreementsDue,
  parseDateUTC,
  type AgreementInterval,
} from './manual-agreement-dates'

/** How a manual agreement is settled. */
export const AGREEMENT_METHODS = ['cash', 'check', 'transfer', 'other'] as const
export type AgreementMethod = (typeof AGREEMENT_METHODS)[number]

/** The agreement lifecycle. 'active' drives reminders; 'canceled'/'settled' are history. */
export const AGREEMENT_STATUSES = ['active', 'canceled', 'settled'] as const
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number]

/** A manual billing agreement row, camelCased. Dates are YYYY-MM-DD; stamps are ISO instants. */
export interface ManualAgreement {
  id: string
  spaceId: string
  plan: SpacePlan
  interval: AgreementInterval
  amountCents: number
  method: AgreementMethod
  label: string | null
  startedAt: string
  paidThrough: string
  reminder30SentAt: string | null
  reminder7SentAt: string | null
  overdueNoticeSentAt: string | null
  status: AgreementStatus
  note: string | null
}

type AgreementRow = {
  id: string
  space_id: string
  plan: string
  interval: string
  amount_cents: number
  method: string
  label: string | null
  started_at: string
  paid_through: string
  reminder_30_sent_at: string | null
  reminder_7_sent_at: string | null
  overdue_notice_sent_at: string | null
  status: string
  note: string | null
}

function mapRow(r: AgreementRow): ManualAgreement {
  return {
    id: r.id,
    spaceId: r.space_id,
    plan: r.plan as SpacePlan,
    interval: r.interval === 'month' ? 'month' : 'year',
    amountCents: r.amount_cents,
    method: (AGREEMENT_METHODS as readonly string[]).includes(r.method)
      ? (r.method as AgreementMethod)
      : 'other',
    label: r.label,
    startedAt: r.started_at,
    paidThrough: r.paid_through,
    reminder30SentAt: r.reminder_30_sent_at,
    reminder7SentAt: r.reminder_7_sent_at,
    overdueNoticeSentAt: r.overdue_notice_sent_at,
    status: (AGREEMENT_STATUSES as readonly string[]).includes(r.status)
      ? (r.status as AgreementStatus)
      : 'canceled',
    note: r.note,
  }
}

// The generated types don't know the table yet (ADR-246): a narrow untyped facade, like the
// sibling space_subscription_items readers use.
type Db = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c1: string, v1: string) => {
        eq: (c2: string, v2: string) => {
          maybeSingle: () => Promise<{ data: unknown; error: unknown }>
        }
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>
      }
      lte: (c1: string, v1: string) => {
        eq: (c2: string, v2: string) => Promise<{ data: unknown[] | null; error: unknown }>
      }
    }
    insert: (rows: Record<string, unknown>[]) => {
      select: (c: string) => { maybeSingle: () => Promise<{ data: unknown; error: { code?: string; message?: string } | null }> }
    }
    update: (v: Record<string, unknown>) => {
      eq: (c: string, v2: string) => { select: (c2: string) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> } }
    }
  }
}

function db(): Db {
  return createAdminClient() as unknown as Db
}

const SELECT_COLS =
  'id, space_id, plan, interval, amount_cents, method, label, started_at, paid_through, reminder_30_sent_at, reminder_7_sent_at, overdue_notice_sent_at, status, note'

/** The Space's ACTIVE agreement, or null (none, or the table/read failed - fail-safe: no
 *  agreement renders nothing and reminds no one). The partial unique index guarantees at most
 *  one. */
export async function activeAgreementForSpace(spaceId: string | null | undefined): Promise<ManualAgreement | null> {
  if (!spaceId) return null
  try {
    const { data } = await db()
      .from('space_billing_agreements')
      .select(SELECT_COLS)
      .eq('space_id', spaceId)
      .eq('status', 'active')
      .maybeSingle()
    return data ? mapRow(data as AgreementRow) : null
  } catch {
    return null
  }
}

/** What the crew records to open a manual deal. */
export interface CreateAgreementInput {
  spaceId: string
  plan: SpacePlan | string
  interval: AgreementInterval | string
  amountCents: number
  method: AgreementMethod | string
  label?: string | null
  startedAt: string
  paidThrough: string
  note?: string | null
}

export type AgreementResult = { ok: true; agreement: ManualAgreement } | { ok: false; error: string }

/** Record a manual agreement (staff seed path). Validates every field against the table's CHECKs
 *  so a bad form is a sentence, not a constraint error; refuses a second ACTIVE agreement for the
 *  same Space (pre-check plus the 23505 from the partial unique index, for the race). Does NOT
 *  touch spaces.plan: the plan column stays the access authority, set separately. */
export async function createManualAgreement(input: CreateAgreementInput): Promise<AgreementResult> {
  const plan = input.plan as SpacePlan
  if (!(SPACE_PLANS as readonly string[]).includes(plan) || plan === 'free') {
    return { ok: false, error: 'Pick a paid plan for the agreement.' }
  }
  if (input.interval !== 'month' && input.interval !== 'year') {
    return { ok: false, error: 'The interval must be month or year.' }
  }
  const interval: AgreementInterval = input.interval
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    return { ok: false, error: 'The amount must be zero or more, in cents.' }
  }
  if (!(AGREEMENT_METHODS as readonly string[]).includes(input.method)) {
    return { ok: false, error: 'Unknown payment method.' }
  }
  if (!parseDateUTC(input.startedAt) || !parseDateUTC(input.paidThrough)) {
    return { ok: false, error: 'Dates must be real YYYY-MM-DD dates.' }
  }
  if (!input.spaceId) return { ok: false, error: 'We could not find that space.' }

  const existing = await activeAgreementForSpace(input.spaceId)
  if (existing) {
    return { ok: false, error: 'That space already has an active agreement. Settle or cancel it first.' }
  }

  const { data, error } = await db()
    .from('space_billing_agreements')
    .insert([
      {
        space_id: input.spaceId,
        plan,
        interval,
        amount_cents: input.amountCents,
        method: input.method,
        label: input.label?.trim() || null,
        started_at: input.startedAt,
        paid_through: input.paidThrough,
        note: input.note?.trim() || null,
        status: 'active',
      },
    ])
    .select(SELECT_COLS)
    .maybeSingle()

  if (error) {
    // The partial unique index catching a concurrent insert reads as the same refusal.
    if (error.code === '23505') {
      return { ok: false, error: 'That space already has an active agreement. Settle or cancel it first.' }
    }
    return { ok: false, error: 'Could not record the agreement.' }
  }
  if (!data) return { ok: false, error: 'Could not record the agreement.' }
  return { ok: true, agreement: mapRow(data as AgreementRow) }
}

/** Record a renewal payment on an active agreement: paid_through extends by ONE interval and all
 *  three reminder stamps clear, re-arming the ladder for the next cycle. Refuses a missing or
 *  non-active agreement. */
export async function recordManualPayment(agreementId: string): Promise<AgreementResult> {
  if (!agreementId) return { ok: false, error: 'We could not find that agreement.' }
  const { data } = await db()
    .from('space_billing_agreements')
    .select(SELECT_COLS)
    .eq('id', agreementId)
    .maybeSingle()
  if (!data) return { ok: false, error: 'We could not find that agreement.' }
  const current = mapRow(data as AgreementRow)
  if (current.status !== 'active') {
    return { ok: false, error: 'Only an active agreement can take a payment.' }
  }
  const nextPaidThrough = addInterval(current.paidThrough, current.interval)
  if (!nextPaidThrough) return { ok: false, error: 'The agreement has a bad paid-through date.' }

  const { data: updated, error } = await db()
    .from('space_billing_agreements')
    .update({
      paid_through: nextPaidThrough,
      reminder_30_sent_at: null,
      reminder_7_sent_at: null,
      overdue_notice_sent_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', agreementId)
    .select(SELECT_COLS)
    .maybeSingle()
  if (error || !updated) return { ok: false, error: 'Could not record the payment.' }
  return { ok: true, agreement: mapRow(updated as AgreementRow) }
}

/** Every ACTIVE agreement owed a reminder touch at `now`, batched into the ladder's three
 *  buckets. ONE bounded read (active rows whose paid_through is inside the widest window,
 *  paid_through <= now+30d), then the pure classifier. Fail-safe to empty buckets: a read error
 *  reminds no one rather than double-sending. */
export async function agreementsDue(now: Date): Promise<{
  reminder30: ManualAgreement[]
  reminder7: ManualAgreement[]
  overdue: ManualAgreement[]
}> {
  try {
    const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const horizonISO = `${horizon.getUTCFullYear()}-${String(horizon.getUTCMonth() + 1).padStart(2, '0')}-${String(horizon.getUTCDate()).padStart(2, '0')}`
    const { data } = await db()
      .from('space_billing_agreements')
      .select(SELECT_COLS)
      .lte('paid_through', horizonISO)
      .eq('status', 'active')
    const agreements = ((data ?? []) as AgreementRow[]).map(mapRow)
    return bucketAgreementsDue(agreements, now)
  } catch {
    return { reminder30: [], reminder7: [], overdue: [] }
  }
}

/** Stamp ONE reminder touch as sent (idempotency for the cron: the stamp is what suppresses a
 *  repeat). `column` is one of the three stamp columns. Best-effort by contract at the call
 *  site: the cron stamps AFTER the send so a failed send retries next run. */
export async function stampAgreementTouch(
  agreementId: string,
  column: 'reminder_30_sent_at' | 'reminder_7_sent_at' | 'overdue_notice_sent_at',
): Promise<void> {
  await db()
    .from('space_billing_agreements')
    .update({ [column]: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', agreementId)
    .select('id')
    .maybeSingle()
}
