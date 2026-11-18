import { describe, it, expect, vi } from 'vitest'
import type { Resend } from 'resend'
import {
  toResendMergeTags,
  resolveStaticMergeTags,
  contactsCsv,
  broadcastName,
  sendCampaignAsBroadcast,
  MANAGE_URL_PLACEHOLDER,
  RESEND_UNSUBSCRIBE_PLACEHOLDER,
} from './broadcast'

// EMAIL-076: a platform campaign goes out as ONE Resend broadcast (Marketing plan), not one outbox
// email per person (Transactional plan, Free, 100 a day). Locked here, network-free:
//   1. our merge tags become Resend placeholders, product tokens resolve now, nothing can break out;
//   2. the contact import file is well formed, de-duplicated and formula-safe, and never carries an
//      `unsubscribed` column (an upsert must never re-subscribe someone);
//   3. the send is segment, import, wait, broadcast, in that order, and a re-run never sends twice.

describe('toResendMergeTags', () => {
  const fallbacks = { 'contact.first_name': 'there', 'product.title': 'our latest' }

  it('turns contact tokens into Resend placeholders with the fallback', () => {
    expect(toResendMergeTags('Hi {{contact.first_name}},', fallbacks)).toBe('Hi {{{contact.first_name|there}}},')
    expect(toResendMergeTags('Hi {{ contact.first_name | "friend" }}', fallbacks)).toBe('Hi {{{contact.first_name|friend}}}')
    expect(toResendMergeTags('{{contact.email}}', fallbacks)).toBe('{{{contact.email}}}')
    expect(toResendMergeTags('{{contact.last_name}}', fallbacks)).toBe('{{{contact.last_name}}}')
  })

  it('resolves shared tokens now and escapes them in html', () => {
    expect(toResendMergeTags('{{product.title}}', { 'product.title': 'Tea & <cake>' })).toBe('Tea &amp; &lt;cake&gt;')
    expect(toResendMergeTags('{{product.title}}', { 'product.title': 'Tea & cake' }, { escape: false })).toBe('Tea & cake')
  })

  it('a fallback can never close the placeholder', () => {
    expect(toResendMergeTags('{{contact.first_name|"a}}}|b"}}', {})).toBe('{{{contact.first_name|ab}}}')
  })

  it('leaves the Resend placeholders it did not write alone', () => {
    const html = `<a href="${RESEND_UNSUBSCRIBE_PLACEHOLDER}">x</a><a href="${MANAGE_URL_PLACEHOLDER}">y</a>`
    expect(toResendMergeTags(html, fallbacks)).toBe(html)
  })
})

describe('resolveStaticMergeTags', () => {
  it('fills every token from fallbacks so a subject never shows a placeholder', () => {
    expect(resolveStaticMergeTags('Hey {{contact.first_name}}, {{product.title}}', { 'contact.first_name': 'there', 'product.title': 'tea' })).toBe(
      'Hey there, tea',
    )
  })
})

describe('contactsCsv', () => {
  it('writes a header and one row per address, de-duplicated and lowercased', () => {
    const csv = contactsCsv([
      { email: 'A@x.com', firstName: 'Ann', lastName: '', manageUrl: 'https://f/m?t=1' },
      { email: 'a@x.com', firstName: 'Dup', lastName: '', manageUrl: 'https://f/m?t=2' },
      { email: 'b@x.com', firstName: 'Bo, Jr', lastName: 'Say "hi"', manageUrl: 'https://f/m?t=3' },
    ])
    expect(csv).toBe(
      'email,first_name,last_name,manage_url\n' +
        'a@x.com,Ann,,https://f/m?t=1\n' +
        'b@x.com,"Bo, Jr","Say ""hi""",https://f/m?t=3\n',
    )
    expect(csv.split('\n')[0]).not.toContain('unsubscribed')
  })

  it('defuses a spreadsheet formula and a line break in a name', () => {
    const csv = contactsCsv([{ email: 'c@x.com', firstName: '=HYPERLINK(1)', lastName: 'a\nb', manageUrl: 'u' }])
    expect(csv).toBe("email,first_name,last_name,manage_url\nc@x.com,'=HYPERLINK(1),a b,u\n")
  })
})

