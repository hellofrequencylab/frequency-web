import { describe, it, expect } from 'vitest'
import { sanitizeInlineHtml, inlineHtmlToText } from './block-content'

// The rich-inline sanitizer is the injection floor for the Email Studio canvas (Slice A): a `textarea`
// content field now stores LIMITED inline HTML, and this pure function is the ONE allowlist that both the
// SAVE path and the email renderer run. It is a truth table here — a regression that lets a <script>,
// an on*-handler, or a javascript: href through, or that strips a legitimate <b> / <a href="https://…">,
// fails the build. Voice canon note: the strings below are test fixtures, not shipped copy.

describe('sanitizeInlineHtml — the allowlist survives', () => {
  it('keeps bold / strong / italic / em marks', () => {
    expect(sanitizeInlineHtml('a <b>b</b> <strong>c</strong> <i>d</i> <em>e</em>')).toBe(
      'a <b>b</b> <strong>c</strong> <i>d</i> <em>e</em>',
    )
  })

  it('keeps a safe https link and adds rel="noopener noreferrer"', () => {
    expect(sanitizeInlineHtml('see <a href="https://frequencylocal.com">here</a>')).toBe(
      'see <a href="https://frequencylocal.com" rel="noopener noreferrer">here</a>',
    )
  })

  it('keeps mailto and relative hrefs', () => {
    expect(sanitizeInlineHtml('<a href="mailto:hi@x.com">mail</a>')).toContain('href="mailto:hi@x.com"')
    expect(sanitizeInlineHtml('<a href="/help">help</a>')).toContain('href="/help"')
  })

  it('converts newlines to <br>', () => {
    expect(sanitizeInlineHtml('one\ntwo')).toBe('one<br>two')
  })
})

describe('sanitizeInlineHtml — the dangerous parts are stripped', () => {
  it('strips a <script> tag (its text goes inert, no executable markup)', () => {
    const out = sanitizeInlineHtml('hi <script>alert(1)</script> bye')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('</script>')
    // The inner text survives, but only as escaped, inert text.
    expect(out).toBe('hi alert(1) bye')
  })

  it('strips an onclick (and every other) attribute from an allowed tag', () => {
    const out = sanitizeInlineHtml('<b onclick="steal()">x</b>')
    expect(out).toBe('<b>x</b>')
    expect(out).not.toContain('onclick')
  })

  it('drops a javascript: href (the link text survives, the anchor does not)', () => {
    const out = sanitizeInlineHtml('<a href="javascript:alert(1)">tap</a>')
    expect(out).toBe('tap')
    expect(out).not.toContain('<a')
    expect(out).not.toContain('javascript')
  })

  it('drops a data: href', () => {
    const out = sanitizeInlineHtml('<a href="data:text/html,<script>1</script>">x</a>')
    expect(out).not.toContain('<a')
    expect(out).not.toContain('data:')
  })

  it('escapes a bare < that is not a tag, and drops unknown tags like <img>', () => {
    expect(sanitizeInlineHtml('2 < 3')).toBe('2 &lt; 3')
    expect(sanitizeInlineHtml('<img src=x onerror=alert(1)>hi')).toBe('hi')
  })

  it('auto-closes an unbalanced mark so it never bleeds', () => {
    expect(sanitizeInlineHtml('<b>bold forever')).toBe('<b>bold forever</b>')
  })

  it('returns empty string for a non-string', () => {
    expect(sanitizeInlineHtml(null)).toBe('')
    expect(sanitizeInlineHtml(undefined)).toBe('')
    expect(sanitizeInlineHtml(42)).toBe('')
  })
})

describe('inlineHtmlToText — the plain-text projection never leaks a tag', () => {
  it('drops inline marks and keeps the text', () => {
    expect(inlineHtmlToText('a <b>b</b> <i>c</i>')).toBe('a b c')
  })

  it('drops an anchor tag but keeps its label', () => {
    expect(inlineHtmlToText('see <a href="https://x.com" rel="noopener noreferrer">here</a>')).toBe('see here')
  })

  it('turns <br> into a newline', () => {
    expect(inlineHtmlToText('one<br>two')).toBe('one\ntwo')
  })

  it('decodes the escaped entities back to characters', () => {
    // What sanitizeInlineHtml stores for the literal text `2 < 3 & "ok"`.
    expect(inlineHtmlToText('2 &lt; 3 &amp; &quot;ok&quot;')).toBe('2 < 3 & "ok"')
  })

  it('leaks no tag even from tokenized script markup (the text goes inert)', () => {
    const out = inlineHtmlToText('hi <script>alert(1)</script> bye')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('</script>')
    expect(out).toBe('hi alert(1) bye')
  })

  it('returns empty string for a non-string', () => {
    expect(inlineHtmlToText(null)).toBe('')
    expect(inlineHtmlToText(42)).toBe('')
  })
})
