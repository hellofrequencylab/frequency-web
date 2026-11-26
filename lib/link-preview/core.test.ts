import { describe, expect, it } from 'vitest'
import { firstLink, normalizeUrl, parsePreview } from './core'

describe('firstLink', () => {
  it('finds the first link and trims trailing punctuation', () => {
    expect(firstLink('see https://Example.com/a?b=1#top, and more')).toBe('https://example.com/a?b=1')
  })
  it('never reads a tag token as a link', () => {
    expect(firstLink('#[Spring](plan:0f8fad5b-d9cb-469f-a165-70867728950e) is set')).toBeNull()
  })
  it('is null without a link', () => {
    expect(firstLink('no links here')).toBeNull()
  })
})

describe('normalizeUrl', () => {
  it('refuses credentials and other schemes', () => {
    expect(normalizeUrl('https://user:pw@example.com')).toBeNull()
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeUrl('ftp://example.com')).toBeNull()
  })
})

describe('parsePreview', () => {
  const html = `<html><head><title>Fallback</title>
    <meta property="og:title" content="Spring Market &amp; Fair">
    <meta name="description" content="Local makers, Saturday.">
    <meta property="og:image" content="/img/cover.jpg">
    <meta property="og:site_name" content='Town Hall'></head></html>`
  it('reads Open Graph first and makes the image absolute', () => {
    expect(parsePreview(html, 'https://town.example/events/spring')).toEqual({
      title: 'Spring Market & Fair',
      description: 'Local makers, Saturday.',
      imageUrl: 'https://town.example/img/cover.jpg',
      siteName: 'Town Hall',
    })
  })
  it('falls back to <title> and drops a non-https image', () => {
    const p = parsePreview('<title>Just a page</title><meta property="og:image" content="http://x.example/a.png">', 'https://x.example/')
    expect(p.title).toBe('Just a page')
    expect(p.imageUrl).toBeNull()
  })
})
