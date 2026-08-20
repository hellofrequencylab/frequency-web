import { describe, it, expect } from 'vitest'
import { valueFromServerUpload } from './upload-result'

// THE uploadFn / mode SEAM (LIVE-072).
//
// components/ui/image-upload.tsx's server-upload branch used to end in
// `onChange(`${res.url}?t=${Date.now()}`)` — unconditionally, because every consumer at the time
// was mode 'url'. Routing the create-event cover (mode 'path', column events.cover_image_path)
// through a server action would therefore have stored the literal string "undefined?t=1787…":
// a fixed upload, a broken cover, and nothing to catch it. This is the decision that branch now
// delegates to, tested for both modes so neither can silently take the other's behaviour.

describe('url mode', () => {
  it('hands back the public URL, cache-busted so a replace shows immediately', () => {
    expect(valueFromServerUpload('url', { url: 'https://cdn.test/a.png' }, 1234)).toEqual({
      value: 'https://cdn.test/a.png?t=1234',
    })
  })

  it('still takes the URL when the action returns both shapes', () => {
    expect(
      valueFromServerUpload('url', { url: 'https://cdn.test/a.png', path: 'p/a.png' }, 7),
    ).toEqual({ value: 'https://cdn.test/a.png?t=7' })
  })

  it('refuses a path-only result rather than writing "undefined" into a URL column', () => {
    const out = valueFromServerUpload('url', { path: 'p/a.png' }, 1)
    expect('error' in out).toBe(true)
    expect(JSON.stringify(out)).not.toContain('undefined')
  })
})

describe('path mode', () => {
  it('hands back the storage path verbatim', () => {
    expect(valueFromServerUpload('path', { path: 'prof-1/event-covers/x.png' }, 1234)).toEqual({
      value: 'prof-1/event-covers/x.png',
    })
  })

  it('never cache-busts a path (a query string breaks getPublicUrl)', () => {
    const out = valueFromServerUpload('path', { path: 'prof-1/event-covers/x.png' }, 1234)
    expect('value' in out && out.value).not.toContain('?t=')
  })

  it('prefers the path when the action returns both shapes', () => {
    expect(
      valueFromServerUpload('path', { url: 'https://cdn.test/a.png', path: 'p/a.png' }, 9),
    ).toEqual({ value: 'p/a.png' })
  })

  it('refuses a url-only result rather than storing a URL in a path column', () => {
    const out = valueFromServerUpload('path', { url: 'https://cdn.test/a.png' }, 1)
    expect('error' in out).toBe(true)
    expect(JSON.stringify(out)).not.toContain('https://cdn.test/a.png?t=')
  })
})

describe('an action that failed', () => {
  it('passes its message through in either mode', () => {
    expect(valueFromServerUpload('url', { error: 'Unauthorized' }, 1)).toEqual({ error: 'Unauthorized' })
    expect(valueFromServerUpload('path', { error: 'Unauthorized' }, 1)).toEqual({ error: 'Unauthorized' })
  })
})
