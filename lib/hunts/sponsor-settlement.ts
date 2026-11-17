/**
 * The live half of the capped sponsor milestone (FH-047S): the IO over lib/hunts/sponsor-milestone.ts.
 *
 * What happens, in order, and what stops a second invoice:
 *   1. READ the confirmed, distinct qualifications for a Trail: one key per PERSON whose run is completed
 *      and carries no claim still waiting (submitted or held for review) and no reversed credit.
 *   2. FREEZE through `decideFreeze` and `freezeSnapshot` once the threshold is met before the Trail ends.
 *      The database keeps one agreement per Trail and one snapshot per agreement, and
 *      `hunt_sponsor_freeze` returns the first snapshot on any later call. A replayed event or a fraud
 *      correction after the freeze therefore prices nothing again.
 *   3. INVOICE the frozen amount: one `hunt_sponsor_settlements` row per snapshot. `unique (snapshot_id)`
 *      is the database's own once-only guarantee; this file only ever inserts with "do nothing on conflict".
 *   4. PAID only from the provider. `huntsAfterInvoicePaid` accepts a paid provider invoice that names the
 *      settlement, checks the amount and currency, and moves it through `nextSettlement`.
 *
 * An unpaid pledge is never donations raised: `sponsorMoneyLines` answers through `publicMoneyLines`, which
 * keeps raised gifts, pledged and paid as three lines.
 *
 * Doubly dark. Nothing here reads a row while HUNTS_COMMERCE_ENABLED is off, and with it on an agreement
 * that is not active with a recorded approver (the D8 sign-off, FH-045) freezes nothing and invoices nothing.
 * This file records what is owed and what the provider says was paid. It does not create the provider
 * invoice or move money: who bills the sponsor, and to which payee, is a D8 decision.
 */
import type Stripe from 'stripe'
import { db, huntRpc } from './commerce-store'
import { huntSwitchOn } from './flags'
import { decideFreeze, freezeSnapshot, nextSettlement, publicMoneyLines, type SponsorAgreement } from './sponsor-milestone'

const PAGE = 1000

type Page = PromiseLike<{ data: unknown; error: { message: string } | null }>

/** Every row of a filtered read, a page at a time. A truncated exclusion list would overcount, so a failed page throws. */
async function allRows<T>(table: string, page: (from: number, to: number) => Page): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(`${table} read failed: ${error.message}`)
    const rows = (data as T[] | null) ?? []
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

/**
 * Canonical keys of CONFIRMED qualifications for one Trail, one per person. A run counts only when it is
 * completed, none of its claims is still submitted or held for review, and none of its credits was reversed.
 */
export async function confirmedQualificationKeys(huntId: string): Promise<string[]> {
  const [runs, waiting, reversed] = await Promise.all([
    allRows<{ id: string; subject_profile_id: string }>('hunt_runs', (from, to) =>
      db().from('hunt_runs').select('id, subject_profile_id').eq('hunt_id', huntId).eq('state', 'completed').order('id').range(from, to)),
    allRows<{ run_id: string }>('hunt_claims', (from, to) =>
      db().from('hunt_claims').select('run_id').eq('hunt_id', huntId).in('state', ['submitted', 'needs_review']).order('id').range(from, to)),
    allRows<{ run_id: string }>('hunt_progress', (from, to) =>
      db().from('hunt_progress').select('run_id').eq('hunt_id', huntId).eq('disposition', 'reversed').order('run_id').order('mission_key').range(from, to)),
  ])
  const unconfirmed = new Set([...waiting, ...reversed].map((r) => r.run_id))
  return [...new Set(runs.filter((r) => !unconfirmed.has(r.id) && r.subject_profile_id).map((r) => `profile:${r.subject_profile_id}`))].sort()
}

type AgreementRow = {
  id: string
  hunt_id: string
  sponsor_label: string
  threshold: number
  cap_cents: number
  pledge_numerator: number
  pledge_denominator: number
  status: SponsorAgreement['status']
  approved_at: string | null
  approved_by: string | null
}
const AGREEMENT_COLS = 'id, hunt_id, sponsor_label, threshold, cap_cents, pledge_numerator, pledge_denominator, status, approved_at, approved_by'

function toAgreement(r: AgreementRow): SponsorAgreement {
  return {
    id: r.id,
    huntId: r.hunt_id,
    threshold: r.threshold,
    capCents: Number(r.cap_cents),
    pledgeNumerator: Number(r.pledge_numerator),
    pledgeDenominator: Number(r.pledge_denominator),
    status: r.status,
    approvedAt: r.approved_at,
    approvedBy: r.approved_by,
  }
}

