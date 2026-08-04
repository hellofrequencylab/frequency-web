import { describe, it, expect } from 'vitest'
import { safeImageSrc } from './safe-image-src'

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
