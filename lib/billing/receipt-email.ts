// THE RECEIPT SEAM (LIVE-344). Four of the five money paths took real money and told nobody.
//
// Event tickets were the only loop with a first-party buyer receipt (lib/events/member-ticket-email.ts
// + lib/events/guest-ticket-email.ts). Orders, donations, memberships and the supporter contribution
// all flipped a row, booked a ledger entry, and stopped there; a tip told the RECIPIENT
// (lib/billing/tips-notify.ts) and never the person who paid. `receipt_email` was set nowhere, so
// Stripe's own receipt was not a backstop either. The machinery was healthy the whole time: the
// outbox drains every two minutes and the transactional lane runs first. What was missing was the
// call.
//
// This module is the one place a money receipt is COMPOSED and SENT, so the five loops cannot drift
// into five different shapes of message. It owns two halves:
//
//   • sendMoneyReceipt  — the PAYER's half. The record of a charge: what moved, to whom, when.
//   • notifyEarner      — the RECEIVER's half. A bell plus the same facts by email, modelled
//                         one-for-one on notifyTipRecipient, which is the loop that already worked.
//
// ── EVERY RULE THIS FILE FOLLOWS COMES FROM AN EXISTING CALLER, NOT FROM TASTE ────────────────────
//
// 1. THE OUTBOX IS THE ONLY DOOR. Everything goes through `enqueueEmail`, never `sendRawEmail`.
//    A durable job the cron drains with retries beats a send that races a webhook's 30-second budget.
// 2. THE GATE IS THE TRANSACTIONAL ONE. A receipt is the record of a payment, not a nudge, so it uses
//    the 'transactional' carve-out (lib/comms/send-gate.ts): muted preferences step aside and only a
//    hard-suppressed address can stop it. A payer with no profile (a signed-out donor) has no
//    preferences to read, so the address goes straight to the outbox, where `sendRawEmail` still
//    checks suppression at drain time. Same rule the guest ticket receipt runs on.
// 3. NEVER THROWS, ALWAYS LOGS. Every caller is a Stripe webhook settle running AFTER the money has
//    moved. A throw there turns a finished payment into a 500 Stripe redelivers to no effect. So
//    every path here resolves, and every miss prints WHY: a fail-safe nobody can see fired is an
//    invisible regression (AGENTS.md).
// 4. IDEMPOTENCY IS THE CALLER'S. Nothing here dedupes. Each caller sends only for a row IT flipped
//    (a `pending` -> `succeeded` update with `.select()`, an insert that did not 23505, a ledger
//    append that reported `recorded: true`), so a redelivered webhook flips nothing and sends
//    nothing. That is the same contract sendMemberTicketReceipt documents.
//
// Copy is governed by docs/CONTENT-VOICE.md + docs/NAMING.md: plain sentences, no em dashes, no
// narrating the reader's feelings, and "payout account" rather than the processor's name.

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { createElement } from 'react'
import { RECEIPT_FOOTER, emailShell, enqueueEmail } from '@/lib/email'
import { ReceiptEmail } from '@/lib/email-react/receipt'
import { renderEmail } from '@/lib/email-react/render'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { profileAccountEmail } from '@/lib/profiles/account-email'
import { formatPriceCents } from '@/lib/commerce/types'

// ── The message shape ──────────────────────────────────────────────────────────────────────────

/** One labelled fact in the receipt's detail block (Amount, Date, What was bought). */
export interface ReceiptLine {
  label: string
  value: string
}

/** Everything a receipt renders. PURE data: the builders below take this and nothing else, so the
 *  copy for every money path can be read, and tested, without a database or a Stripe session. */
export interface ReceiptContent {
  /** The name to greet, or null for the plain greeting (a signed-out payer has no display name). */
  greetingName: string | null
  /** The one sentence that says what happened. Ends the subject's job, does not repeat it. */
  lead: string
  /** The facts, in reading order. Rows with an empty value are dropped by the builders. */
  lines: ReceiptLine[]
  /** Closing paragraphs: what happens next, where to look, how to stop it. */
  closing: string[]
  /** One link out, or neither. Both must be present for the button to render. */
  actionLabel?: string | null
  actionUrl?: string | null
  /** The "Made with Frequency" mark (LIVE-804): a Space customer's receipt carries it. */
  madeWith?: { label: string; url: string } | null
}

/** A money amount as a plain label, or null when there is nothing to print. Whole amounts drop the
 *  cents, matching the house price format. */
export function receiptAmount(cents: number | null | undefined, currency: string | null | undefined): string | null {
  if (typeof cents !== 'number' || !Number.isFinite(cents) || cents <= 0) return null
  return formatPriceCents(Math.round(cents), currency || 'usd')
}