async function agreementForHunt(huntId: string): Promise<AgreementRow | null> {
  const { data, error } = await db().from('hunt_sponsor_agreements').select(AGREEMENT_COLS).eq('hunt_id', huntId).maybeSingle()
  if (error) throw new Error(`hunt_sponsor_agreements read failed: ${error.message}`)
  return (data as AgreementRow | null) ?? null
}

type SnapshotRow = { id: string; owed_cents: number }
type SettlementRow = { id: string; snapshot_id: string; amount_cents: number; status: 'invoiced' | 'paid' | 'void'; invoice_ref: string | null }
const SETTLEMENT_COLS = 'id, snapshot_id, amount_cents, status, invoice_ref'

async function snapshotFor(agreementId: string): Promise<SnapshotRow | null> {
  const { data, error } = await db().from('hunt_sponsor_snapshots').select('id, owed_cents').eq('agreement_id', agreementId).maybeSingle()
  if (error) throw new Error(`hunt_sponsor_snapshots read failed: ${error.message}`)
  return (data as SnapshotRow | null) ?? null
}

async function settlementFor(snapshotId: string): Promise<SettlementRow | null> {
  const { data, error } = await db().from('hunt_sponsor_settlements').select(SETTLEMENT_COLS).eq('snapshot_id', snapshotId).maybeSingle()
  if (error) throw new Error(`hunt_sponsor_settlements read failed: ${error.message}`)
  return (data as SettlementRow | null) ?? null
}

type FreezeRefusal = Extract<ReturnType<typeof decideFreeze>, { freeze: false }>['reason']
type SettleResult =
  | { step: 'switch_off' | 'no_agreement' | 'hunt_not_live' | 'no_end_date' | FreezeRefusal }
  | { step: 'invoiced'; settlementId: string; amountCents: number; created: boolean }

/**
 * Freeze and invoice one Trail's sponsor milestone if it is owed. Safe to call any number of times: the
 * second call finds the first snapshot and the first settlement and creates nothing.
 */
export async function settleSponsorMilestone(huntId: string, nowMs: number = Date.now()): Promise<SettleResult> {
  if (!huntSwitchOn('commerce')) return { step: 'switch_off' }
  const row = await agreementForHunt(huntId)
  if (!row) return { step: 'no_agreement' }
  const agreement = toAgreement(row)
  // The approval gate comes first and covers the invoice too: a snapshot frozen under an agreement that
  // was later voided or lost its approver is never invoiced.
  if (agreement.status !== 'active') return { step: 'not_active' }
  if (!agreement.approvedAt || !agreement.approvedBy) return { step: 'not_approved' }

  let snapshot = await snapshotFor(row.id)
  if (!snapshot) {
    const { data: huntData, error: huntError } = await db().from('hunts').select('status, current_version_id').eq('id', huntId).maybeSingle()
    if (huntError) throw new Error(`hunts read failed: ${huntError.message}`)
    const hunt = huntData as { status: string; current_version_id: string | null } | null
    if (hunt?.status !== 'live' || !hunt.current_version_id) return { step: 'hunt_not_live' }
    const { data: versionData, error: versionError } = await db().from('hunt_versions').select('ends_at').eq('id', hunt.current_version_id).maybeSingle()
    if (versionError) throw new Error(`hunt_versions read failed: ${versionError.message}`)
    const endsAtMs = Date.parse((versionData as { ends_at: string | null } | null)?.ends_at ?? '')
    // "Before the Trail ends" cannot be decided for a Trail with no end, so nothing freezes.
    if (!Number.isFinite(endsAtMs)) return { step: 'no_end_date' }

    const decision = decideFreeze({ agreement, confirmedKeys: await confirmedQualificationKeys(huntId), nowMs, huntEndsAtMs: endsAtMs })
    if (!decision.freeze) return { step: decision.reason }
    const frozen = await freezeSnapshot(huntRpc, row.id, decision)
    snapshot = { id: frozen.snapshotId, owed_cents: frozen.owedCents }
  }

  const before = await settlementFor(snapshot.id)
  if (before) return { step: 'invoiced', settlementId: before.id, amountCents: before.amount_cents, created: false }
  // unique (snapshot_id) decides a race: the loser's insert does nothing and it reads the winner's row.
  const { error } = await db()
    .from('hunt_sponsor_settlements')
    .upsert({ snapshot_id: snapshot.id, amount_cents: snapshot.owed_cents, status: 'invoiced' }, { onConflict: 'snapshot_id', ignoreDuplicates: true })
  if (error) throw new Error(`hunt_sponsor_settlements write failed: ${error.message}`)
  const after = await settlementFor(snapshot.id)
  if (!after) throw new Error('hunt_sponsor_settlements write left no row')
  return { step: 'invoiced', settlementId: after.id, amountCents: after.amount_cents, created: true }
}