function fakeResend(opts: { existing?: string; importStatuses?: string[]; broadcastError?: string } = {}) {
  const calls: string[] = []
  const statuses = [...(opts.importStatuses ?? ['completed'])]
  const resend = {
    broadcasts: {
      list: vi.fn(async () => {
        calls.push('broadcasts.list')
        return { data: { data: opts.existing ? [{ id: opts.existing, name: broadcastName('c1') }] : [] }, error: null }
      }),
      create: vi.fn(async (_p: unknown) => {
        calls.push('broadcasts.create')
        return opts.broadcastError ? { data: null, error: { message: opts.broadcastError } } : { data: { id: 'bc_1' }, error: null }
      }),
    },
    contactProperties: {
      list: vi.fn(async () => {
        calls.push('properties.list')
        return { data: { data: [] }, error: null }
      }),
      create: vi.fn(async () => {
        calls.push('properties.create')
        return { data: { id: 'p1' }, error: null }
      }),
    },
    segments: {
      create: vi.fn(async () => {
        calls.push('segments.create')
        return { data: { id: 'seg_1' }, error: null }
      }),
    },
    contacts: {
      imports: {
        create: vi.fn(async (_p: unknown) => {
          calls.push('imports.create')
          return { data: { id: 'imp_1' }, error: null }
        }),
        get: vi.fn(async () => {
          calls.push('imports.get')
          return { data: { status: statuses.shift() ?? 'completed', counts: { failed: 0 } }, error: null }
        }),
      },
    },
  }
  return { resend: resend as unknown as Resend, raw: resend, calls }
}

const input = {
  campaignId: 'c1',
  from: 'Frequency <noreply@send.frequencylocal.com>',
  replyTo: 'hello@frequencylocal.com',
  subject: 'Hello',
  html: '<p>Hi</p>',
  text: 'Hi',
  recipients: [{ email: 'a@x.com', firstName: 'Ann', lastName: '', manageUrl: 'https://f/m' }],
}

describe('sendCampaignAsBroadcast', () => {
  it('creates the segment, imports, waits for the import, then sends one broadcast to that segment', async () => {
    const f = fakeResend({ importStatuses: ['queued', 'in_progress', 'completed'] })
    const res = await sendCampaignAsBroadcast(input, { resend: f.resend, sleep: async () => {} })
    expect(res).toEqual({ broadcastId: 'bc_1', existing: false })
    expect(f.calls).toEqual([
      'broadcasts.list',
      'properties.list',
      'properties.create',
      'segments.create',
      'imports.create',
      'imports.get',
      'imports.get',
      'imports.get',
      'broadcasts.create',
    ])
    const sent = f.raw.broadcasts.create.mock.calls[0][0] as Record<string, unknown>
    expect(sent).toMatchObject({ segmentId: 'seg_1', send: true, name: 'campaign:c1', subject: 'Hello', replyTo: 'hello@frequencylocal.com' })
    const imp = f.raw.contacts.imports.create.mock.calls[0][0] as { onConflict: string; segments: unknown; columnMap: Record<string, unknown> }
    expect(imp.onConflict).toBe('upsert')
    expect(imp.segments).toEqual([{ id: 'seg_1' }])
    expect(imp.columnMap).not.toHaveProperty('unsubscribed')
  })

  it('never sends twice: a broadcast already named for the campaign is returned as is', async () => {
    const f = fakeResend({ existing: 'bc_old' })
    const res = await sendCampaignAsBroadcast(input, { resend: f.resend, sleep: async () => {} })
    expect(res).toEqual({ broadcastId: 'bc_old', existing: true })
    expect(f.calls).toEqual(['broadcasts.list'])
  })

  it('a failed import throws before any broadcast is created', async () => {
    const f = fakeResend({ importStatuses: ['failed'] })
    await expect(sendCampaignAsBroadcast(input, { resend: f.resend, sleep: async () => {} })).rejects.toThrow(/import failed/)
    expect(f.calls).not.toContain('broadcasts.create')
  })

  it('a provider refusal on the broadcast throws, so the campaign is recorded failed, not sent', async () => {
    const f = fakeResend({ broadcastError: 'domain not verified' })
    await expect(sendCampaignAsBroadcast(input, { resend: f.resend, sleep: async () => {} })).rejects.toThrow(/domain not verified/)
  })
})
