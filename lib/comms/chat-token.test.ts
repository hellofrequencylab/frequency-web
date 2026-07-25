import { describe, it, expect, beforeAll } from 'vitest'
import { makeChatToken, verifyChatToken } from './chat-token'
import { makeConversationToken } from './reply-address'

beforeAll(() => {
  process.env.CONVERSATION_TOKEN_SECRET = 'test-conversation-secret-please-32-bytes'
})

describe('chat-token', () => {
  it('round-trips a ref and rejects a wrong tag', () => {
    const tok = makeChatToken(1002)
    expect(tok).toHaveLength(32)
    expect(verifyChatToken(1002, tok)).toBe(true)
    expect(verifyChatToken(1002, '0'.repeat(32))).toBe(false)
  })

  it('is not transferable between refs', () => {
    const tok = makeChatToken(1002)
    expect(verifyChatToken(1003, tok)).toBe(false)
  })

  it('is a DISTINCT derivation from the reply-address token (no cross-use)', () => {
    expect(makeChatToken(1002)).not.toBe(makeConversationToken(1002))
  })

  it('fails closed on bad input', () => {
    expect(verifyChatToken(1002, '')).toBe(false)
    expect(verifyChatToken(1002, 'short')).toBe(false)
  })
})