/** The cron pass: every active agreement, bounded. One failure is logged and never stops the rest. */
export async function huntsSponsorPass(limit = 50, nowMs: number = Date.now()): Promise<{ checked: number; invoiced: number; failed: number } | null> {
  if (!huntSwitchOn('commerce')) return null
  const { data, error } = await db().from('hunt_sponsor_agreements').select('hunt_id').eq('status', 'active').limit(limit)
  if (error) throw new Error(`hunt_sponsor_agreements read failed: ${error.message}`)
  const rows = (data as { hunt_id: string }[] | null) ?? []
  let invoiced = 0
  let failed = 0
  for (const r of rows) {
    try {
      const result = await settleSponsorMilestone(r.hunt_id, nowMs)
      if (result.step === 'invoiced' && result.created) invoiced += 1
    } catch (err) {
      failed += 1
      console.error('[hunt-sponsor] settle failed', r.hunt_id, err instanceof Error ? err.message : String(err))
    }
  }
  return { checked: rows.length, invoiced, failed }
}

type PaidResult = 'paid' | 'already_paid' | 'refused' | 'failed' | null

/**
 * Webhook: a provider invoice was paid. Only an invoice that names a settlement in its own metadata
 * (`hunt_sponsor_settlement_id`), is paid in full in USD, and is the invoice the settlement already knows
 * (or the first to claim it) marks it paid. Best effort: it never throws into the webhook.
 */
export async function huntsAfterInvoicePaid(
  invoice: Pick<Stripe.Invoice, 'id' | 'metadata' | 'status' | 'amount_paid' | 'currency'>,
): Promise<PaidResult> {
  const settlementId = invoice.metadata?.hunt_sponsor_settlement_id
  if (!settlementId || !huntSwitchOn('commerce')) return null
  try {
    const { data, error } = await db().from('hunt_sponsor_settlements').select(SETTLEMENT_COLS).eq('id', settlementId).maybeSingle()
    if (error) throw new Error(error.message)
    const settlement = data as SettlementRow | null
    const refuse = (why: string): PaidResult => {
      console.error(`[hunt-sponsor] paid invoice ${invoice.id} refused: ${why}`)
      return 'refused'
    }
    if (!settlement) return refuse('no such settlement')
    if (invoice.status !== 'paid') return refuse('the invoice is not paid')
    if ((invoice.currency ?? '').toLowerCase() !== 'usd') return refuse('wrong currency')
    if ((invoice.amount_paid ?? 0) < settlement.amount_cents) return refuse('paid less than the frozen amount')
    if (settlement.invoice_ref && settlement.invoice_ref !== invoice.id) return refuse('the settlement belongs to another invoice')

    const next = nextSettlement(settlement.status, { kind: 'paid', providerRef: invoice.id ?? '' })
    if ('error' in next) return refuse(next.error)
    if (!next.changed) return 'already_paid'
    const { error: writeError } = await db()
      .from('hunt_sponsor_settlements')
      .update({ status: next.status, provider_ref: invoice.id, invoice_ref: invoice.id, paid_at: new Date().toISOString() })
      .eq('id', settlement.id)
      .eq('status', 'invoiced')
    if (writeError) throw new Error(writeError.message)
    return 'paid'
  } catch (err) {
    console.error('[hunt-sponsor] payment sync failed', invoice.id, err instanceof Error ? err.message : String(err))
    return 'failed'
  }
}

/**
 * The public money lines for a Trail. `donationsRaisedCents` is settled gifts only (the caller reads it
 * from lib/hunts/donation-sync.ts); the pledge is added to it nowhere. Null when there is nothing a sponsor
 * line may say: the switch is off, or the agreement is not active with an approver.
 */
export async function sponsorMoneyLines(
  huntId: string,
  donationsRaisedCents: number,
): Promise<(ReturnType<typeof publicMoneyLines> & { sponsorLabel: string }) | null> {
  if (!huntSwitchOn('commerce')) return null
  const row = await agreementForHunt(huntId)
  if (!row || row.status !== 'active' || !row.approved_at || !row.approved_by) return null
  const snapshot = await snapshotFor(row.id)
  const settlement = snapshot ? await settlementFor(snapshot.id) : null
  return {
    sponsorLabel: row.sponsor_label,
    ...publicMoneyLines({
      currency: 'USD',
      donationsRaisedCents,
      snapshot: snapshot ? { owedCents: Number(snapshot.owed_cents) } : null,
      settlement: settlement ? { status: settlement.status, amountCents: Number(settlement.amount_cents) } : null,
    }),
  }
}
