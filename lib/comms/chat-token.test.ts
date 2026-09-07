import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { makeChatToken, verifyChatToken, chatSigningAvailable, isSupportChatAvailable, supportChatFlagEnabled } from './chat-token'
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

// ── scan2 L3-06 (2026-09-05): the runtime prerequisites as one boolean the layouts + action check ──

describe('isSupportChatAvailable', () => {
  const KEYS = ['NODE_ENV', 'CONVERSATION_TOKEN_SECRET', 'CRM_INBOX_OWNER_PROFILE_ID', 'SUPABASE_SERVICE_ROLE_KEY'] as const
  const saved = new Map<string, string | undefined>()
  function setEnv(patch: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
    for (const k of KEYS) if (!saved.has(k)) saved.set(k, process.env[k])
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
  })

  it('is false in production without the secret, and never throws', () => {
    setEnv({ NODE_ENV: 'production', CONVERSATION_TOKEN_SECRET: undefined, CRM_INBOX_OWNER_PROFILE_ID: 'owner-1' })
    expect(chatSigningAvailable()).toBe(false)
    expect(isSupportChatAvailable()).toBe(false)
    // The control: the thing it guards really does throw here.
    expect(() => makeChatToken(1)).toThrow()
  })

  it('is false when the inbox owner is unset or BLANK, even with a secret', () => {
    setEnv({ CONVERSATION_TOKEN_SECRET: 'test-conversation-secret-please-32-bytes', CRM_INBOX_OWNER_PROFILE_ID: undefined })
    expect(isSupportChatAvailable()).toBe(false)
    setEnv({ CRM_INBOX_OWNER_PROFILE_ID: '' })
    expect(isSupportChatAvailable()).toBe(false)
  })

  it('is true in production with both prerequisites set', () => {
    setEnv({ NODE_ENV: 'production', CONVERSATION_TOKEN_SECRET: 'test-conversation-secret-please-32-bytes', CRM_INBOX_OWNER_PROFILE_ID: 'owner-1' })
    expect(isSupportChatAvailable()).toBe(true)
  })

  it('outside production the dev fallback still signs (tests and local dev keep working)', () => {
    setEnv({ NODE_ENV: 'test', CONVERSATION_TOKEN_SECRET: undefined, SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-tests-0123456789abcdef', CRM_INBOX_OWNER_PROFILE_ID: 'owner-1' })
    expect(isSupportChatAvailable()).toBe(true)
  })
})

// ── LIVE-165 step one (2026-09-06): the switch prefers SUPPORT_CHAT, falls back to the old name ──

describe('supportChatFlagEnabled', () => {
  const KEYS = ['SUPPORT_CHAT', 'NEXT_PUBLIC_SUPPORT_CHAT'] as const
  const saved = new Map<string, string | undefined>()
  function setEnv(patch: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
    for (const k of KEYS) if (!saved.has(k)) saved.set(k, process.env[k])
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
  })

  it('is on for SUPPORT_CHAT=1 and off for any other value', () => {
    setEnv({ SUPPORT_CHAT: '1', NEXT_PUBLIC_SUPPORT_CHAT: undefined })
    expect(supportChatFlagEnabled()).toBe(true)
    setEnv({ SUPPORT_CHAT: '0' })
    expect(supportChatFlagEnabled()).toBe(false)
    setEnv({ SUPPORT_CHAT: 'true' })
    expect(supportChatFlagEnabled()).toBe(false)
  })

  it('FALLS BACK to the legacy NEXT_PUBLIC_ name while it is still the Vercel variable', () => {
    setEnv({ SUPPORT_CHAT: undefined, NEXT_PUBLIC_SUPPORT_CHAT: '1' })
    expect(supportChatFlagEnabled()).toBe(true)
    // Blank counts as unset, so an empty new variable does not shadow a live old one.
    setEnv({ SUPPORT_CHAT: '  ' })
    expect(supportChatFlagEnabled()).toBe(true)
  })

  it('an explicit SUPPORT_CHAT WINS over the legacy name in both directions', () => {
    setEnv({ SUPPORT_CHAT: '0', NEXT_PUBLIC_SUPPORT_CHAT: '1' })
    expect(supportChatFlagEnabled()).toBe(false)
    setEnv({ SUPPORT_CHAT: '1', NEXT_PUBLIC_SUPPORT_CHAT: '0' })
    expect(supportChatFlagEnabled()).toBe(true)
  })

  it('is off when neither is set', () => {
    setEnv({ SUPPORT_CHAT: undefined, NEXT_PUBLIC_SUPPORT_CHAT: undefined })
    expect(supportChatFlagEnabled()).toBe(false)
  })
})
