import { describe, it, expect, vi } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// EMAIL-026: every stock template renders from the catalog, and one env var writes the rendered set to disk
// for scripts/email-samples.mjs to mail. The outbox is mocked so a transactional sender's enqueueEmail is
// captured instead of queued; nothing here reaches a database or a provider.

const captured: Array<Record<string, unknown>> = []
vi.mock('@/lib/queue/outbox', () => ({
  enqueue: async (_kind: string, payload: Record<string, unknown>) => {
    captured.push(payload)
  },
  bulkRunAfter: () => new Date(),
}))
vi.mock('@/lib/suppression', () => ({ isSuppressed: async () => false }))
vi.mock('@/lib/unsubscribe-tokens', () => ({
  buildUnsubscribeUrl: () => 'https://frequencylocal.com/unsubscribe/t',
  buildSpaceUnsubscribeUrl: () => 'https://frequencylocal.com/unsubscribe/s',
  buildManageEmailsUrl: () => 'https://frequencylocal.com/manage-emails?t=1',
}))

import { SAMPLE_SPECS, sampleFrom } from './catalog'
import type { EmailPayload } from '@/lib/email'
import { PLATFORM_POSTAL_LINE } from '@/lib/email-studio/postal'

interface Rendered {
  id: string
  group: string
  /** The production From header (sampleFrom), so the sample lands as the real sender would. */
  from: string
  subject: string
  html: string
  text: string
}

async function renderAll(): Promise<Rendered[]> {
  const out: Rendered[] = []
  for (const spec of SAMPLE_SPECS) {
    captured.length = 0
    const direct = await spec.run()
    const payload = (direct ?? captured.at(-1)) as EmailPayload | undefined
    if (!payload) throw new Error(`${spec.id}: the sender produced no email`)
    out.push({ id: spec.id, group: spec.group, from: sampleFrom(spec.sender), subject: payload.subject, html: payload.html, text: payload.text ?? '' })
  }
  return out
}

describe('the stock email catalog', () => {
  it('renders every stock template with a subject, a body, and no fixture gaps', async () => {
    const all = await renderAll()
    expect(all.length).toBe(SAMPLE_SPECS.length)
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length)
    for (const r of all) {
      expect(r.subject, r.id).toMatch(/\S/)
      expect(r.html.length, r.id).toBeGreaterThan(200)
      // A fixture that missed a field prints the word; a template that reads one wrong prints the other.
      expect(r.html, r.id).not.toMatch(/\b(undefined|null|NaN)\b/)
      // EMAIL-029: the crossover violet is not an email colour (owner 2026-10-19), in any template.
      expect(r.html.toLowerCase(), r.id).not.toContain('#5b3fd0')
      expect(r.subject, r.id).not.toMatch(/[–—]/)
      // CONTENT-VOICE: no emoji in a subject line.
      expect(r.subject, r.id).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿]/u)
    }
  })

  it('each sample goes out as its production sender: the platform, a Space over the shared address, or a Space in conversation', async () => {
    const all = await renderAll()
    const platform = sampleFrom('system')
    const addressOf = (h: string) => /<([^>]+)>/.exec(h)?.[1] ?? h
    for (const r of all) {
      expect(r.from, r.id).toMatch(/\S+@\S+/)
      if (r.id === 'block-campaign-showcase' || r.id === 'plain-campaign-space') {
        // A Space's campaign: the Space's name masks the platform's verified address.
        expect(r.from, r.id).toBe(`North Light Yoga <${addressOf(platform)}>`)
      } else if (r.id === 'conversation-reply-space' || r.id === 'conversation-coalesced') {
        expect(r.from, r.id).toMatch(/^North Light Yoga <[^>]+>$/)
        expect(r.from, r.id).not.toContain('via')
      } else {
        expect(r.from, r.id).toBe(platform)
      }
    }
  })

  it('every commercial template carries the postal line and an unsubscribe link', async () => {
    const all = await renderAll()
    // Conversation replies are one-to-one mail, not commercial; the receipts are transactional with
    // their own footer; the owner notices (a lead, a sale, a tip, a renewal, a trial ending) are account mail about the
    // owner's own Space; everything else is lifecycle or marketing and must carry the CAN-SPAM footer.
    const exempt = new Set(['conversation-reply-space', 'conversation-reply-frequency', 'conversation-coalesced', 'receipt-order', 'receipt-donation', 'guest-booking-confirm', 'booking-reminder', 'booking-confirmation-member', 'booking-confirmation-owner', 'booking-cancelled', 'member-ticket', 'guest-ticket', 'guest-rsvp-confirmation', 'guest-event-reminder', 'guest-event-update', 'guest-event-cancelled', 'event-claim-invite', 'optin-confirm', 'signup-recovery', 'welcome', 'invite', 'order-shipped', 'contact-lead', 'ticket-sale-host', 'tip-received', 'renewal-reminder', 'renewal-overdue', 'trial-ending'])
    for (const r of all) {
      if (exempt.has(r.id)) continue
      expect(r.html, r.id).toMatch(/unsubscribe/i)
    }
    for (const r of all) {
      if (r.id.startsWith('conversation-')) continue
      const address = r.id.startsWith('block-campaign-showcase') || r.id === 'plain-campaign-space' ? 'Encinitas, CA 92024' : PLATFORM_POSTAL_LINE
      expect(r.html, r.id).toContain(address)
    }
  })

  it('writes the rendered set to EMAIL_SAMPLES_OUT when asked (the sample sender reads it)', async () => {
    const dir = process.env.EMAIL_SAMPLES_OUT
    if (!dir) return
    const all = await renderAll()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'catalog.json'), JSON.stringify(all, null, 2))
    for (const r of all) writeFileSync(join(dir, `${r.id}.html`), r.html)
    expect(all.length).toBeGreaterThan(0)
  })
})
