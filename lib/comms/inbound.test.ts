import { describe, it, expect, beforeAll } from 'vitest'
import {
  parseInboundMessage,
  isAutomatedMessage,
  loadInboundMessage,
  synthesizeInboundMessageId,
  InboundHydrationError,
  type ParsedInboundMessage,
} from './inbound'
import type { ReceivedEmail } from '@/lib/email'
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

describe('loadInboundMessage (metadata-only webhook hydration)', () => {
  function fullBody(addr: string, over: Partial<ReceivedEmail> = {}): ReceivedEmail {
    return {
      from: 'ada@example.com',
      to: [addr],
      received_for: [addr],
      subject: 'Re: your note',
      text: 'the actual reply text',
      html: '<p>the actual reply text</p>',
      headers: { 'Message-ID': '<full-999@resend>', 'In-Reply-To': '<orig@send>', 'Auto-Submitted': 'no' },
      message_id: '<full-999@resend>',
      ...over,
    }
  }

  it('fetches the body from the API when the webhook carries an id but no body', async () => {
    const addr = buildConversationReplyAddress(4096)
    let askedId: string | null = null
    const parsed = await loadInboundMessage(
      { type: 'email.received', data: { id: 'rme_abc', from: 'ada@example.com', received_for: [addr], subject: 'Re: your note' } },
      async (id) => {
        askedId = id
        return fullBody(addr)
      },
    )
    expect(askedId).toBe('rme_abc')
    expect(parsed).not.toBeNull()
    expect(parsed!.text).toBe('the actual reply text') // body hydrated
    expect(parsed!.messageId).toBe('<full-999@resend>') // dedupe key hydrated from headers
    expect(parsed!.inReplyTo).toBe('<orig@send>')
    expect(parsed!.autoSubmitted).toBe('no') // loop-guard header hydrated
    expect(parseConversationReplyAddress(parsed!.recipients)?.ref).toBe('4096')
  })

  it('does NOT call the API when the payload already carries a body', async () => {
    const addr = buildConversationReplyAddress(4096)
    let called = false
    const parsed = await loadInboundMessage(
      { data: { id: 'rme_abc', from: 'ada@example.com', received_for: [addr], subject: 'Re', text: 'inline body' } },
      async () => {
        called = true
        return null
      },
    )
    expect(called).toBe(false)
    expect(parsed!.text).toBe('inline body')
  })

  it('THROWS a transient error when the webhook has an id but the body fetch fails (redelivery, not empty)', async () => {
    const addr = buildConversationReplyAddress(4096)
    await expect(
      loadInboundMessage(
        { type: 'email.received', data: { id: 'rme_abc', from: 'ada@example.com', received_for: [addr], subject: 'Re' } },
        async () => null,
      ),
    ).rejects.toBeInstanceOf(InboundHydrationError)
  })

  it('falls back to metadata WITHOUT throwing when there is no id to hydrate from', async () => {
    const addr = buildConversationReplyAddress(4096)
    let called = false
    const parsed = await loadInboundMessage(
      { data: { from: 'ada@example.com', received_for: [addr], subject: 'Re' } },
      async () => {
        called = true
        return null
      },
    )
    expect(called).toBe(false)
    expect(parsed!.text).toBeNull()
    expect(parseConversationReplyAddress(parsed!.recipients)?.ref).toBe('4096')
  })

  it('hydrates when the webhook inlines an EMPTY text (empty string must not suppress the fetch)', async () => {
    const addr = buildConversationReplyAddress(4096)
    const parsed = await loadInboundMessage(
      { type: 'email.received', data: { id: 'rme_abc', text: '', from: 'ada@example.com', received_for: [addr], subject: 'Re' } },
      async () => fullBody(addr),
    )
    expect(parsed!.text).toBe('the actual reply text')
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

describe('synthesizeInboundMessageId (Message-ID-less dedup fallback)', () => {
  it('is deterministic for the same payload (a redelivery collides)', () => {
    const a = synthesizeInboundMessageId('ada@example.com', 'Hi', 'the body')
    const b = synthesizeInboundMessageId('ada@example.com', 'Hi', 'the body')
    expect(a).toBe(b)
    expect(a).toMatch(/^<synth\.[0-9a-f]{32}@inbound\.frequencylocal\.com>$/)
  })

  it('differs for different content (a new message still records)', () => {
    const a = synthesizeInboundMessageId('ada@example.com', 'Hi', 'the body')
    const b = synthesizeInboundMessageId('ada@example.com', 'Hi', 'another body')
    expect(a).not.toBe(b)
  })

  it('a Message-ID-less parse gets the synthetic id instead of null', () => {
    const parsed = parseInboundMessage({
      data: { from: 'ada@example.com', to: ['reply+conv-x@in.example.com'], subject: 'Hi', text: 'hello' },
    })
    expect(parsed?.messageId).toMatch(/^<synth\./)
  })

  it('a provider Message-ID always wins over the synthetic', () => {
    const parsed = parseInboundMessage({
      data: {
        from: 'ada@example.com',
        to: ['reply+conv-x@in.example.com'],
        subject: 'Hi',
        text: 'hello',
        message_id: '<real-id@mail.example.com>',
      },
    })
    expect(parsed?.messageId).toBe('<real-id@mail.example.com>')
  })
})

describe('loadInboundMessage degraded hydration (persistent fetch failure past grace)', () => {
  it('throws (redeliver) while the event is young, degrades to a body-less record once stale', async () => {
    const addr = buildConversationReplyAddress(4096)
    const young = {
      type: 'email.received',
      created_at: new Date().toISOString(),
      data: { id: 'rme_x', from: 'ada@example.com', received_for: [addr], subject: 'Re' },
    }
    await expect(loadInboundMessage(young, async () => null)).rejects.toBeInstanceOf(InboundHydrationError)

    const stale = {
      ...young,
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min old redelivery
    }
    const parsed = await loadInboundMessage(stale, async () => null)
    expect(parsed).not.toBeNull()
    expect(parsed!.text).toBeNull()
    expect(parsed!.hydration).toEqual({ emailId: 'rme_x', failed: true })
  })
})
