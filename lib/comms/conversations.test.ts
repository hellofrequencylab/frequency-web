import { describe, it, expect, afterEach, vi } from 'vitest'

// scan2 L3-02 (2026-09-05): the Message-ID host. `@next/env` loads `EMAIL_MESSAGE_ID_HOST=` (the
// `.env.example` shape) as '', and `??` kept it, so every outbound conversation message carried
// `<conv.<ref>.<uuid>@>`, which mail clients cannot thread. Blank now counts as unset.

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/crm/interactions', () => ({
  recordContactInteraction: vi.fn(),
  normalizeInteractionScope: (s: unknown) => s,
}))

import { newConversationMessageId } from './conversations'

const KEY = 'EMAIL_MESSAGE_ID_HOST'
const saved = process.env[KEY]
afterEach(() => {
  if (saved === undefined) delete process.env[KEY]
  else process.env[KEY] = saved
})

function hostOf(messageId: string): string {
  return messageId.slice(messageId.lastIndexOf('@') + 1, -1)
}

describe('newConversationMessageId', () => {
  it('uses the default host when the variable is unset', () => {
    delete process.env[KEY]
    const id = newConversationMessageId(1042)
    expect(id).toMatch(/^<conv\.1042\.[0-9a-f-]{36}@send\.frequencylocal\.com>$/)
  })

  it('a BLANK variable also falls back to the default (never `@>`)', () => {
    process.env[KEY] = ''
    const id = newConversationMessageId(1042)
    expect(hostOf(id)).toBe('send.frequencylocal.com')
    expect(id).not.toContain('@>')
    process.env[KEY] = '   '
    expect(hostOf(newConversationMessageId(7))).toBe('send.frequencylocal.com')
  })

  it('a set host is used, trimmed', () => {
    process.env[KEY] = ' mail.example.test '
    expect(hostOf(newConversationMessageId(1))).toBe('mail.example.test')
  })
})
