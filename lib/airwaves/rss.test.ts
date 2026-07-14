import { describe, it, expect } from 'vitest'
import { buildShowRssXml, rfc822, itunesDuration, type FeedUrls } from './rss'
import type { ShowFeed, FeedEpisode } from './shows'
import type { Recording, Show } from './types'

// Airwaves P3 — the RSS builder is PURE + spec-critical (a malformed feed silently unsubscribes every
// listener), so it earns a focused unit test: a valid RSS 2.0 + iTunes channel, an escaped item, and
// the two date/duration edge cases. A FIXED buildDate keeps lastBuildDate deterministic.

const BUILD_DATE = new Date('2026-01-01T00:00:00Z')

function makeRecording(over: Partial<Recording> = {}): Recording {
  return {
    id: 'rec-1',
    spaceId: 'space-1',
    showId: 'show-1',
    loomAssetId: 'asset-1',
    mediaKind: 'audio',
    title: 'Episode One',
    slug: 'episode-one',
    description: 'A first episode.',
    transcript: null,
    chapters: null,
    durationSeconds: 3661,
    price: { mode: 'free' },
    requiredEntitlement: null,
    visibility: 'public',
    publishedAt: '2026-01-05T12:00:00Z',
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function makeShow(over: Partial<Show> = {}): Show {
  return {
    id: 'show-1',
    spaceId: 'space-1',
    slug: 'the-show',
    title: 'The Show',
    description: 'All about the thing.',
    author: 'The Host',
    coverAssetId: 'cover-1',
    itunesCategory: 'Society & Culture',
    explicit: false,
    language: 'en',
    ownerName: 'The Host',
    ownerEmail: 'host@example.com',
    feedVisibility: 'public',
    status: 'published',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function makeEpisode(recOver: Partial<Recording> = {}, encOver: Partial<FeedEpisode['enclosure']> = {}): FeedEpisode {
  return {
    recording: makeRecording(recOver),
    enclosure: { url: 'https://cdn.example.com/ep1.mp3', mime: 'audio/mpeg', bytes: 123456, ...encOver },
  }
}

const URLS: FeedUrls = {
  feedUrl: 'https://frequencylocal.com/podcasts/space/the-show/rss.xml',
  showPageUrl: 'https://frequencylocal.com/spaces/space/podcasts/the-show',
  episodeUrl: (ep) => `https://frequencylocal.com/spaces/space/podcasts/the-show#${ep.recording.slug ?? ep.recording.id}`,
}

describe('buildShowRssXml — channel', () => {
  const feed: ShowFeed = {
    show: makeShow(),
    coverUrl: 'https://cdn.example.com/cover.jpg',
    episodes: [makeEpisode()],
  }
  const xml = buildShowRssXml(feed, URLS, BUILD_DATE)

  it('declares the XML prolog and closes the rss root (well-formed)', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml.trimEnd().endsWith('</rss>')).toBe(true)
    expect(xml).toContain('<channel>')
    expect(xml).toContain('</channel>')
  })

  it('carries the required channel tags', () => {
    expect(xml).toContain('<title>The Show</title>')
    expect(xml).toContain(
      '<atom:link href="https://frequencylocal.com/podcasts/space/the-show/rss.xml" rel="self" type="application/rss+xml" />',
    )
    expect(xml).toContain('<itunes:image href="https://cdn.example.com/cover.jpg" />')
    expect(xml).toContain('<itunes:owner>')
    expect(xml).toContain('<itunes:name>The Host</itunes:name>')
    expect(xml).toContain('<itunes:email>host@example.com</itunes:email>')
    expect(xml).toContain('<itunes:category text="Society &amp; Culture" />')
    expect(xml).toContain('<itunes:explicit>false</itunes:explicit>')
  })
})

describe('buildShowRssXml — item', () => {
  const feed: ShowFeed = {
    show: makeShow(),
    coverUrl: 'https://cdn.example.com/cover.jpg',
    episodes: [makeEpisode()],
  }
  const xml = buildShowRssXml(feed, URLS, BUILD_DATE)

  it('has a guid, a full enclosure, a pubDate, and itunes:duration', () => {
    expect(xml).toContain('<guid isPermaLink="false">rec-1</guid>')
    expect(xml).toContain(
      '<enclosure url="https://cdn.example.com/ep1.mp3" length="123456" type="audio/mpeg" />',
    )
    expect(xml).toContain('<pubDate>Mon, 05 Jan 2026 12:00:00 GMT</pubDate>')
    expect(xml).toContain('<itunes:duration>01:01:01</itunes:duration>')
  })
})

describe('buildShowRssXml — escaping', () => {
  it('escapes & and < in a title (never emits raw metacharacters in a text node)', () => {
    const feed: ShowFeed = {
      show: makeShow({ title: 'Cats & Dogs < Pets' }),
      coverUrl: null,
      episodes: [makeEpisode({ title: 'A < B & C' })],
    }
    const xml = buildShowRssXml(feed, URLS, BUILD_DATE)
    expect(xml).toContain('<title>Cats &amp; Dogs &lt; Pets</title>')
    expect(xml).toContain('<title>A &lt; B &amp; C</title>')
    expect(xml).not.toContain('<title>Cats & Dogs')
    expect(xml).not.toContain('A < B & C')
  })
})

describe('buildShowRssXml — empty feed', () => {
  it('is still well-formed with zero episodes', () => {
    const feed: ShowFeed = { show: makeShow(), coverUrl: null, episodes: [] }
    const xml = buildShowRssXml(feed, URLS, BUILD_DATE)
    expect(xml.startsWith('<?xml')).toBe(true)
    expect(xml.trimEnd().endsWith('</rss>')).toBe(true)
    expect(xml).toContain('<channel>')
    expect(xml).toContain('</channel>')
    expect(xml).not.toContain('<item>')
  })
})

describe('rfc822', () => {
  it('formats a valid ISO date in GMT', () => {
    expect(rfc822('2026-01-01T00:00:00Z', BUILD_DATE)).toBe('Thu, 01 Jan 2026 00:00:00 GMT')
    expect(rfc822('2026-01-05T12:00:00Z', BUILD_DATE)).toBe('Mon, 05 Jan 2026 12:00:00 GMT')
  })

  it('falls back for a null / unparseable value', () => {
    expect(rfc822(null, BUILD_DATE)).toBe('Thu, 01 Jan 2026 00:00:00 GMT')
    expect(rfc822('not-a-date', BUILD_DATE)).toBe('Thu, 01 Jan 2026 00:00:00 GMT')
  })
})

describe('itunesDuration', () => {
  it('formats seconds as HH:MM:SS', () => {
    expect(itunesDuration(3661)).toBe('01:01:01')
    expect(itunesDuration(59)).toBe('00:00:59')
    expect(itunesDuration(3600)).toBe('01:00:00')
  })

  it('drops the tag (empty string) for null / invalid / non-positive input', () => {
    expect(itunesDuration(null)).toBe('')
    expect(itunesDuration(undefined)).toBe('')
    expect(itunesDuration(0)).toBe('')
    expect(itunesDuration(-5)).toBe('')
    expect(itunesDuration(Number.NaN)).toBe('')
  })
})
