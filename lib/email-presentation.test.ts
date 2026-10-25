import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { emailShell, emailButton, EMAIL_H1, EMAIL_P, sendBookingConfirmationEmail, sendBookingCancelledEmail, type EmailPayload } from './email'
import { emailDocumentShell } from './email-studio/shell'
import { renderEmailLayout, DEFAULT_EMAIL_COLORS } from './email-studio/render'
import { PALETTES } from './theme/palette'
import { emailType } from './theme/email-type'
import { saleEmailHtml, saleEmailText, overageLine } from './billing/ticket-sale-notify'

vi.mock('@/lib/theme/design', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/theme/design')>(),
  SITE_DESIGN: 'frequency',
}))

const captured: EmailPayload[] = []
vi.mock('@/lib/queue/outbox', () => ({ enqueue: async (_kind: string, payload: EmailPayload) => { captured.push(payload) }, bulkRunAfter: () => new Date() }))
vi.mock('@/lib/suppression', () => ({ isSuppressed: async () => false }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw Error('No database in email presentation controls') } }))
vi.mock('@/lib/unsubscribe-tokens', () => ({ buildUnsubscribeUrl: () => 'https://frequencylocal.com/unsubscribe/t', buildSpaceUnsubscribeUrl: () => 'https://frequencylocal.com/unsubscribe/s', buildManageEmailsUrl: () => 'https://frequencylocal.com/manage-emails?t=1' }))
beforeEach(() => { captured.length = 0; vi.stubGlobal('fetch', () => { throw Error('No network in email presentation controls') }) })
afterEach(() => { vi.unstubAllGlobals() })

const body = () => `<h1 data-fq="fq-h1" style="${EMAIL_H1}">A clear next step.</h1><p data-fq="fq-p" style="${EMAIL_P}">Review the details below.</p>${emailButton('Review details', 'https://frequencylocal.com/example')}`
it('renders platform and client branding without missing values or changing a client logo URL', () => {
  const logoUrl = 'https://client.invalid/fixture-logo.svg'
  const all = [
    emailShell(body(), { text: 'Synthetic layout control.', unsubscribe: false }, { hero: 0 }),
    emailDocumentShell({ body: body(), brand: { wordmark: 'Frequency', logoUrl: `https://frequencylocal.com${emailType.wordmark.path}` } }),
    emailDocumentShell({ body: body(), brand: { wordmark: 'Client & Co', logoUrl, tagline: 'Local gatherings' } }),
    emailDocumentShell({ body: body(), brand: { wordmark: 'Client & Co', tagline: 'Local gatherings' } }),
  ]
  for (const html of all) { expect(html).toContain('Review details'); expect(html).not.toMatch(/\b(undefined|null|NaN)\b/) }
  expect(all[2]).toContain(`src="${logoUrl}"`)
  expect(all[3]).toContain('Client &amp; Co')
})

function luminance(hex: string) {
  expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
  return hex.slice(1).match(/../g)!.map((v) => parseInt(v, 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
}
it('keeps Frequency light and dark email actions above the normal-text contrast floor', () => {
  for (const theme of ['frequency'] as const) {
    const p = PALETTES[theme]
    expect(p.textMuted).toMatch(/^#[0-9a-f]{6}$/i)
    for (const [ink, background] of [[p.emailActionInk, p.emailAction], [p.emailNightOnAction, p.emailNightAction]]) {
      const values = [luminance(ink), luminance(background)].sort((a, b) => a - b)
      expect((values[1] + .05) / (values[0] + .05), theme).toBeGreaterThanOrEqual(4.5)
    }
  }
})
it('retains explicit client footer colors in the light markup', () => {
  const colors = { ...DEFAULT_EMAIL_COLORS, muted: '#334455', subtle: '#445566' }
  const html = emailDocumentShell({ body: '<p>Client color control</p>', brand: { wordmark: 'Client & Co', colors } })
  expect(html).toContain('color:#445566'); expect(html).toContain('color:#334455')
})
it('retains an explicit client action palette instead of replacing it with the platform default', () => {
  const colors = { ...DEFAULT_EMAIL_COLORS, primary: '#123456', onPrimary: '#ffffff' }
  const result = renderEmailLayout({ rows: [{ id: 'r0', columns: 1, cells: [[{ nid: 'ntest001', type: 'button', content: { label: 'Client action', url: 'https://client.invalid/review' } }]] }], bench: [] }, { colors })
  expect(result.html).toContain('background:#123456'); expect(result.html).toContain('color:#ffffff'); expect(result.text).toContain('Client action')
})
it('renders the capacity warning as readable body copy without changing its financial facts or destination', () => {
  const overage = overageLine({ over_capacity: true, tier_quantity: 12, tier_committed: 12, qty: 2 })!
  const sale = { hostName: 'Jordan', buyerName: 'Maya', countLabel: '2 tickets', eventTitle: 'Sunrise sound bath', tierName: 'General', grossLabel: '$40', feeLabel: '$2.40', feeIsZero: false, overage, eventUrl: 'https://frequencylocal.com/events/sunrise' }
  const html = saleEmailHtml(sale), text = saleEmailText(sale)
  expect(html).toMatch(/<p data-fq="fq-p"[^>]*border-left:[^>]*>This tier is now past its limit: 14 sold against 12\./)
  for (const part of [html, text]) { expect(part).toContain(overage); expect(part).toContain('$2.40'); expect(part).toContain('Card processing also applies') }
  expect(html).toContain(`href="${sale.eventUrl}"`)
})
it('renders confirmed and cancelled guest bookings with their purpose footer and no member-only footer', async () => {
  const base = { to: 'guest@example.test', recipientName: 'Maya', audience: 'member' as const, recipientIsGuest: true, spaceName: 'North Light Yoga', serviceName: 'Private session', whenAbsolute: 'Saturday, November 7, 9:00 AM PT' }
  await sendBookingConfirmationEmail({ ...base, durationMinutes: 60, otherPartyName: 'Jordan', manageUrl: 'https://frequencylocal.com/bookings/abc123', icsBase64: null })
  await sendBookingCancelledEmail({ ...base, reason: 'Jordan is out sick this week.', bookUrl: 'https://frequencylocal.com/spaces/north-light/book' })
  expect(captured).toHaveLength(2)
  for (const mail of captured) {
    expect(mail.html).toContain('This email is about your booking with North Light Yoga.')
    expect(mail.html).not.toContain('because you joined Frequency')
    expect(mail.html).not.toContain('Unsubscribe or manage emails')
    expect(mail.html).not.toMatch(/\b(undefined|null|NaN)\b/)
  }
})
