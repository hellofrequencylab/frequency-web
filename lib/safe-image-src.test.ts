import { describe, it, expect } from 'vitest'
import { safeImageSrc, safeUploadPreviewSrc } from './safe-image-src'

// Locks the <img src> allowlist. The dangerous cases are the point: a src that arrives from a
// DB column or a Puck field must not be able to carry a script-bearing scheme through.

describe('safeImageSrc', () => {
  it('allows the four legitimate shapes', () => {
    expect(safeImageSrc('blob:https://app.local/9f2c-1')).toBe('blob:https://app.local/9f2c-1')
    expect(safeImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(safeImageSrc('data:image/svg+xml,%3Csvg/%3E')).toBe('data:image/svg+xml,%3Csvg/%3E')
    expect(safeImageSrc('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg')
    expect(safeImageSrc('http://cdn.example.com/a.jpg')).toBe('http://cdn.example.com/a.jpg')
    expect(safeImageSrc('/images/site/hero.jpg')).toBe('/images/site/hero.jpg')
  })

  it('rejects script-bearing and non-image schemes', () => {
    expect(safeImageSrc('javascript:alert(1)')).toBeNull()
    expect(safeImageSrc('  javascript:alert(1)')).toBeNull()
    expect(safeImageSrc('JavaScript:alert(1)')).toBeNull()
    expect(safeImageSrc('vbscript:msgbox')).toBeNull()
    expect(safeImageSrc('file:///etc/passwd')).toBeNull()
    // data: that is not an image (an HTML payload) stays out.
    expect(safeImageSrc('data:text/html,<script>alert(1)</script>')).toBeNull()
    // An opaque-origin blob — what a sandboxed document mints. A blob: URL carries its
    // creator's origin inside it, and `null` there means we cannot say who made it.
    expect(safeImageSrc('blob:null/9f2c-1')).toBeNull()
  })

  it('does not answer differently on the server than in the browser', () => {
    // This ran through `typeof window !== 'undefined'` once, which made every server render
    // silently drop blob previews. The allowlist must depend only on its argument.
    expect(typeof window).toBe('undefined')
    expect(safeImageSrc('blob:https://app.local/9f2c-1')).toBe('blob:https://app.local/9f2c-1')
  })

  it("normalises a same-origin path rather than passing the caller's string through", () => {
    // The value that reaches the DOM is the URL parser's, never the input. A guard that hands back
    // its argument unchanged is not a guard, it is a spelling check.
    expect(safeImageSrc('/loom/../loom/a.jpg')).toBe('/loom/a.jpg')
    expect(safeImageSrc('/loom/a b.jpg')).toBe('/loom/a%20b.jpg')
    expect(safeImageSrc('/loom/a.jpg?width=400')).toBe('/loom/a.jpg?width=400')
  })

  it('refuses a protocol-relative value, which starts with a slash but points off-origin', () => {
    // `//evil.test/a.jpg` inherits the page scheme and loads from another host. It used to pass
    // through untouched on the strength of its leading slash.
    expect(safeImageSrc('//evil.test/a.jpg')).toBeNull()
    expect(safeImageSrc('//evil.test')).toBeNull()
  })

  it('treats empty and absent values as no image', () => {
    expect(safeImageSrc(null)).toBeNull()
    expect(safeImageSrc(undefined)).toBeNull()
    expect(safeImageSrc('')).toBeNull()
    expect(safeImageSrc('   ')).toBeNull()
  })

  it('trims, so a padded value is not rejected for whitespace alone', () => {
    expect(safeImageSrc('  https://cdn.example.com/a.jpg  ')).toBe('https://cdn.example.com/a.jpg')
  })
})

// The narrow sibling used by every upload-preview sink (lib/safe-image-src.ts names them). Its
// whole job is to be TIGHTER than safeImageSrc, so the tests that matter are the ones where the
// two disagree.

describe('safeUploadPreviewSrc', () => {
  it('allows the only two shapes an upload preview can actually be', () => {
    // createObjectURL output, and the http(s) URL the file gets once it has uploaded.
    expect(safeUploadPreviewSrc('blob:https://app.local/9f2c-1')).toBe('blob:https://app.local/9f2c-1')
    expect(safeUploadPreviewSrc('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg')
  })

  it('is stricter than safeImageSrc on the shapes a preview cannot produce', () => {
    // Both of these are legitimate for a general <img src> and safeImageSrc allows them.
    // A preview has no route to either, so permitting them would be slack in the guard.
    expect(safeImageSrc('data:image/png;base64,iVBORw0KGgo=')).not.toBeNull()
    expect(safeUploadPreviewSrc('data:image/png;base64,iVBORw0KGgo=')).toBeNull()

    expect(safeImageSrc('/logo.png')).not.toBeNull()
    expect(safeUploadPreviewSrc('/logo.png')).toBeNull()
  })

  it('inherits every rejection the base allowlist makes', () => {
    expect(safeUploadPreviewSrc('javascript:alert(1)')).toBeNull()
    expect(safeUploadPreviewSrc('blob:null/9f2c-1')).toBeNull()
    expect(safeUploadPreviewSrc(null)).toBeNull()
    expect(safeUploadPreviewSrc(undefined)).toBeNull()
    expect(safeUploadPreviewSrc('')).toBeNull()
  })

  it('allows what a browser and the uploader really produce', () => {
    expect(safeUploadPreviewSrc('blob:https://app.local/550e8400-e29b-41d4-a716-446655440000')).toBe(
      'blob:https://app.local/550e8400-e29b-41d4-a716-446655440000',
    )
    expect(safeUploadPreviewSrc('blob:http://localhost:3000/550E8400-E29B-41D4-A716-446655440000')).toBe(
      'blob:http://localhost:3000/550E8400-E29B-41D4-A716-446655440000',
    )
    // lib/storage/profile-images.ts: the public URL plus a cache-busting query.
    const uploaded = 'https://abc.supabase.co/storage/v1/object/public/avatars/0b6f-4e/avatar.jpg?t=1790000000000'
    expect(safeUploadPreviewSrc(uploaded)).toBe(uploaded)
    // The parser's serialisation is what comes back, so case and IDN hosts are normalised.
    expect(safeUploadPreviewSrc('HTTPS://CDN.EXAMPLE.COM/A.JPG')).toBe('https://cdn.example.com/A.JPG')
    expect(safeUploadPreviewSrc('https://bücher.example/a.jpg')).toBe('https://xn--bcher-kva.example/a.jpg')
  })

  // HYG-137. A blob: URL's path is opaque, so the URL parser hands it back as written: before the
  // whole-string allowlist, every one of these came out of safeUploadPreviewSrc verbatim, quotes
  // and angle brackets included.
  it('refuses a blob: URL whose id carries markup or anything createObjectURL never writes', () => {
    for (const hostile of [
      'blob:https://app.local/"><img src=x onerror=alert(1)>',
      "blob:https://app.local/x' onerror='alert(1)",
      'blob:https://app.local/a b<c>',
      'blob:https://app.local/a`b',
      'blob:https://app.local/',
      'blob:https://app.local/a/b',
      'blob:https://[::1]:3000/9f2c-1',
      'blob:https://app.local/9f2c-1#x',
      'blob:javascript:alert(1)',
      'blob:blob:https://app.local/9f2c-1',
      'blob:data:text/html,<script>alert(1)</script>',
    ]) {
      expect(safeUploadPreviewSrc(hostile), hostile).toBeNull()
    }
  })

  it('refuses every script-bearing, inline or off-origin shape an attacker would try', () => {
    for (const hostile of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      '\tjavascript:alert(1)',
      'java\nscript:alert(1)',
      ' javascript:alert(document.cookie)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'data:image/svg+xml,<svg onload=alert(1)>',
      'file:///etc/passwd',
      '//evil.test/a.jpg',
      '/\\evil.test/a.jpg',
      'https://user:pw@evil.test/a.jpg',
      'https://cdn.example.com/a.jpg#"><script>',
      "https://cdn.example.com/it's.jpg",
    ]) {
      expect(safeUploadPreviewSrc(hostile), hostile).toBeNull()
    }
  })

  it('never returns a character that could end or open an HTML attribute or tag', () => {
    const tries = [
      'blob:https://app.local/9f2c-1',
      'https://cdn.example.com/a"b<c>d e`f.jpg',
      'https://cdn.example.com/a.jpg?x="<>&y=1',
      'https://cdn.example.com/%22%3E%3Cscript%3E.jpg',
      'blob:https://app.local/"><img src=x onerror=alert(1)>',
    ]
    for (const t of tries) {
      const out = safeUploadPreviewSrc(t)
      if (out !== null) expect(out, t).not.toMatch(/["'<>`\s\\]/)
    }
    // The encoded forms survive as encoded text, which is inert in a src.
    expect(safeUploadPreviewSrc('https://cdn.example.com/a"b.jpg')).toBe('https://cdn.example.com/a%22b.jpg')
  })
})

