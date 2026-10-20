// The manual-agreement renewal notice (EMAIL-027): the per-touch copy and the owner's email, in the
// member shell, where the cron used to build the HTML inline through the conversation wrapper with
// no wordmark or address line. PURE, so the stock catalog renders every touch with fixtures.
import { emailButton, emailShell, EMAIL_P, escapeHtml, type EmailPayload } from '@/lib/email'
import { palette } from '@/lib/theme/palette'

type RenewalTouch = 'reminder_30' | 'reminder_7' | 'overdue'

/** The per-touch copy. Plain voice, no urgency theater, no em dashes (CONTENT-VOICE §10): the
 *  reader learns the date, the locked rate, and that the crew handles the rest. */
export function renewalTouchCopy(
  touch: RenewalTouch,
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

/** The owner's renewal email for one touch. Account mail about a deal the Space signed: no
 *  membership claim and no unsubscribe control. */
export function buildRenewalNoticeEmail(parts: {
  to: string
  touch: RenewalTouch
  planLabel: string
  spaceName: string
  dateLabel: string
  rateLabel: string
  /** The owner's display name, or null for a plain greeting. */
  greetingName: string | null
  billingUrl: string
}): EmailPayload {
  const copy = renewalTouchCopy(parts.touch, parts.planLabel, parts.spaceName, parts.dateLabel, parts.rateLabel)
  const greeting = parts.greetingName ? `Hi ${parts.greetingName},` : 'Hi,'
  const why = `You are receiving this because you run ${parts.spaceName} on Frequency.`
  const html = emailShell(
    [
      `<p style="${EMAIL_P}color:${palette.text};">${escapeHtml(greeting)}</p>`,
      ...copy.body.map((p) => `<p style="${EMAIL_P}color:${palette.text};">${escapeHtml(p)}</p>`),
      `${emailButton(`View plan and billing`, parts.billingUrl)}`,
    ].join('\n'),
    { text: escapeHtml(why), unsubscribe: false },
  )
  const text = `${greeting}\n\n${copy.body.join('\n\n')}\n\nView plan and billing: ${parts.billingUrl}\n\n${why}\n`
  return { to: parts.to, subject: copy.subject, html, text }
}
