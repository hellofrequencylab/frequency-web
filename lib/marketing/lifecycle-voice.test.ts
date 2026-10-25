import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const captured = vi.hoisted(() => [] as { to: string; html: string; text: string; subject: string }[])
vi.mock('@/lib/queue/outbox', () => ({ enqueue: async (_kind: string, payload: (typeof captured)[number]) => { captured.push(payload) } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw Error('No database in render tests') } }))
vi.mock('@/lib/unsubscribe-tokens', () => ({ buildUnsubscribeUrl: () => 'https://frequencylocal.com/unsubscribe/fixture' }))
vi.mock('@/lib/suppression', () => ({ isSuppressed: async () => false }))
vi.mock('@/app/manage-emails/actions', () => ({ setEmailCategoryPreference: () => { throw Error('No preference writes') } }))
vi.mock('@/components/admin/email-studio/data-picker-actions', () => ({ searchPickerSpacesAction: () => { throw Error('No search calls') }, listSpaceEventsAction: () => { throw Error('No event reads') }, listSpaceCirclesAction: () => { throw Error('No Circle reads') } }))
vi.mock('@/components/admin/email-studio/product-picker-actions', () => ({ searchProductOwnersAction: () => { throw Error('No owner reads') }, listOwnerProductsAction: () => { throw Error('No product reads') } }))
vi.mock('next/navigation', () => ({ usePathname: () => '/space-email-policy' }))
import { sendSignupRecoveryEmail, sendWelcomeEmail, sendOptinConfirmEmail, sendWeeklyDigestEmail, sendGuestRsvpConfirmationEmail } from '@/lib/email'
import { buildOperatorEmail } from './operator-emails'
import { buildRenewalNoticeEmail } from '@/lib/billing/renewal-notice-email'
import { tipEmailHtml, tipEmailText } from '@/lib/billing/tips-notify'
import { ManageEmailsForm } from '@/app/manage-emails/manage-form'
import SpaceEmailPolicyPage from '@/app/space-email-policy/page'
import { PLATFORM_POSTAL_LINE } from '@/lib/email-studio/postal'
const to = 'copy-fixture@example.invalid'
const plain = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')
const base = { to, greetingName: 'Ana & Bo', spaceName: 'Dune & Tide', spaceSlug: 'dune-tide', baseUrl: 'https://frequencylocal.com' }
let artifact = 0
function record(name: string, html: string, text: string | undefined) {
  if (typeof text !== 'string') throw new Error('Rendered lifecycle mail must include plain text')
  const dir = process.env.LIFECYCLE_COPY_RENDER_DIR
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${++artifact}-${name}.html`), html)
  writeFileSync(join(dir, `${artifact}-${name}.txt`), text)
}
beforeEach(() => { captured.length = 0; vi.stubGlobal('fetch', vi.fn(() => { throw Error('No network in render tests') })) })
afterEach(() => { for (const mail of captured) { expect(mail.to).toBe(to); record('message', mail.html, mail.text) }; vi.unstubAllGlobals() })
it('recovery preserves identity, continuation and postal line without timing/completion promises', async () => {
  const resumeUrl = 'https://frequencylocal.com/join?next=%2Fdiscover%2Fcircles'
  await sendSignupRecoveryEmail({ to, firstName: 'Ana & Bo', resumeUrl })
  expect(captured).toHaveLength(1)
  for (const part of [plain(captured[0].html), captured[0].text]) { expect(part).toContain('pick up where you left off'); expect(part).not.toMatch(/two minutes|one step from done/); expect(part).toContain('We will not add you to any list'); expect(part).toContain(PLATFORM_POSTAL_LINE) }
  expect(captured[0].html).toContain(`href="${resumeUrl}"`)
  expect(captured[0].html).toContain('Ana &amp; Bo')
})
it('welcome keeps referral activation and destinations while describing activities', async () => {
  await sendWelcomeEmail({ to, displayName: 'Ana' })
  for (const part of [plain(captured[0].html), captured[0].text]) { expect(part).toContain('find a group around something you want to do'); expect(part).toContain('you earn Zaps once they join a Circle or pick up a Practice'); expect(part).not.toContain('climb the ranks') }
  for (const path of ['/circles', '/events', '/practices', '/crew', '/codes']) expect(captured[0].html).toContain(path)
})
it('newsletter confirmation explains optional notes and unsubscribe', async () => {
  await sendOptinConfirmEmail({ to, confirmUrl: 'https://frequencylocal.com/confirm/fixture', firstName: 'Ana' })
  for (const part of [plain(captured[0].html), captured[0].text]) { expect(part).toContain('You can unsubscribe from these notes anytime'); expect(part).not.toContain('No spam'); expect(part).toContain('Daniel Tyack') }
})
it('digest preserves supplied facts and uses sentence-case text headings', async () => {
  await sendWeeklyDigestEmail({ to, recipientName: 'Ana', recipientProfileId: 'fixture', dispatches: [], upcomingEvents: [], nearbyEvents: [{ title: 'Thursday walk', startsAt: '2026-10-29T18:00:00Z', location: 'Community park', url: 'https://frequencylocal.com/events/walk' }], topStreak: { type: 'practice', count: 3 }, rank: { name: 'Seeker', zaps: 42 } })
  for (const part of [plain(captured[0].html), captured[0].text]) { expect(part).toContain('Thursday walk'); expect(part).toContain('42 Zaps'); expect(part).toContain('3-day practice streak'); expect(part).not.toMatch(/[⚡🔥]/) }
  expect(captured[0].text).toContain('Your standing'); expect(captured[0].text).not.toContain('YOUR STANDING')
})
for (const status of ['going', 'waitlist', 'pending'] as const) it(`guest ${status} preserves status and supplied location without promising no future emails`, async () => {
  await sendGuestRsvpConfirmationEmail({ to, guestName: 'Ana', eventTitle: 'Thursday walk', whenAbsolute: 'Thursday, October 29', location: 'City only', hostName: 'Bo', circleName: null, eventUrl: 'https://frequencylocal.com/events/walk', icsUrl: null, googleCalUrl: null, signUpUrl: 'https://frequencylocal.com/join', seatUrl: null, status })
  expect(captured[0].subject).toContain(status === 'going' ? "You're going" : status === 'waitlist' ? "You're on the waitlist" : 'Request sent')
  for (const part of [plain(captured[0].html), captured[0].text]) { expect(part).toContain('City only'); expect(part).toContain('you can ignore this confirmation'); expect(part).not.toContain('nothing further will be sent') }
  expect(captured[0].html).not.toContain('.ics')
})
it('operator public-page CTA describes navigation and outreach respects consent', () => {
  const invite = buildOperatorEmail({ day: 3, focus: 'packages', ...base }), followup = buildOperatorEmail({ day: 7, focus: 'membership', ...base })
  for (const part of [plain(invite.html), invite.text]) { expect(part).toContain('View your Space page'); expect(part).not.toContain('Copy your page link') }
  expect(invite.html).toContain('href="https://frequencylocal.com/spaces/dune-tide"')
  for (const part of [plain(followup.html), followup.text]) { expect(part).toContain('people who asked to hear from you'); expect(part).not.toMatch(/people who looked|Most only needed/); expect(part).toContain('Dune & Tide') }
  record('operator-invite', invite.html, invite.text); record('operator-followup', followup.html, followup.text)
})
it('manual renewal keeps date/rate and directs payment without uninterrupted-service promises', () => {
  const mail = buildRenewalNoticeEmail({ to, touch: 'overdue', planLabel: 'Business', spaceName: 'Dune & Tide', dateLabel: 'October 29', rateLabel: '$25 monthly', greetingName: 'Ana', billingUrl: 'https://frequencylocal.com/settings/billing' })
  for (const part of [plain(mail.html), mail.text]) { expect(part).toContain('October 29'); expect(part).toContain('$25 monthly'); expect(part).toContain('Contact the Frequency team to arrange payment'); expect(part).not.toContain('everything keeps running') }
  expect(mail.html).toContain('href="https://frequencylocal.com/settings/billing"'); record('renewal', mail.html, mail.text)
})
it('tip messages separate platform fees, processing and bank payout management, retaining escaped identity', () => {
  const p = { recipientName: 'Ana & Bo', tipperName: '<Sam>', amount: '$5.00', note: 'A kind note' }, html = tipEmailHtml(p), text = tipEmailText(p)
  for (const part of [plain(html), text]) { expect(part).toContain('$5.00'); expect(part).toContain('no platform fee on tips'); expect(part).toContain('Card processing still applies'); expect(part).toContain('Stripe manages payouts to your bank'); expect(part).not.toContain('The full amount goes') }
  expect(html).toContain('&lt;Sam&gt;'); expect(html).toContain('Ana &amp; Bo'); expect(text).toContain('<Sam>'); record('tip', html, text)
})
it('actual preference center says automatic without an instantaneous-save promise', () => {
  const html = renderToStaticMarkup(createElement(ManageEmailsForm, { profileId: 'fixture', token: 'fixture', tokenCategory: 'lifecycle', initial: [{ category: 'lifecycle', subscribed: true }] }))
  expect(plain(html)).toContain('Changes save automatically'); expect(plain(html)).not.toMatch(/instantly|right away/); expect(html).toContain('aria-label="Updates and messages"'); record('preferences', html, plain(html))
})
it('actual public policy describes sender/reply routing and preserves recipient permission', () => {
  const html = renderToStaticMarkup(createElement(SpaceEmailPolicyPage))
  for (const text of ['own verified sending identity', 'verified inbox address', 'Contacts you import start as not opted in', "Frequency Labs Holdings' postal address"]) expect(plain(html)).toContain(text)
  expect(plain(html)).not.toContain('Replies go to that shared address, not to your Space'); record('policy', html, plain(html))
})

it('operator coaching renders audience-specific guidance instead of unmeasured best-time claims', async () => {
  const { EmailBestPractices } = await import('@/components/admin/crm/email-best-practices')
  const overview = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, complained: 0, openRate: 0, clickRate: 0, bounceRate: 0, complaintRate: 0, unsubscribeRate: 0, deliveryRate: 0, lastEventAt: null, campaignsSent: 0 }
  const html = renderToStaticMarkup(createElement(EmailBestPractices, { overview }))
  expect(plain(html)).toContain('Choose a time that suits your audience')
  expect(plain(html)).toContain('respect people’s preferences')
  expect(plain(html)).not.toMatch(/Tuesday through Thursday|opens better|biggest lever/); record('coaching', html, plain(html))
})

for (const kind of ['event', 'circle', 'product'] as const) it(`${kind} editor renders a review step without a freshness guarantee`, async () => {
  const { EventCardEditor, CircleCardEditor } = await import('@/components/admin/email-studio/data-picker')
  const { ProductCardEditor } = await import('@/components/admin/email-studio/product-picker')
  const Component = kind === 'event' ? EventCardEditor : kind === 'circle' ? CircleCardEditor : ProductCardEditor
  const onField = vi.fn()
  const html = renderToStaticMarkup(createElement(Component, { content: {}, onField }))
  expect(plain(html)).toContain('Review the selected item before sending')
  expect(plain(html)).not.toContain('never goes stale')
  expect(onField).not.toHaveBeenCalled()
  record(`${kind}-editor`, html, plain(html))
})

for (const focus of ['packages', 'donations'] as const) it(`operator day zero ${focus} separates drafting from payment eligibility`, () => {
  const mail = buildOperatorEmail({ ...base, day: 0, focus })
  for (const part of [plain(mail.html), mail.text ?? '']) {
    expect(part).toMatch(/draft/i)
    expect(part).toMatch(/Before accepting (?:paid bookings|donations)/)
    expect(part).toContain('your plan and payout setup allow them')
    expect(part).not.toMatch(/so the first person who finds you can book|then turn on giving/)
  }
  expect(mail.to).toBe(base.to)
  expect(mail.html).toContain(`${base.baseUrl}/spaces/${base.spaceSlug}/manage`)
  expect(mail.subject).toMatch(/Your Space is ready/)
})
