import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import {
  makeConversationToken,
  verifyConversationToken,
  buildConversationReplyAddress,
  parseConversationReplyAddress,
  conversationSigningAvailable,
  CONVERSATION_SIGNING_UNAVAILABLE_COPY,
  REPLY_DOMAIN,
} from './reply-address'

// A fixed secret so tokens are deterministic in the test (mirrors the unsubscribe-tokens approach).
beforeAll(() => {
  process.env.CONVERSATION_TOKEN_SECRET = 'test-conversation-secret-please-32-bytes'
})

describe('conversation reply-address codec', () => {
  it('round-trips a built address back to (ref, token)', () => {
    const addr = buildConversationReplyAddress(1042)
    expect(addr).toBe(`reply+1042-${makeConversationToken(1042)}@${REPLY_DOMAIN}`)
    const parsed = parseConversationReplyAddress(addr)
    expect(parsed).toEqual({ ref: '1042', token: makeConversationToken(1042), role: 'member' })
    expect(verifyConversationToken(parsed!.ref, parsed!.token)).toBe(true)
  })

  it('rejects a forged token (right ref, wrong tag)', () => {
    const forged = `reply+1042-${'0'.repeat(32)}@${REPLY_DOMAIN}`
    const parsed = parseConversationReplyAddress(forged)
    expect(parsed).toEqual({ ref: '1042', token: '0'.repeat(32), role: 'member' })
    // Parsing is permissive; verification is what gates. The forged tag must fail.
    expect(verifyConversationToken('1042', '0'.repeat(32))).toBe(false)
  })

  it('house address is a DISTINCT role + tag, and the two roles never cross-verify', () => {
    const memberAddr = buildConversationReplyAddress(1042, 'member')
    const houseAddr = buildConversationReplyAddress(1042, 'house')
    // Same ref, different local part + different tag.
    expect(houseAddr).toBe(`reply+1042.h-${makeConversationToken(1042, 'house')}@${REPLY_DOMAIN}`)
    expect(makeConversationToken(1042, 'house')).not.toBe(makeConversationToken(1042, 'member'))
    expect(memberAddr).not.toBe(houseAddr)

    // Parse recovers the role.
    expect(parseConversationReplyAddress(memberAddr)).toEqual({ ref: '1042', token: makeConversationToken(1042, 'member'), role: 'member' })
    expect(parseConversationReplyAddress(houseAddr)).toEqual({ ref: '1042', token: makeConversationToken(1042, 'house'), role: 'house' })

    // A house token must NOT verify as member and vice-versa (a leaked member address can't send outbound).
    const houseTok = makeConversationToken(1042, 'house')
    const memberTok = makeConversationToken(1042, 'member')
    expect(verifyConversationToken(1042, houseTok, 'house')).toBe(true)
    expect(verifyConversationToken(1042, houseTok, 'member')).toBe(false)
    expect(verifyConversationToken(1042, memberTok, 'house')).toBe(false)
    expect(verifyConversationToken(1042, memberTok, 'member')).toBe(true)
  })

  it('a token for one ref never verifies for another (non-transferable)', () => {
    const tok = makeConversationToken(1000)
    expect(verifyConversationToken(1000, tok)).toBe(true)
    expect(verifyConversationToken(1001, tok)).toBe(false)
  })

  it('extracts the address from a "Name <addr>" To header', () => {
    const addr = buildConversationReplyAddress(2001)
    const parsed = parseConversationReplyAddress(`Frequency Support <${addr}>`)
    expect(parsed?.ref).toBe('2001')
  })

  it('finds our reply address among a comma-separated recipient list', () => {
    const addr = buildConversationReplyAddress(3003)
    const parsed = parseConversationReplyAddress(`someone@example.com, ${addr}, cc@example.com`)
    expect(parsed?.ref).toBe('3003')
  })

  it('returns null for a non-reply address, wrong domain, or malformed local part', () => {
    expect(parseConversationReplyAddress('hello@frequencylocal.com')).toBeNull()
    expect(parseConversationReplyAddress(`reply+9-${'a'.repeat(32)}@evil.example.com`)).toBeNull()
    expect(parseConversationReplyAddress(`reply+notanumber-${'a'.repeat(32)}@${REPLY_DOMAIN}`)).toBeNull()
    expect(parseConversationReplyAddress(`reply+5@${REPLY_DOMAIN}`)).toBeNull() // no token
    expect(parseConversationReplyAddress(null)).toBeNull()
    expect(parseConversationReplyAddress('')).toBeNull()
  })

  it('verify fails closed on bad length / non-hex', () => {
    expect(verifyConversationToken(1, 'short')).toBe(false)
    expect(verifyConversationToken(1, 'z'.repeat(32))).toBe(false)
  })
})

// ── scan2 L3-06 (2026-09-05): the pre-check every outbound conversation path runs before it writes ──

describe('conversationSigningAvailable', () => {
  const saved = new Map<string, string | undefined>()
  function setEnv(patch: Record<string, string | undefined>) {
    for (const k of Object.keys(patch)) if (!saved.has(k)) saved.set(k, process.env[k])
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete (process.env as Record<string, string | undefined>)[k]
      else (process.env as Record<string, string>)[k] = v
    }
  }
  afterEach(() => {
    for (const [k, v] of saved) {
      if (v === undefined) delete (process.env as Record<string, string | undefined>)[k]
      else (process.env as Record<string, string>)[k] = v
    }
    saved.clear()
    vi.restoreAllMocks()
  })

  it('production without the secret: false, logged with a structured reason, and the builder it guards throws', () => {
    setEnv({ NODE_ENV: 'production', CONVERSATION_TOKEN_SECRET: undefined })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(conversationSigningAvailable()).toBe(false)
    expect(err).toHaveBeenCalledTimes(1)
    const [msg, detail] = err.mock.calls[0] as [string, { reason: string }]
    expect(msg).toContain('[comms]')
    expect(detail.reason).toContain('CONVERSATION_TOKEN_SECRET')
    // The control: this is the 500 the pre-check exists to keep out of a send.
    expect(() => buildConversationReplyAddress(1042)).toThrow(/CONVERSATION_TOKEN_SECRET/)
  })

  it('production with the secret: true, nothing logged', () => {
    setEnv({ NODE_ENV: 'production', CONVERSATION_TOKEN_SECRET: 'test-conversation-secret-please-32-bytes' })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(conversationSigningAvailable()).toBe(true)
    expect(err).not.toHaveBeenCalled()
  })

  it('the member-safe copy is plain and carries no dash', () => {
    expect(CONVERSATION_SIGNING_UNAVAILABLE_COPY).not.toMatch(/[\u2013\u2014]/)
    expect(CONVERSATION_SIGNING_UNAVAILABLE_COPY).toMatch(/Nothing was sent/)
  })
})
