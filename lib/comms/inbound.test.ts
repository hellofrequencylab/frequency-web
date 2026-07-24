import { describe, it, expect, beforeAll } from 'vitest'
import { parseInboundMessage, isAutomatedMessage, type ParsedInboundMessage } from './inbound'
import { buildConversationReplyAddress, parseConversationReplyAddress } from './reply-address'

beforeAll(() => {
  process.env.CONVERSATION_TOKEN_SECRET = 'test-conversation-secret-please-32-bytes'
})

function base(over: Partial<ParsedInboundMessage> = {}): ParsedInboundMessage {
  return {
    from: over.from ?? 'ada@example.com',
    recipients: over.recipients ?? [],
    subject: 'subject' in over ? (over.subject ?? null) : 'Re: hi',
    text: 'text' in over ? (over.text ?? null) : 'a reply',
    messageId: 'messageId' in over ? (over.messageId ?? null) : '<m1@mail>',
    inReplyTo: over.inReplyTo ?? null,
    referencesIds: over.referencesIds ?? null,
    autoSubmitted: over.autoSubmitted ?? null,
    precedence: over.precedence ?? null,
  }
}

describe('parseInboundMessage', () => {
  it('reads the Resend email.received webhook shape (data.*, to[], received_for[], message_id)', () => {
    const parsed = parseInboundMessage({
      type: 'email.received',
      data: {
        from: 'Ada Lovelace <ada@example.com>',
        to: ['reply+1042-abc@reply.frequencylocal.com'],
        received_for: ['reply+1042-abc@reply.frequencylocal.com'],
        message_id: '<provider-123@resend>',
        subject: 'Re: your note',
        text: 'sounds good',
      },
    })
    expect(parsed).not.toBeNull()
    expect(parsed!.from).toBe('ada@example.com') // display name stripped + lowercased
    expect(parsed!.recipients).toContain('reply+1042-abc@reply.frequencylocal.com')
    expect(parsed!.messageId).toBe('<provider-123@resend>')
    expect(parsed!.subject).toBe('Re: your note')
    expect(parsed!.text).toBe('sounds good')
  })

  it('pulls In-Reply-To / References / Auto-Submitted / Precedence from a headers object', () => {
    const parsed = parseInboundMessage({
      data: {
        from: 'ben@example.com',
        to: 'ops@frequencylocal.com',
        headers: {
          'In-Reply-To': '<root@send>',
          References: '<root@send> <mid@send>',
          'Auto-Submitted': 'auto-replied',
          Precedence: 'Bulk',
        },
      },
    })
    expect(parsed!.inReplyTo).toBe('<root@send>')
    expect(parsed!.referencesIds).toEqual(['<root@send>', '<mid@send>'])
    expect(parsed!.autoSubmitted).toBe('auto-replied') // lowercased
    expect(parsed!.precedence).toBe('bulk')
  })

  it('reads a headers ARRAY shape ({name,value}) case-insensitively', () => {
    const parsed = parseInboundMessage({
      data: {
        from: 'c@example.com',
        headers: [{ name: 'auto-submitted', value: 'auto-generated' }],
      },
    })
    expect(parsed!.autoSubmitted).toBe('auto-generated')
  })

  it('falls back to html when text is absent, and caps the body', () => {
    const parsed = parseInboundMessage({ data: { from: 'a@b.com', html: '<p>hello</p>' } })
    expect(parsed!.text).toBe('<p>hello</p>')
  })

  it('returns null when there is no usable from-address', () => {
    expect(parseInboundMessage({ data: { subject: 'orphan' } })).toBeNull()
    expect(parseInboundMessage(null)).toBeNull()
    expect(parseInboundMessage('nope')).toBeNull()
  })

  it('rejects a from-address carrying control chars (log/thread injection)', () => {
    expect(parseInboundMessage({ data: { from: 'a@b.com\r\nBcc: evil@x' } })).toBeNull()
  })

  it('surfaces a real reply address so the codec can route it (wiring contract)', () => {
    const addr = buildConversationReplyAddress(2048)
    const parsed = parseInboundMessage({
      data: { from: 'ada@example.com', received_for: [addr], message_id: '<x@r>' },
    })
    const token = parseConversationReplyAddress(parsed!.recipients)
    expect(token?.ref).toBe('2048')
  })
})

describe('isAutomatedMessage (loop guard)', () => {
  it('drops Auto-Submitted != no', () => {
    expect(isAutomatedMessage(base({ autoSubmitted: 'auto-replied' }))).toBe(true)
    expect(isAutomatedMessage(base({ autoSubmitted: 'auto-generated' }))).toBe(true)
    expect(isAutomatedMessage(base({ autoSubmitted: 'no' }))).toBe(false)
  })

  it('drops bulk / list / junk precedence', () => {
    expect(isAutomatedMessage(base({ precedence: 'bulk' }))).toBe(true)
    expect(isAutomatedMessage(base({ precedence: 'list' }))).toBe(true)
    expect(isAutomatedMessage(base({ precedence: 'junk' }))).toBe(true)
  })

  it('drops daemon / no-reply senders and null-sender bounces', () => {
    expect(isAutomatedMessage(base({ from: 'mailer-daemon@mail.example.com' }))).toBe(true)
    expect(isAutomatedMessage(base({ from: 'postmaster@example.com' }))).toBe(true)
    expect(isAutomatedMessage(base({ from: 'no-reply@example.com' }))).toBe(true)
    expect(isAutomatedMessage(base({ from: 'noreply@example.com' }))).toBe(true)
    expect(isAutomatedMessage(base({ from: '' }))).toBe(true)
  })

  it('lets a normal human reply through', () => {
    expect(isAutomatedMessage(base({ from: 'ada@example.com', autoSubmitted: 'no' }))).toBe(false)
    expect(isAutomatedMessage(base())).toBe(false)
  })
})
