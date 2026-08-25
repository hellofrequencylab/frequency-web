import { describe, it, expect } from 'vitest'
import { briefError } from './log'

// Every case here is taken from the 2026-08-25 02:18-02:53 Supabase incident, because a
// helper written against imagined inputs is how the two defects it replaces got written.
describe('briefError', () => {
  it('prefers a real message over stringifying the object', () => {
    expect(briefError(new Error('boom'))).toBe('boom')
    // The exact shape that logged "[object Object]": a PostgrestError is a plain object with a
    // message, and String() on it says nothing. This is the regression arm.
    const postgrest = { message: 'Timed out acquiring connection from connection pool.', code: '57014' }
    expect(briefError(postgrest)).toBe('Timed out acquiring connection from connection pool.')
    expect(briefError(postgrest)).not.toContain('[object Object]')
  })

  it('never returns "[object Object]" for an object with no message', () => {
    // The fields ARE the diagnosis when there is no message; String() throws them away.
    const out = briefError({ code: 'PGRST301', hint: 'check the JWT' })
    expect(out).not.toBe('[object Object]')
    expect(out).toContain('PGRST301')
    expect(out).toContain('check the JWT')
  })

  it('survives a circular object rather than throwing inside the logger', () => {
    // A logger that throws while reporting an error turns one incident into two.
    const circular: Record<string, unknown> = { code: 'X' }
    circular.self = circular
    expect(() => briefError(circular)).not.toThrow()
  })

  it('collapses an upstream HTML error page to the line that carries the diagnosis', () => {
    // The real shape: ~15 KB of Cloudflare markup whose <title> is the whole answer. Logged raw,
    // each occurrence hashed to its own Vercel error group because the Ray ID differs per request.
    const page = [
      '<!DOCTYPE html>',
      '<html class="no-js" lang="en-US"><head>',
      '<title>supabase.co | 522: Connection timed out</title>',
      '</head><body><div id="cf-wrapper">',
      'x'.repeat(15000),
      '<span>Cloudflare Ray ID: <strong>a3074a1d4ee7cd01</strong></span>',
      '</div></body></html>',
    ].join('\n')
    const out = briefError(page)
    expect(out).toBe('upstream returned an HTML error page: supabase.co | 522: Connection timed out')
    // The grouping property, stated directly: two requests during ONE outage differ only by Ray
    // ID, and must produce the SAME line or the incident splits across groups.
    const other = page.replace('a3074a1d4ee7cd01', 'a3074a363a2ae3e3')
    expect(briefError(other)).toBe(out)
  })

  it('still collapses an HTML page that has no title', () => {
    expect(briefError('<!DOCTYPE html><html><body>nope</body></html>')).toBe(
      'upstream returned an HTML error page',
    )
  })

  it('reaches the page when it arrives as an Error message, not a bare string', () => {
    // How it actually arrives: the client wraps the body in an Error.
    const e = new Error('<!DOCTYPE html><html><head><title>supabase.co | 521: Web server is down</title></head></html>')
    expect(briefError(e)).toBe('upstream returned an HTML error page: supabase.co | 521: Web server is down')
  })

  it('bounds the length and says how much it dropped', () => {
    const out = briefError('y'.repeat(1000), 100)
    expect(out.length).toBeLessThan(140)
    expect(out).toContain('(+900 chars)')
    // A truncated line must never read as the whole message.
    expect(out).toContain('…')
  })

  it('leaves an ordinary short message exactly alone', () => {
    expect(briefError('relation "x" does not exist')).toBe('relation "x" does not exist')
  })

  it('normalises whitespace so one message is one line', () => {
    expect(briefError('a\n  b\t c')).toBe('a b c')
  })
})
