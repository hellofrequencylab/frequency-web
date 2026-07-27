// Manual billing renewal reminders (ADR-872) — daily via Vercel Cron (off-peak, with the other
// nightly jobs; see vercel.json).
//
// For every ACTIVE manual billing agreement (space_billing_agreements, the off-Stripe cash/check
// deals), the ladder is three touches per cycle:
//   • 30 days out  → a heads-up that the renewal is coming
//   • 7 days out   → one week to go
//   • past due     → an overdue notice
// ONE notice each, idempotent via the row's reminder_30_sent_at / reminder_7_sent_at /
// overdue_notice_sent_at stamps (a stamped touch never repeats; a payment clears the stamps and
// re-arms the next cycle). The window math is pure and unit-tested
// (lib/billing/manual-agreement-dates.ts); this route only transports.
//
// Notify = the primitives Space-owner notices already use: an in-app `notifications` row for the
// Space's owner + active admins (best-effort, same shape as lifecycle-triggers/support), plus an
// email to the owner through the durable outbox (enqueueEmail, ADR-026). Billing notices about a
// deal the Space signed are account mail, so no marketing unsubscribe applies. Stamps are written
// AFTER the sends, so a failed run retries tomorrow instead of going silent.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueEmail } from '@/lib/email'
import { agreementsDue, stampAgreementTouch, type ManualAgreement } from '@/lib/billing/manual-agreements'
import { formatAgreementRate } from '@/lib/billing/manual-agreement-dates'
import { asSpacePlan, SPACE_PLAN_LABEL } from '@/lib/pricing/plans'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

type Touch = 'reminder_30' | 'reminder_7' | 'overdue'

const TOUCH_COLUMN: Record<Touch, 'reminder_30_sent_at' | 'reminder_7_sent_at' | 'overdue_notice_sent_at'> = {
  reminder_30: 'reminder_30_sent_at',
  reminder_7: 'reminder_7_sent_at',
  overdue: 'overdue_notice_sent_at',
}

/** Render the paid-through date for copy, e.g. "July 27, 2027" (UTC-day semantics, matching the
 *  date column). */
