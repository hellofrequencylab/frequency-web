import { describe, it, expect, afterEach } from 'vitest'
import {
  coalesceBodies,
  conversationBatchWindowMinutes,
  conversationDigestWindowMinutes,
} from './outbound-batch'

describe('coalesceBodies', () => {
  it('is empty for no (or only blank) messages', () => {
    expect(coalesceBodies([])).toEqual({ text: '', html: '' })
    expect(coalesceBodies([{ body: '   ' }, { body: '' }])).toEqual({ text: '', html: '' })
  })

  it('passes a single message through without separator noise', () => {
    const { text, html } = coalesceBodies([{ body: 'hello there' }])
    expect(text).toBe('hello there')
    expect(html).not.toContain('<br><br>')
    expect(html).toContain('hello there')
  })

  it('joins multiple messages oldest-first with a blank line', () => {
    const { text } = coalesceBodies([{ body: 'first' }, { body: 'second' }, { body: 'third' }])
    expect(text).toBe('first\n\nsecond\n\nthird')
  })

  it('drops blank messages from the middle of a burst', () => {
    const { text } = coalesceBodies([{ body: 'a' }, { body: '  ' }, { body: 'b' }])
    expect(text).toBe('a\n\nb')
  })

  it('prefers a provided bodyHtml but derives html from body when absent', () => {
    const { html } = coalesceBodies([
      { body: 'plain', bodyHtml: null },
      { body: 'x', bodyHtml: '<p>rich</p>' },
    ])
    expect(html).toContain('<p>rich</p>')
    expect(html).toContain('plain')
  })

  it('escapes html-significant characters when deriving html from a plain body', () => {
    const { html } = coalesceBodies([{ body: '<script>alert(1)</script> & "x"' }])
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
  })
})

describe('conversation window parsing', () => {
  afterEach(() => {
    delete process.env.CONVERSATION_BATCH_WINDOW_MINUTES
    delete process.env.CONVERSATION_DIGEST_WINDOW_MINUTES
  })

  it('defaults to 0 (feature off) when unset', () => {
    expect(conversationBatchWindowMinutes()).toBe(0)
    expect(conversationDigestWindowMinutes()).toBe(0)
  })

  it('treats non-positive and garbage values as off', () => {
    for (const raw of ['0', '-5', 'abc', '', ' ']) {
      process.env.CONVERSATION_BATCH_WINDOW_MINUTES = raw
      expect(conversationBatchWindowMinutes()).toBe(0)
    }
  })

  it('reads a positive integer window', () => {
    process.env.CONVERSATION_BATCH_WINDOW_MINUTES = '15'
    expect(conversationBatchWindowMinutes()).toBe(15)
    process.env.CONVERSATION_DIGEST_WINDOW_MINUTES = '30'
    expect(conversationDigestWindowMinutes()).toBe(30)
  })

  it('clamps an oversized window to one day', () => {
    process.env.CONVERSATION_BATCH_WINDOW_MINUTES = '999999'
    expect(conversationBatchWindowMinutes()).toBe(1440)
  })
})
