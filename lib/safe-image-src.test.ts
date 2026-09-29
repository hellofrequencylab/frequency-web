import { describe, it, expect } from 'vitest'
import { safeImageSrc, safeUploadPreviewSrc } from './safe-image-src'

const BLOB = 'blob:https://app.local/550e8400-e29b-41d4-a716-446655440000'
const PNG = 'data:image/png;base64,iVBORw0KGgo='
const REMOTE = 'https://abc.supabase.co/storage/v1/object/public/avatars/a.jpg'

describe('safeImageSrc', () => {
  it('allows the four legitimate shapes, unchanged', () => {
    expect(safeImageSrc('/images/hero.png')).toBe('/images/hero.png')
    expect(safeImageSrc('/api/og?title=x')).toBe('/api/og?title=x')
    expect(safeImageSrc(PNG)).toBe(PNG)
    expect(safeImageSrc(REMOTE)).toBe(REMOTE)
    expect(safeImageSrc('http://cdn.example.com/a.jpg')).toBe('http://cdn.example.com/a.jpg')
    expect(safeImageSrc(BLOB)).toBe(BLOB)
  })

  it('rejects script-bearing schemes, inline SVG, and a protocol-relative host', () => {
    expect(safeImageSrc('javascript:alert(1)')).toBeNull()
    expect(safeImageSrc('  javascript:alert(1)')).toBeNull()
    expect(safeImageSrc('JavaScript:alert(1)')).toBeNull()
    expect(safeImageSrc('vbscript:msgbox(1)')).toBeNull()
    expect(safeImageSrc('file:///etc/passwd')).toBeNull()
    expect(safeImageSrc('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeImageSrc('data:image/svg+xml,<svg onload=alert(1)>')).toBeNull()
    expect(safeImageSrc('data:image/svg+xml,%3Csvg/%3E')).toBeNull()
    expect(safeImageSrc('//evil.test/a.jpg')).toBeNull()
    expect(safeImageSrc('//evil.test')).toBeNull()
    expect(safeImageSrc('blob:null/9f2c-1')).toBeNull()
  })

  it('rejects a blob path or a data body that carries a quote or an angle bracket', () => {
    expect(safeImageSrc('blob:https://app.local/"><img src=x onerror=alert(1)>')).toBeNull()
    expect(safeImageSrc("blob:https://app.local/x' onerror='alert(1)")).toBeNull()
    expect(safeImageSrc('data:image/png;base64,AAAA"><img src=x onerror=alert(1)>')).toBeNull()
  })

  it('does not answer differently on the server than in the browser', () => {
    expect(typeof window).toBe('undefined')
    expect(safeImageSrc(BLOB)).toBe(BLOB)
  })

  it('refuses a same-origin path with a space, and does not re-serialise a matching one', () => {
    expect(safeImageSrc('/loom/a.jpg?width=400')).toBe('/loom/a.jpg?width=400')
    expect(safeImageSrc('/loom/a b.jpg')).toBeNull()
  })

  it('treats empty and absent values as no image', () => {
    expect(safeImageSrc(null)).toBeNull()
    expect(safeImageSrc(undefined)).toBeNull()
    expect(safeImageSrc('')).toBeNull()
    expect(safeImageSrc('   ')).toBeNull()
  })

  it('trims, so a padded value is not rejected for whitespace alone', () => {
    expect(safeImageSrc(`  ${REMOTE}  `)).toBe(REMOTE)
  })
})

describe('safeUploadPreviewSrc', () => {
  it('allows the only two shapes an upload preview can actually be', () => {
    expect(safeUploadPreviewSrc(BLOB)).toBe(BLOB)
    expect(safeUploadPreviewSrc(REMOTE)).toBe(REMOTE)
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
