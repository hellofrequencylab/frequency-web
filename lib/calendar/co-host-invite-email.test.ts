import { describe, expect, it, vi } from 'vitest'
import { buildPlanShareEmail } from '@/lib/email'

// THE CO-HOST INVITE EMAIL (calendar suite pass 8, LIVE-1709): the `requested` share moment.

const base = {
  to: 'jordan@example.com',
  recipientName: 'Jordan',
  recipientProfileId: 'p1',
  otherSpaceName: 'Tidepool Trust',
  planTitle: 'Winter beach cleanups',
  calendarPath: '/spaces/north-light/settings/calendar',
}

vi.stubEnv('UNSUBSCRIBE_SECRET', 'test-secret-test-secret-test-secret')

describe('the co-host invite', () => {
  const mail = buildPlanShareEmail({ ...base, moment: 'requested' })

  it('asks plainly, with the handoff\'s promise and an honest way out', () => {
    expect(mail.subject).toBe('Tidepool Trust wants you to co-host "Winter beach cleanups"')
    expect(mail.text).toContain('Say yes and it lands on your calendar, and both teams can edit it.')
    expect(mail.text).toContain('Say no and nothing changes on your side.')
    expect(mail.text).toContain('Answer the invite')
  })

  it('links the recipient\'s own calendar settings and carries an unsubscribe', () => {
    expect(mail.text).toMatch(/\/spaces\/north-light\/settings\/calendar/)
    expect(mail.text).toMatch(/Unsubscribe/)
  })

  it('has no long dash or exclamation in subject or body', () => {
    expect(`${mail.subject} ${mail.text}`).not.toMatch(/[–—!]/)
  })

  it('leaves the answered moments as they were', () => {
    expect(buildPlanShareEmail({ ...base, moment: 'accepted' }).subject).toBe('Tidepool Trust said yes to "Winter beach cleanups"')
    expect(buildPlanShareEmail({ ...base, moment: 'declined' }).subject).toBe('Tidepool Trust passed on "Winter beach cleanups"')
  })
})
