import { beforeAll, describe, expect, it } from 'vitest'
import {
  buildConversationReplyAddress,
  buildThreadReplyAddress,
  parseConversationReplyAddress,
  parseThreadReplyAddress,
  verifyNoticeToken,
} from './reply-address'

const NOTICE = '0f8fad5b-d9cb-469f-a165-70867728950e'

beforeAll(() => {
  process.env.CONVERSATION_TOKEN_SECRET = 'test-conversation-secret-please-32-bytes'
})

describe('thread reply addresses (EMAIL-090)', () => {
  it('round-trips a notice id and verifies its tag', () => {
    const addr = buildThreadReplyAddress(NOTICE) as string
    expect(addr.split('@')[0].length).toBeLessThanOrEqual(64)
    const parsed = parseThreadReplyAddress(`Frequency <${addr}>`)
    expect(parsed?.noticeId).toBe(NOTICE)
    expect(verifyNoticeToken(parsed!.noticeId, parsed!.token)).toBe(true)
  })

  it('refuses a tag minted for another notice', () => {
    const other = parseThreadReplyAddress(buildThreadReplyAddress('11111111-2222-4333-8444-555555555555'))!
    expect(verifyNoticeToken(NOTICE, other.token)).toBe(false)
  })

  it('never confuses a conversation address with a thread address', () => {
    expect(parseThreadReplyAddress(buildConversationReplyAddress(1042))).toBeNull()
    expect(parseConversationReplyAddress(buildThreadReplyAddress(NOTICE))).toBeNull()
  })
})
