import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// LIVE-728 (ADR-1663): the lib/email.ts footers (the emailShell footer every transactional and member email
// renders, plus the scan-intro and signup-recovery text parts) print a postal address. COMPANY_POSTAL_ADDRESS
// wins when set; unset or blank falls back to the platform postal line. Before, unset fell back to the site
// host, and the var was never set, so these footers carried no address.

const enqueued: { html: string; text: string }[] = []
vi.mock('@/lib/queue/outbox', () => ({
  enqueue: async (_kind: string, payload: { html: string; text: string }) => {
    enqueued.push(payload)
  },
}))
vi.mock('@/lib/suppression', () => ({ isSuppressed: async () => false }))

import { emailShell, sendSignupRecoveryEmail, sendWelcomeEmail } from './email'
import { PLATFORM_POSTAL_LINE } from '@/lib/email-studio/postal'

const ORIGINAL = process.env.COMPANY_POSTAL_ADDRESS

beforeEach(() => {
  enqueued.length = 0
  delete process.env.COMPANY_POSTAL_ADDRESS
})

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.COMPANY_POSTAL_ADDRESS
  else process.env.COMPANY_POSTAL_ADDRESS = ORIGINAL
})

async function recoveryEmail(): Promise<{ html: string; text: string }> {
  await sendSignupRecoveryEmail({ to: 'a@example.com', firstName: 'Ana', resumeUrl: 'https://frequencylocal.com/join' })
  expect(enqueued).toHaveLength(1)
  return enqueued[0]
}

describe('postal address in lib/email.ts footers (LIVE-728)', () => {
  it('unset: the shell footer prints the platform postal line', () => {
    expect(emailShell('<p>Hi</p>')).toContain(PLATFORM_POSTAL_LINE)
  })

  it('unset: the signup recovery html and text parts both print the platform postal line', async () => {
    const { html, text } = await recoveryEmail()
    expect(html).toContain(PLATFORM_POSTAL_LINE)
    expect(text).toContain(PLATFORM_POSTAL_LINE)
  })

  it('blank counts as unset', async () => {
    process.env.COMPANY_POSTAL_ADDRESS = '   '
    const { html, text } = await recoveryEmail()
    expect(html).toContain(PLATFORM_POSTAL_LINE)
    expect(text).toContain(PLATFORM_POSTAL_LINE)
  })

  it('set: the env var wins over the platform line, escaped in the html', async () => {
    process.env.COMPANY_POSTAL_ADDRESS = 'Frequency, PO Box 12 & 13, Encinitas, CA 92024'
    const { html, text } = await recoveryEmail()
    expect(html).toContain('Frequency, PO Box 12 &amp; 13, Encinitas, CA 92024')
    expect(text).toContain('Frequency, PO Box 12 & 13, Encinitas, CA 92024')
    expect(html).not.toContain(PLATFORM_POSTAL_LINE)
    expect(text).not.toContain(PLATFORM_POSTAL_LINE)
  })
})

// LIVE-914 (Phase 0.5): the welcome email says only what the referral programme does. The newcomer
// gets Zaps for joining with a code; the referrer is paid once the friend activates (lib/qr/referral.ts).
describe('welcome email referral promise (LIVE-914)', () => {
  it('names the activation gate in both parts and never says "you both earn"', async () => {
    await sendWelcomeEmail({ to: 'a@example.com', displayName: 'Ana' })
    expect(enqueued).toHaveLength(1)
    const { html, text } = enqueued[0]
    for (const part of [html, text]) {
      expect(part).not.toMatch(/you both earn/i)
      expect(part).not.toMatch(/connected to your community/i)
      expect(part).toContain('you earn Zaps once they join a Circle or pick up a Practice')
      expect(part).not.toContain('\u2014')
    }
  })
})