function dueDateLabel(paidThrough: string): string {
  return new Date(`${paidThrough}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/** The per-touch copy. Plain voice, no urgency theater, no em dashes (CONTENT-VOICE §10): the
 *  reader learns the date, the locked rate, and that the crew handles the rest. */
function touchCopy(
  touch: Touch,
  planLabel: string,
  spaceName: string,
  dateLabel: string,
  rateLabel: string,
): { subject: string; inapp: string; body: string[] } {
  if (touch === 'reminder_30') {
    return {
      subject: `Your ${planLabel} plan renewal is coming up`,
      inapp: `Your ${planLabel} plan renews on ${dateLabel}. Your rate stays locked at ${rateLabel}.`,
      body: [
        `The ${planLabel} plan for ${spaceName} renews on ${dateLabel}.`,
        `Your rate stays locked at ${rateLabel}. The crew will reach out about payment closer to the date. Nothing you need to do today.`,
      ],
    }
  }
  if (touch === 'reminder_7') {
    return {
      subject: `One week until your ${planLabel} plan renews`,
      inapp: `Your ${planLabel} plan renews on ${dateLabel}, one week out. Your locked rate: ${rateLabel}.`,
      body: [
        `The ${planLabel} plan for ${spaceName} renews on ${dateLabel}, one week from now.`,
        `Your locked rate is ${rateLabel}. If payment is already arranged with the crew, you are all set. Questions? Just reply.`,
      ],
    }
  }
  return {
    subject: `Your ${planLabel} plan payment is due`,
    inapp: `Payment for your ${planLabel} plan came due on ${dateLabel}. Reach out to the crew to settle up.`,
    body: [
      `Payment for the ${planLabel} plan on ${spaceName} came due on ${dateLabel}.`,
      `Your rate stays locked at ${rateLabel}. Reach out to the crew to settle up and everything keeps running as usual.`,
    ],
  }
}

type SpaceRow = { id: string; name: string | null; slug: string | null; owner_profile_id: string | null }

/** One agreement's fan-out: in-app rows for the owner + active admins, email to the owner. Never
 *  throws (a per-agreement hiccup must not stall the batch); returns whether ANY send landed so
 *  the caller only stamps a touch that actually went out. */
async function notifyAgreement(agreement: ManualAgreement, touch: Touch): Promise<boolean> {
  const admin = createAdminClient()

  const { data: spaceData } = await admin
    .from('spaces')
    .select('id, name, slug, owner_profile_id')
    .eq('id', agreement.spaceId)
    .maybeSingle()
  const space = spaceData as SpaceRow | null
  if (!space) return false // space gone: nothing to remind (fail-safe no-op)

  const planLabel = SPACE_PLAN_LABEL[asSpacePlan(agreement.plan)]
  const spaceName = space.name ?? 'your space'
  const dateLabel = dueDateLabel(agreement.paidThrough)
  const rateLabel = agreement.label ?? formatAgreementRate(agreement.amountCents, agreement.interval)
  const copy = touchCopy(touch, planLabel, spaceName, dateLabel, rateLabel)

  // Recipients: the owner plus every ACTIVE admin (the people the billing surface already serves).
  const recipients = new Set<string>()
  if (space.owner_profile_id) recipients.add(space.owner_profile_id)
  try {
    const { data: admins } = await admin
      .from('space_members')
      .select('profile_id')
      .eq('space_id', space.id)
      .eq('role', 'admin')
      .eq('status', 'active')
    for (const m of (admins ?? []) as { profile_id: string }[]) recipients.add(m.profile_id)
  } catch {
    /* admins are additive; the owner alone still gets the notice */
  }

  let delivered = false

  // In-app rows (best-effort each, same insert shape support/lifecycle use).
  for (const profileId of recipients) {
    try {
      await admin.from('notifications').insert({
        recipient_id: profileId,
        type: 'billing_renewal',
        reference_type: 'space',
        reference_id: space.id,
        body: copy.inapp,
      })
      delivered = true
    } catch {
      /* best-effort: an in-app miss never blocks the run */
    }
  }

  // Email the OWNER (account mail about a deal the Space signed; queued on the durable outbox).
  if (space.owner_profile_id) {
    try {
      const { data: profileData } = await admin
        .from('profiles')
        .select('id, display_name, auth_user_id')
        .eq('id', space.owner_profile_id)
        .maybeSingle()
      const profile = profileData as { display_name: string | null; auth_user_id: string | null } | null
      if (profile?.auth_user_id) {
        const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
        if (user?.email) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
          const billingUrl = space.slug ? `${appUrl}/spaces/${space.slug}/settings/billing` : appUrl
          const greeting = profile.display_name ? `Hi ${profile.display_name},` : 'Hi,'
          const paragraphs = copy.body
          await enqueueEmail({
            to: user.email,
            subject: copy.subject,
            html: `
              <p style="font-size:16px;line-height:1.6;color:#333;margin:0 0 16px;">${greeting}</p>
              ${paragraphs.map((p) => `<p style="font-size:16px;line-height:1.6;color:#333;margin:0 0 16px;">${p}</p>`).join('')}
              <a href="${billingUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;">View plan and billing</a>
              <hr style="border:none;border-top:1px solid #eee;margin:28px 0;">
              <p style="font-size:13px;color:#999;">You are receiving this because you run ${spaceName} on Frequency.</p>
            `,
            text: `${greeting}\n\n${paragraphs.join('\n\n')}\n\nView plan and billing: ${billingUrl}\n\nYou are receiving this because you run ${spaceName} on Frequency.\n`,
          })
          delivered = true
        }
      }
    } catch (e) {
      console.error('[billing-renewals email]', e)
    }
  }

  return delivered
}

async function processTouch(agreements: ManualAgreement[], touch: Touch): Promise<number> {
  let sent = 0
  for (const agreement of agreements) {
    try {
      const delivered = await notifyAgreement(agreement, touch)
      // Stamp AFTER the sends, and only when something actually went out: a fully failed fan-out
      // leaves the stamp null so tomorrow retries. (An agreement's space cannot vanish under it,
      // the FK cascades, so "nothing delivered" always means a transient miss worth retrying.)
      if (delivered) {
        await stampAgreementTouch(agreement.id, TOUCH_COLUMN[touch])
        sent++
      }
    } catch (e) {
      console.error('[billing-renewals]', touch, agreement.id, e)
    }
  }
  return sent
}

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const buckets = await agreementsDue(new Date())
  const sent30 = await processTouch(buckets.reminder30, 'reminder_30')
  const sent7 = await processTouch(buckets.reminder7, 'reminder_7')
  const sentOverdue = await processTouch(buckets.overdue, 'overdue')

  log.info('cron.billing_renewals', {
    due30: buckets.reminder30.length,
    due7: buckets.reminder7.length,
    dueOverdue: buckets.overdue.length,
    sent30,
    sent7,
    sentOverdue,
  })

  return NextResponse.json({
    ok: true,
    reminder_30: { due: buckets.reminder30.length, sent: sent30 },
    reminder_7: { due: buckets.reminder7.length, sent: sent7 },
    overdue: { due: buckets.overdue.length, sent: sentOverdue },
  })
}

export const GET = withCronHeartbeat('billing-renewals', handler)
