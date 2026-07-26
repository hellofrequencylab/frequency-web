import { describe, it, expect } from 'vitest'
import { splitQuotedReply } from './quoted-reply'

describe('splitQuotedReply', () => {
  it('splits at the Gmail "On ... wrote:" attribution, keeping both halves', () => {
    const raw =
      'Sounds great, see you Tuesday!\n\n' +
      'On Sat, Jul 25, 2026 at 11:36 AM Daniel Tyack via Frequency <reply+42-abc@reply.frequencylocal.com> wrote:\n' +
      '> Are you free Tuesday?\n> The circle meets at 7.'
    const out = splitQuotedReply(raw)
    expect(out.visible).toBe('Sounds great, see you Tuesday!')
    expect(out.quoted).toContain('On Sat, Jul 25, 2026 at 11:36 AM Daniel Tyack via Frequency')
    expect(out.quoted).toContain('> Are you free Tuesday?')
  })

  it('handles an attribution line that wrapped onto a second line', () => {
    const raw =
      'Yes please.\n\n' +
      'On Sat, Jul 25, 2026 at 11:36 AM Daniel Tyack via Frequency\n<reply+42-abc@reply.frequencylocal.com> wrote:\n' +
      '> Want me to add you?'
    const out = splitQuotedReply(raw)
    expect(out.visible).toBe('Yes please.')
    expect(out.quoted).toContain('wrote:')
  })

  it('splits at a bare "> " quoted block with no attribution', () => {
    const out = splitQuotedReply('Got it, thanks.\n\n> Original announcement text\n> continues here')
    expect(out.visible).toBe('Got it, thanks.')
    expect(out.quoted).toBe('> Original announcement text\n> continues here')
  })

  it('splits at an Outlook "-----Original Message-----" divider', () => {
    const out = splitQuotedReply('Confirmed.\n\n-----Original Message-----\nFrom: Daniel\nSubject: Hello')
    expect(out.visible).toBe('Confirmed.')
    expect(out.quoted).toContain('Original Message')
  })

  it('splits at an Outlook "From: ... Sent: ..." header block', () => {
    const out = splitQuotedReply('Works for me.\n\nFrom: Daniel Tyack\nSent: Saturday, July 25, 2026\nTo: Sam')
    expect(out.visible).toBe('Works for me.')
    expect(out.quoted).toContain('Sent: Saturday, July 25, 2026')
  })

  it('splits at a long underscore rule', () => {
    const out = splitQuotedReply('Reply text.\n\n________________________________\nQuoted body below the rule')
    expect(out.visible).toBe('Reply text.')
    expect(out.quoted).toContain('Quoted body below the rule')
  })

  it('returns the whole message with quoted null when there is no trail', () => {
    const out = splitQuotedReply('Just a normal message.\nTwo lines, no quoting.')
    expect(out.visible).toBe('Just a normal message.\nTwo lines, no quoting.')
    expect(out.quoted).toBeNull()
  })

  it('does not cut prose that merely contains the word wrote mid-sentence', () => {
    const out = splitQuotedReply('I read what she wrote: it was great.\nSee you soon.')
    // No line-start "On ..." attribution, so nothing splits.
    expect(out.quoted).toBeNull()
  })

  it('yields an empty visible part for a quote-only message', () => {
    const raw = 'On Fri, Jul 24, 2026 at 9:30 PM Daniel <d@x.com> wrote:\n> Ping?'
    const out = splitQuotedReply(raw)
    expect(out.visible).toBe('')
    expect(out.quoted).toContain('> Ping?')
  })

  it('splits an HTML body at the gmail_quote div', () => {
    const raw =
      '<div dir="ltr">New reply here</div><br><div class="gmail_quote"><div>On Sat, Jul 25, 2026 Daniel wrote:</div><blockquote class="gmail_quote">old</blockquote></div>'
    const out = splitQuotedReply(raw)
    expect(out.visible).toBe('<div dir="ltr">New reply here</div><br>')
    expect(out.quoted).toContain('class="gmail_quote"')
  })

  it('splits an HTML body at a plain blockquote', () => {
    const out = splitQuotedReply('<p>Thanks!</p><blockquote type="cite"><p>earlier</p></blockquote>')
    expect(out.visible).toBe('<p>Thanks!</p>')
    expect(out.quoted).toContain('<blockquote')
  })

  it('ignores "\\n>" inside an HTML body (markup, not a quote line)', () => {
    const raw = '<div\n>Hello</div><blockquote>old</blockquote>'
    const out = splitQuotedReply(raw)
    expect(out.visible).toBe('<div\n>Hello</div>')
    expect(out.quoted).toBe('<blockquote>old</blockquote>')
  })

  it('is fail-safe on empty input', () => {
    expect(splitQuotedReply('')).toEqual({ visible: '', quoted: null })
    expect(splitQuotedReply(null)).toEqual({ visible: '', quoted: null })
    expect(splitQuotedReply(undefined)).toEqual({ visible: '', quoted: null })
  })
})
