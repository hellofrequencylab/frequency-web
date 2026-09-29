import { describe, it, expect } from 'vitest'
import { safeImageSrc, safeUploadPreviewSrc } from './safe-image-src'

const BLOB = 'blob:https://app.local/550e8400-e29b-41d4-a716-446655440000'
const PNG = 'data:image/png;base64,iVBORw0KGgo='
const HTTP = 'https://abc.supabase.co/storage/v1/object/public/avatars/a.jpg'
const Q = String.fromCharCode(34)
const A = String.fromCharCode(39)

describe('safeImageSrc', () => {
  it('allows the five shapes the product actually paints', () => {
    expect(safeImageSrc('/images/hero.png')).toBe('/images/hero.png')
    expect(safeImageSrc('/api/og?title=x')).toBe('/api/og?title=x')
    expect(safeImageSrc(PNG)).toBe(PNG)
    expect(safeImageSrc(HTTP)).toBe(HTTP)
    expect(safeImageSrc(BLOB)).toBe(BLOB)
    expect(safeImageSrc('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg')
    expect(safeImageSrc('http://cdn.example.com/a.jpg')).toBe('http://cdn.example.com/a.jpg')
    expect(safeImageSrc('/images/site/hero.jpg')).toBe('/images/site/hero.jpg')
    expect(safeImageSrc('/loom/a.jpg?width=400')).toBe('/loom/a.jpg?width=400')
    expect(safeImageSrc('blob:http://localhost:3000/550e8400-e29b-41d4-a716-446655440000')).toBe(
      'blob:http://localhost:3000/550e8400-e29b-41d4-a716-446655440000',
    )
  })

  it('allows a percent-encoded SVG data URL, which is how a Loom site icon is stored', () => {
    const icon = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E'
    expect(safeImageSrc(icon)).toBe(icon)
  })

  it('rejects script-bearing schemes, inline SVG, and a blob or data: body that carries quotes', () => {
    expect(safeImageSrc('javascript:alert(1)')).toBeNull()
    expect(safeImageSrc('  javascript:alert(1)')).toBeNull()
    expect(safeImageSrc('JavaScript:alert(1)')).toBeNull()
    expect(safeImageSrc('vbscript:msgbox(1)')).toBeNull()
    expect(safeImageSrc('file:///etc/passwd')).toBeNull()
    expect(safeImageSrc('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeImageSrc('data:image/svg+xml,<svg onload=alert(1)>')).toBeNull()
    expect(safeImageSrc(`blob:https://app.local/${Q}><img src=x onerror=alert(1)>`)).toBeNull()
    expect(safeImageSrc(`blob:https://app.local/x${A} onerror=${A}alert(1)`)).toBeNull()
    expect(safeImageSrc(`data:image/png;base64,AAAA${Q}><img src=x onerror=alert(1)>`)).toBeNull()
    expect(safeImageSrc('blob:null/9f2c-1')).toBeNull()
    expect(safeImageSrc('blob:https://app.local/9f2c-1')).toBeNull()
  })

  it('does not answer differently on the server than in the browser', () => {
    expect(typeof window).toBe('undefined')
    expect(safeImageSrc(BLOB)).toBe(BLOB)
  })

  it('refuses a same-origin string that is not a clean path, instead of re-serialising it', () => {
    expect(safeImageSrc('/loom/../loom/a.jpg')).toBeNull()
    expect(safeImageSrc('/loom/a b.jpg')).toBeNull()
  })

  it('refuses a protocol-relative value, which starts with a slash but points off-origin', () => {
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

describe('safeUploadPreviewSrc', () => {
  it('allows the only two shapes an upload preview can actually be', () => {
    expect(safeUploadPreviewSrc(BLOB)).toBe(BLOB)
    expect(safeUploadPreviewSrc('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg')
  })

  it('is stricter than safeImageSrc on the shapes a preview cannot produce', () => {
    expect(safeImageSrc(PNG)).not.toBeNull()
    expect(safeUploadPreviewSrc(PNG)).toBeNull()

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
})
