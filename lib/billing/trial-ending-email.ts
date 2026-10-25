// The trial-ending notice (LIVE-1132): Stripe fires customer.subscription.trial_will_end three days before a
// Space's trial turns into a charge, and nothing told the owner. PURE, so the stock catalog renders it with
// fixtures. Account mail about a plan the Space started: no membership claim, no unsubscribe control.
import { emailButton, emailShell, EMAIL_P, escapeHtml, type EmailPayload } from '@/lib/email'
import { palette } from '@/lib/theme/palette'

export function buildTrialEndingEmail(parts: {
  to: string
  planLabel: string
  spaceName: string
  /** The date the first charge happens, already formatted ("November 19, 2026"). */
  trialEndLabel: string
  /** The owner's display name, or null for a plain greeting. */
  greetingName: string | null
  billingUrl: string
}): EmailPayload {
  const greeting = parts.greetingName ? `Hi ${parts.greetingName},` : 'Hi,'
  const body = [
    `The free trial of ${parts.planLabel} for ${parts.spaceName} ends on ${parts.trialEndLabel}. After that, your card is charged for the plan.`,
    'Nothing to do if you want to keep going. If you would rather not, you can change or cancel the plan before then and your Space stays on the free plan.',
  ]
  const why = `You are receiving this because you run ${parts.spaceName} on Frequency.`
  const html = emailShell(
    [
      `<p data-fq="fq-p" style="${EMAIL_P}color:${palette.text};">${escapeHtml(greeting)}</p>`,
      ...body.map((p) => `<p data-fq="fq-p" style="${EMAIL_P}color:${palette.text};">${escapeHtml(p)}</p>`),
      emailButton('View plan and billing', parts.billingUrl),
    ].join('\n'),
    { text: escapeHtml(why), unsubscribe: false },
  )
  const text = `${greeting}\n\n${body.join('\n\n')}\n\nView plan and billing: ${parts.billingUrl}\n\n${why}\n`
  return { to: parts.to, subject: `Your ${parts.planLabel} trial ends on ${parts.trialEndLabel}`, html, text }
}
