import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmailPayload } from './email'
const captured = vi.hoisted(() => [] as EmailPayload[])
vi.mock('@/lib/queue/outbox', () => ({ enqueue: async (_kind: string, payload: EmailPayload) => { captured.push(payload) } }))
vi.mock('@/lib/suppression', () => ({ isSuppressed: async () => false }))
vi.mock('@/lib/unsubscribe-tokens', () => ({ buildUnsubscribeUrl: () => 'https://frequencylocal.com/unsubscribe/synthetic' }))
import { sendEventCancelledEmail, sendGuestEventCancelledEmail, sendBookingConfirmationEmail, sendGuestRsvpConfirmationEmail, sendGuestEventReminderEmail, sendGuestEventUpdateEmail, sendMadeItEmail, sendInviteEmail, sendOptinConfirmEmail, sendOptinWelcomeEmail } from './email'
import { compileEmailDoc } from './email-studio/shell'
import { PLATFORM_POSTAL_LINE } from './email-studio/postal'
import { buildContactLeadEmail } from './crm/lead-notify'
import { buildOperatorEmail, type OperatorFocus } from './marketing/operator-emails'
const url = 'https://frequencylocal.com/events/synthetic-event'
const common = { to: 'synthetic@example.com', eventTitle: 'A synthetic gathering & friends', whenAbsolute: 'A fixture date', eventUrl: url }
const last = () => { expect(captured).toHaveLength(1); return captured[0] }
const both = (mail: EmailPayload, check: (part: string) => void) => { check(mail.html); check(mail.text ?? '') }
beforeEach(() => { captured.length = 0 })
describe('email copy follows actual recipient and delivery state', () => {
  for (const guest of [false, true]) for (const requested of [false, true]) {
    it(`${guest ? 'guest' : 'member'} cancellation names only a requested refund when the caller confirms its job`, async () => {
      if (guest) await sendGuestEventCancelledEmail({ ...common, guestName: 'Synthetic', refunded: requested })
      else await sendEventCancelledEmail({ ...common, recipientName: 'Synthetic', recipientProfileId: 'synthetic-member', refunded: requested })
      const mail = last()
      both(mail, part => {
        expect(part).not.toMatch(/fully refunded|refunded in full|charge.*(?:has been|is being) reversed/i)
        if (requested) expect(part).toContain('A full refund has been requested for your ticket.')
        else expect(part).not.toContain('refund has been requested')
        expect(part).toContain(url)
      })
      if (guest) { expect(mail.html).not.toContain('because you joined Frequency'); expect(mail.html).not.toContain('/settings/notifications') }
      else expect(mail.html).toContain('/settings/notifications')
    })
  }
  it('escapes a null-service booking Space name once in HTML and leaves plain text literal', async () => {
    const spaceName = 'A & B <Studio> "north"'
    await sendBookingConfirmationEmail({ to: common.to, recipientName: 'Synthetic', audience: 'member', spaceName, serviceName: null, whenAbsolute: common.whenAbsolute, durationMinutes: 30, otherPartyName: null, manageUrl: url, icsBase64: null })
    const mail = last()
    expect(mail.html).toContain('Session with A &amp; B &lt;Studio&gt; &quot;north&quot;')
    expect(mail.html).not.toContain('Session with A &amp;amp;')
    expect(mail.text).toContain(spaceName)
    expect(mail.text).not.toContain('&amp;')
    expect(mail.html).toContain(`href="${url}"`)
    expect(mail.attachments ?? []).toHaveLength(0)
  })
  for (const attachment of [null, 'U1lOVEhFVElD']) {
    it(`booking receipt does not invent an attachment when calendar payload is ${attachment ? 'present' : 'absent'}`, async () => {
      await sendBookingConfirmationEmail({ to: common.to, recipientName: 'Synthetic', audience: 'member', spaceName: 'A client Space', serviceName: 'A session', whenAbsolute: common.whenAbsolute, durationMinutes: 30, otherPartyName: null, manageUrl: url, icsBase64: attachment })
      const mail = last()
      expect(mail.html).not.toContain('We added a calendar file')
      expect(mail.html).toContain('Your booking details are below.')
      expect(mail.attachments?.length ?? 0).toBe(attachment ? 1 : 0)
    })
  }
  for (const status of ['going', 'waitlist', 'pending'] as const) {
    it(`guest ${status} receipt has a guest audience and keeps its actual spot/account destinations`, async () => {
      await sendGuestRsvpConfirmationEmail({ ...common, guestName: 'Synthetic', location: null, hostName: 'Client host', circleName: 'Client Circle', icsUrl: null, googleCalUrl: null, signUpUrl: 'https://frequencylocal.com/sign-in', seatUrl: url + '/seat/synthetic', status })
      const mail = last()
      expect(mail.html).not.toContain('because you joined Frequency')
      expect(mail.html).not.toContain('/settings/notifications')
      both(mail, part => { expect(part).toContain('https://frequencylocal.com/sign-in'); expect(part).toContain(url + '/seat/synthetic') })
      if (status === 'pending') both(mail, part => { expect(part).toContain('until the host approves your request'); expect(part).not.toContain('the moment they reply') })
    })
  }
  it('a guest reminder and host-authored guest update do not imply a Frequency account', async () => {
    await sendGuestEventReminderEmail({ ...common, guestName: null, whenLabel: 'A fixture reminder', location: null, held: 'ticket', claimUrl: 'https://frequencylocal.com/sign-in' })
    expect(last().html).not.toContain('because you joined Frequency')
    captured.length = 0
    await sendGuestEventUpdateEmail({ ...common, updateTitle: 'A client update', body: 'Client text <keep this> & details' })
    const mail = last()
    expect(mail.html).not.toContain('because you joined Frequency')
    expect(mail.html).toContain('Client text &lt;keep this&gt; &amp; details')
    expect(mail.text).toContain('Client text <keep this> & details')
  })
  for (const guest of [true, false]) {
    it(`${guest ? 'guest' : 'member'} follow-up without a next event does not promise a new calendar date`, async () => {
      await sendMadeItEmail({ ...common, name: 'Synthetic', madeItUrl: url + '/made-it', next: null, ...(guest ? { joinUrl: 'https://frequencylocal.com/sign-in' } : { unsubscribeUrl: 'https://frequencylocal.com/unsubscribe/synthetic' }), dedupeKey: 'synthetic' })
      const mail = last()
      both(mail, part => { expect(part).not.toContain('next date on your calendar'); expect(part).not.toContain('will not email it again'); expect(part).toContain(url + '/made-it') })
      if (guest) { expect(mail.html).not.toContain('because you joined Frequency'); both(mail, part => { expect(part).toContain('Set up your account'); expect(part).not.toContain('used to RSVP') }) }
      else expect(mail.html).toContain('/settings/notifications')
    })
  }
  it('a Space teammate invite is an invitation and does not imply accepted membership', async () => {
    await sendInviteEmail({ to: common.to, inviterName: 'Synthetic host', contextName: 'Client Space', contextKind: 'space', inviteUrl: url + '/invite' })
    const mail = last()
    both(mail, part => { expect(part).toContain('invited to help run'); expect(part).not.toContain('added to the team'); expect(part).toContain(url + '/invite') })
    expect(mail.html).not.toContain('because you joined Frequency')
  })
  it('newsletter-only recipients keep their actual confirmation/unsubscribe controls without an account claim', async () => {
    await sendOptinConfirmEmail({ to: common.to, confirmUrl: url + '/confirm' })
    const confirm = last()
    expect(confirm.html).not.toContain('because you joined Frequency')
    both(confirm, part => { expect(part).toContain('Confirmation is required'); expect(part).not.toContain("You won't hear from us again") })
    captured.length = 0
    await sendOptinWelcomeEmail({ to: common.to, unsubscribeUrl: url + '/unsubscribe' })
    const welcome = last()
    both(welcome, part => { expect(part).toContain(url + '/unsubscribe'); expect(part).not.toContain('always works') })
    expect(welcome.html).not.toContain('/settings/notifications')
  })
  for (const optedIn of [true, false]) for (const keptOutOfCrm of [true, false]) {
    it(`lead opt-in=${optedIn}, missing CRM row=${keptOutOfCrm} names choice without inventing insertion or failure reason`, () => {
      const mail = buildContactLeadEmail({ to: common.to, ownerName: 'Owner', who: 'A client contact', spaceName: 'Client Space', preview: 'Client message <untouched>', optedIn, keptOutOfCrm, crmUrl: url + '/crm', replyTo: 'synthetic-reply@example.com' })
      both(mail, part => { expect(part).not.toContain('so they are on your list'); expect(part).not.toContain('CRM is at its contact limit'); if (keptOutOfCrm) expect(part).toContain('We could not confirm a contact record for this message.'); expect(part).toContain(url + '/crm') })
      expect(mail.html).toContain('Client message &lt;untouched&gt;')
      expect(mail.text).toContain('Client message <untouched>')
      expect(mail.replyTo).toBe('synthetic-reply@example.com')
    })
  }
  for (const focus of ['packages', 'membership', 'ticketed', 'donations', 'venue', 'network', 'general'] as OperatorFocus[]) {
    it(`created ${focus} Space guidance does not claim public publication`, () => {
      const mail = buildOperatorEmail({ day: 0, focus, to: common.to, greetingName: 'Owner', spaceName: 'Client Space', spaceSlug: 'synthetic', baseUrl: 'https://frequencylocal.com' })
      both(mail, part => { expect(part).not.toContain('Your page is live'); expect(part).toContain('/spaces/synthetic/manage') })
      expect(mail.subject).not.toContain('Your Space is open')
    })
  }
})

