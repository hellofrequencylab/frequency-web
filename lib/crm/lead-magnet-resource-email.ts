// One requested resource, not a nurture email. Pure builder shared by the sender and stock catalog.
import { emailButton, emailShell, escapeHtml, EMAIL_H1, EMAIL_P, type EmailPayload } from '@/lib/email'

export function resourceEmailUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.length > 8192 || /[\u0000-\u001f\u007f]/.test(raw)) return null
  try {
    const url = new URL(raw.trim())
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

function oneLine(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
}

export function buildLeadMagnetResourceEmail(input: { to: string; resourceUrl: string; label?: string | null }): EmailPayload {
  const resourceUrl = resourceEmailUrl(input.resourceUrl)
  if (!resourceUrl) throw new Error('A valid resource link is required')
  const label = oneLine(input.label) || 'this resource'
  const subject = 'Your requested resource'
  const heading = 'Your resource is here.'
  const lead = `Here is the link you requested for ${label}.`
  const why = `You received this one email because this address was used to request ${label} through Frequency. If that was not you, you can ignore it.`
  return {
    to: input.to,
    subject,
    html: emailShell([
      `<h1 data-fq="fq-h1" style="${EMAIL_H1}">${heading}</h1>`,
      `<p data-fq="fq-p" style="${EMAIL_P}">${escapeHtml(lead)}</p>`,
      emailButton('Open the resource', escapeHtml(resourceUrl)),
    ].join('\n'), { text: escapeHtml(why), unsubscribe: false }, { title: subject, preheader: 'A copy of the resource link you asked for.' }),
    text: [heading, '', lead, '', `Open the resource: ${resourceUrl}`, '', why].join('\n'),
  }
}
