import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { safeWebsite } from './website'

// safeWebsite (L9-02): the one seam between `profiles.website` (free text the member typed) and
// an <a href> on their public profile. Renders http(s) only, reads a bare domain as https, and
// refuses everything that is not a website.

describe('safeWebsite renders a real website', () => {
  it('passes an https URL through and labels it with the bare hostname', () => {
    expect(safeWebsite('https://www.example.com/about?x=1')).toEqual({
      href: 'https://www.example.com/about?x=1',
      label: 'example.com',
    })
  })

  it('keeps http (not upgraded, not refused)', () => {
    expect(safeWebsite('http://example.org')).toEqual({ href: 'http://example.org/', label: 'example.org' })
  })

  it('reads a bare domain (missing scheme) as https', () => {
    expect(safeWebsite('example.com')).toEqual({ href: 'https://example.com/', label: 'example.com' })
    expect(safeWebsite('  www.example.com/portfolio  ')).toEqual({
      href: 'https://www.example.com/portfolio',
      label: 'example.com',
    })
  })

  it('is case-insensitive on the scheme', () => {
    expect(safeWebsite('HTTPS://Example.COM')).toEqual({ href: 'https://example.com/', label: 'example.com' })
  })
})

describe('safeWebsite refuses what is not a website', () => {
  it.each([
    ['javascript: URL', 'javascript:alert(1)'],
    ['javascript: URL, mixed case', 'JavaScript:alert(1)'],
    ['data: URL', 'data:text/html,<script>alert(1)</script>'],
    ['mailto:', 'mailto:someone@example.com'],
    ['ftp:', 'ftp://example.com/file'],
    ['scheme-relative', '//evil.example/path'],
    ['credentials in the URL', 'https://user:pass@example.com'],
    ['a bare word with no dot', 'localhost'],
    ['a sentence', 'my site is cool'],
    ['empty', ''],
    ['whitespace', '   '],
  ])('%s', (_label, raw) => {
    expect(safeWebsite(raw)).toBeNull()
  })

  it('null and undefined read as no website', () => {
    expect(safeWebsite(null)).toBeNull()
    expect(safeWebsite(undefined)).toBeNull()
  })
})

describe('the public profile renders it (L9-02)', () => {
  const page = readFileSync(path.join(process.cwd(), 'app/(main)/people/[handle]/page.tsx'), 'utf8')

  it('selects profiles.website and routes it through safeWebsite', () => {
    // The column has to be in the ONE profile read, or the value never reaches the page.
    expect(page).toMatch(/\.select\(`[\s\S]*?\bwebsite,[\s\S]*?`\)/)
    expect(page).toContain("import { safeWebsite } from '@/lib/profiles/website'")
    expect(page).toContain('safeWebsite(profile.website)')
  })

  it('renders it as a hardened external link with the hostname as the label', () => {
    const anchor = page.match(/<a\s+href=\{website\.href\}[\s\S]*?<\/a>/)?.[0]
    expect(anchor, 'the website anchor').toBeTruthy()
    expect(anchor).toContain('target="_blank"')
    expect(anchor).toContain('rel="noopener noreferrer nofollow"')
    expect(anchor).toContain('{website.label}')
  })
})
