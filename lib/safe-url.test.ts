import { describe, it, expect } from 'vitest'
import { safeHttpUrl } from './safe-url'

describe('safeHttpUrl', () => {
  it('passes http and https URLs through (trimmed)', () => {
    expect(safeHttpUrl('https://meet.example.com/abc')).toBe('https://meet.example.com/abc')
    expect(safeHttpUrl('http://x.test')).toBe('http://x.test')
    expect(safeHttpUrl('  https://x.test  ')).toBe('https://x.test')
  })

  it('blocks script-bearing schemes (stored XSS)', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('JavaScript:alert(1)')).toBeNull()
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeHttpUrl('vbscript:msgbox(1)')).toBeNull()
  })

  it('rejects relative paths, empty, and garbage', () => {
    expect(safeHttpUrl('/relative/path')).toBeNull()
    expect(safeHttpUrl('not a url')).toBeNull()
    expect(safeHttpUrl('')).toBeNull()
    expect(safeHttpUrl(null)).toBeNull()
    expect(safeHttpUrl(undefined)).toBeNull()
  })
})