for (const address of [undefined, '', 'Client postal fixture']) {
  it(`compiled customer message carries its actual postal identity in both formats: ${address === undefined ? 'platform' : address ? 'client' : 'empty client fallback'}`, () => {
    const layout = { rows: [{ id: 'synthetic-row', columns: 1 as const, cells: [[{ nid: 'synthetic-node', type: 'text', content: { text: 'Customer-authored body stays here.' } }]] }], bench: [] }
    const before = JSON.stringify(layout)
    const mail = compileEmailDoc({ layout, subject: 'Client subject', preheader: 'Client preheader' }, { brand: address !== undefined ? { wordmark: 'Client Space', address } : undefined, unsubscribeUrl: 'https://frequencylocal.com/unsubscribe/synthetic' })
    for (const part of [mail.html, mail.text]) { expect(part).toContain(address || PLATFORM_POSTAL_LINE); expect(part).toContain('Customer-authored body stays here.'); expect(part).toContain('https://frequencylocal.com/unsubscribe/synthetic') }
    // The default postal line already includes the legal sender name; custom addresses retain its separate prefix.
    expect(mail.html.match(/Frequency Labs Holdings/g)).toHaveLength(1)
    expect(mail.subject).toBe('Client subject')
    expect(JSON.stringify(layout)).toBe(before)
  })
}