/** The date a receipt carries: the day the money moved, spelled out. Never a raw ISO string. */
export function receiptDate(when: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(when)
  } catch {
    // An Intl failure must never cost somebody their receipt.
    return when.toISOString().slice(0, 10)
  }
}

// ── The message body ───────────────────────────────────────────────────────────────────────────
//
// The BODY is the React Email component lib/email-react/receipt.tsx inside the base template
// (lib/email-react/shell.tsx, the same wrapper `emailShell` writes), so a money receipt is the
// same object as a ticket receipt. This file shapes the data; the component renders it.

function greeting(name: string | null): string {
  const trimmed = (name ?? '').trim()
  return trimmed ? `Hi ${trimmed},` : 'Hi there,'
}

/** Rows with nothing in them are dropped rather than printed blank. */
function usableLines(lines: ReceiptLine[]): ReceiptLine[] {
  return lines.filter((l) => (l.value ?? '').trim().length > 0)
}

/** The receipt's HTML, rendered through the React Email base template (LIVE-695,
 *  lib/email-react/receipt.tsx). lib/billing/__golden__ pins the output.
 *
 *  A render that throws must not cost the payer their receipt: it falls back to the plain-text
 *  receipt inside the string brand shell, still with RECEIPT_FOOTER (never the member default,
 *  which tells a guest payer they joined Frequency, LIVE-365), and logs at ERROR so the fallback
 *  firing is seen. */
function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function receiptHtml(c: ReceiptContent): Promise<string> {
  try {
    return await renderEmail(
      createElement(ReceiptEmail, {
        greeting: greeting(c.greetingName),
        lead: c.lead,
        lines: usableLines(c.lines),
        closing: c.closing.filter((p) => p.trim().length > 0),
        action: c.actionLabel && c.actionUrl ? { label: c.actionLabel, url: c.actionUrl } : null,
        madeWith: c.madeWith ?? null,
      }),
    )
  } catch (err) {
    console.error('[receipt] React Email render failed; sending the plain receipt in the brand shell', { err })
    const body = `<pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${escapeText(receiptText(c))}</pre>`
    return emailShell(body, RECEIPT_FOOTER)
  }
}

export function receiptText(c: ReceiptContent): string {
  const lines: string[] = [greeting(c.greetingName), '', c.lead]
  const rows = usableLines(c.lines)
  if (rows.length) {
    lines.push('')
    for (const r of rows) lines.push(`${r.label}: ${r.value}`)
  }
  if (c.actionLabel && c.actionUrl) lines.push('', `${c.actionLabel}: ${c.actionUrl}`)
  for (const p of c.closing) if (p.trim()) lines.push('', p)
  if (c.madeWith) lines.push('', `${c.madeWith.label}: ${c.madeWith.url}`)
  return lines.join('\n')
}

// ── The payer's half ───────────────────────────────────────────────────────────────────────────

interface MoneyReceiptOptions {
  strict?: boolean
  dedupeKey?: string
  /** The address to send to, when the caller already holds one (a signed-out donor's Stripe
   *  address). Leave null and `profileId` resolves the proven account address instead. */
  to?: string | null
  /** The payer, when they have an account. Drives both the address lookup and the send gate. */
  profileId?: string | null
  subject: string
  content: ReceiptContent
  /** The prefix every log line from this receipt carries, e.g. '[commerce receipt]'. */
  logTag: string
  /** Identifiers printed beside any miss, so an operator can find the row that went unreceipted. */
  context?: Record<string, unknown>
}

/**
 * Send one payer receipt. Resolves `true` when the message reached the outbox and `false` on every
 * miss, having said why. NEVER THROWS and NEVER REJECTS: see rule 3 in the header.
 */
export async function sendMoneyReceipt(opts: MoneyReceiptOptions): Promise<boolean> {
  const ctx = opts.context ?? {}
  try {
    let to = (opts.to ?? '').trim() || null
    if (!to && opts.profileId) to = await profileAccountEmail(opts.profileId)
    if (!to) {
      // The single most likely miss, and the one worth naming loudly: somebody paid and there is no
      // address to send the record to.
      console.error(`${opts.logTag} no address for the payer; the receipt was NOT emailed`, ctx)
      if (opts.strict) throw new Error('Receipt has no verified recipient')
      return false
    }

    // The ONE seam (ADR-169). Transactional: preferences and frequency step aside, suppression does
    // not. A payer with no profile has no preferences to read, so the gate is skipped and the outbox
    // checks suppression at drain time, exactly as the guest ticket receipt does.
    if (opts.profileId) {
      const gate = await resolveSendGate(opts.profileId, 'email', 'transactional', { email: to })
      if (!gate.allowed) {
        console.warn(`${opts.logTag} send gate refused the receipt`, { ...ctx, reason: gate.reason })
        if (opts.strict) throw new Error(`Receipt send gate refused: ${gate.reason}`)
        return false
      }
    }

    await enqueueEmail({
      to,
      subject: opts.subject,
      html: await receiptHtml(opts.content),
      text: receiptText(opts.content),
    }, opts.dedupeKey ? { dedupeKey: opts.dedupeKey } : undefined)
    return true
  } catch (err) {
    if (opts.strict) throw err
    console.error(`${opts.logTag} receipt failed`, { ...ctx, err })
    return false
  }
}

