import { describe, it, expect } from 'vitest'
import { safeHttpUrl, normalizeHttpUrl } from './safe-url'

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

describe('normalizeHttpUrl', () => {
  it('defaults scheme-less poster links to https', () => {
    expect(normalizeHttpUrl('instagram.com/myevent')).toBe('https://instagram.com/myevent')
    expect(normalizeHttpUrl('frequency.app/events')).toBe('https://frequency.app/events')
    expect(normalizeHttpUrl('  eventbrite.com/e/123  ')).toBe('https://eventbrite.com/e/123')
  })

  it('strips leading slashes before defaulting the scheme', () => {
    expect(normalizeHttpUrl('//cdn.example.com/x')).toBe('https://cdn.example.com/x')
  })

  it('passes through links that already carry http/https', () => {
    expect(normalizeHttpUrl('http://x.test')).toBe('http://x.test')
    expect(normalizeHttpUrl('https://x.test/a?b=c')).toBe('https://x.test/a?b=c')
  })

  it('still blocks script-bearing schemes', () => {
    expect(normalizeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(normalizeHttpUrl('vbscript:msgbox(1)')).toBeNull()
  })

  it('handles empty and nullish input', () => {
    expect(normalizeHttpUrl('')).toBeNull()
    expect(normalizeHttpUrl('   ')).toBeNull()
    expect(normalizeHttpUrl(null)).toBeNull()
    expect(normalizeHttpUrl(undefined)).toBeNull()
  })
})