// ── The receiver's half ────────────────────────────────────────────────────────────────────────

interface EarnerNoticeOptions {
  strict?: boolean
  dedupeKey?: string
  /** The person who received the money. A Space's notice goes to its owner. */
  recipientProfileId: string
  /** The payer, when they have an account: the bell renders their name in front of `bellBody`. */
  actorProfileId?: string | null
  /** The `notifications.type` tag for this money path. */
  type: string
  referenceType: string | null
  referenceId: string | null
  /** The bell sentence. With an actor the bell prints their name in front of it, so write it as a
   *  predicate ("bought Two mugs for $24"); `bellBodyNoActor` is the whole sentence without one. */
  bellBody: string
  bellBodyNoActor?: string | null
  subject: string
  content: ReceiptContent
  logTag: string
  context?: Record<string, unknown>
}

/**
 * Tell the person who received the money: one bell row, one email, both best-effort.
 *
 * Modelled on notifyTipRecipient, which is the shape that already worked in production. The bell is
 * written first and independently of the email, so an unreachable address still leaves a record in
 * the product. NEVER THROWS.
 */
export async function notifyEarner(opts: EarnerNoticeOptions): Promise<void> {
  const ctx = opts.context ?? {}
  const admin = createAdminClient()

  // 1. The bell. Written even when the email cannot be, because it is the in-product record.
  try {
    const { error } = await admin.from('notifications').insert({
      ...(opts.dedupeKey ? { dedupe_key: `${opts.dedupeKey}:bell` } : {}),
      recipient_id: opts.recipientProfileId,
      actor_id: opts.actorProfileId ?? null,
      type: opts.type,
      reference_type: opts.referenceType,
      reference_id: opts.referenceId,
      body: opts.actorProfileId ? opts.bellBody : opts.bellBodyNoActor ?? opts.bellBody,
    })
    const duplicate = !!opts.dedupeKey && error?.code === '23505'
    if (error && opts.strict && !duplicate) throw error
    if (error && !duplicate) console.error(`${opts.logTag} notification insert failed`, { ...ctx, error: error.message })
  } catch (err) {
    if (opts.strict) throw err
    console.error(`${opts.logTag} notification insert threw`, { ...ctx, err })
  }

  // 2. The email, through the same transactional seam as the payer's receipt. Money that landed in
  //    your account is transactional mail.
  await sendMoneyReceipt({
    strict: opts.strict,
    dedupeKey: opts.dedupeKey ? `${opts.dedupeKey}:email` : undefined,
    profileId: opts.recipientProfileId,
    subject: opts.subject,
    content: opts.content,
    logTag: opts.logTag,
    context: ctx,
  })
}

// ── Small shared reads ─────────────────────────────────────────────────────────────────────────

/** The name to greet a member by, or null. Best-effort: a missing name costs a greeting, never the
 *  receipt. */
export async function displayNameFor(profileId: string | null | undefined): Promise<string | null> {
  if (!profileId) return null
  try {
    const { data, error } = await createAdminClient()
      .from('profiles')
      .select('display_name')
      .eq('id', profileId)
      .maybeSingle()
    if (error) {
      console.warn('[receipt] display name lookup failed', { profileId, error: error.message })
      return null
    }
    return (data as { display_name?: string | null } | null)?.display_name ?? null
  } catch {
    return null
  }
}

/** The owner of a Space, plus the names and slug a receipt needs to address it. Null when the Space
 *  cannot be read, which is a real problem and says so at the call site. */
export async function spaceReceiptTarget(spaceId: string): Promise<{
  ownerProfileId: string | null
  name: string
  slug: string
} | null> {
  try {
    const { data, error } = await createAdminClient()
      .from('spaces')
      .select('owner_profile_id, name, brand_name, slug')
      .eq('id', spaceId)
      .maybeSingle()
    if (error) {
      console.error('[receipt] space lookup failed', { spaceId, error: error.message })
      return null
    }
    const row = data as { owner_profile_id?: string | null; name?: string | null; brand_name?: string | null; slug?: string | null } | null
    if (!row) return null
    return {
      ownerProfileId: row.owner_profile_id ?? null,
      name: (row.brand_name ?? row.name ?? 'this space').trim() || 'this space',
      slug: row.slug ?? spaceId,
    }
  } catch (err) {
    console.error('[receipt] space lookup threw', { spaceId, err })
    return null
  }
}
