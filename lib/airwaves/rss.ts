// Airwaves P3 — the podcast RSS 2.0 + iTunes feed builder (ADR-608). PURE: it takes a fully-resolved
// ShowFeed (from lib/airwaves/shows.ts) plus the absolute URLs the caller computes, and returns a valid
// feed XML string. No IO, no Next imports, so it is unit-testable and safe to import into the RSS route.
//
// SPEC TARGET: Apple Podcasts + Spotify. A listable feed needs, at the channel: title, link, language,
// description, itunes:author, itunes:category, itunes:explicit, itunes:image (1400..3000px square),
// itunes:owner (name + email, used by Spotify/Apple to verify ownership), and an atom:link rel="self".
// Each item needs a stable guid, a pubDate (RFC 822), an enclosure (url + length + MIME), and
// itunes:duration. Everything user-authored is XML-escaped or CDATA-wrapped so a stray & or < never
// breaks the feed. No em / en dashes in any copy this file emits.

import type { ShowFeed, FeedEpisode } from './shows'

/** Escape the five XML metacharacters for use in an element/attribute text node. */
function xml(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Wrap authored rich/long text in CDATA so its markup passes through untouched (the `]]>` sentinel is
 *  split so it can never terminate the section early). */
function cdata(s: string | null | undefined): string {
  return `<![CDATA[${(s ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Format an ISO/parseable date as an RFC 822 date in GMT (the pubDate format podcast clients expect).
 *  A missing / unparseable value falls back to `fallback` (the show's build time), so an item always
 *  carries a valid pubDate. */
export function rfc822(value: string | null | undefined, fallback: Date): string {
  const t = value ? Date.parse(value) : NaN
  const d = Number.isFinite(t) ? new Date(t) : fallback
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} GMT`
  )
}

/** Format a duration in seconds as HH:MM:SS (itunes:duration). Null/invalid drops the tag (returns ''). */
export function itunesDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return ''
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}

/** The absolute URLs the feed needs, computed by the route (which knows the request origin + slugs). */
export interface FeedUrls {
  /** This feed's own canonical URL (atom:link rel="self"). */
  feedUrl: string
  /** The public Show page (channel <link>). */
  showPageUrl: string
  /** The public page for one episode (item <link> + guid permalink base). */
  episodeUrl: (episode: FeedEpisode) => string
}

/** Build one `<item>` for an Episode. */
function itemXml(ep: FeedEpisode, urls: FeedUrls, buildDate: Date, showExplicit: boolean): string {
  const r = ep.recording
  const link = urls.episodeUrl(ep)
  const duration = itunesDuration(r.durationSeconds)
  const parts: string[] = [
    '    <item>',
    `      <title>${xml(r.title)}</title>`,
    `      <link>${xml(link)}</link>`,
    `      <guid isPermaLink="false">${xml(r.id)}</guid>`,
    `      <pubDate>${rfc822(r.publishedAt, buildDate)}</pubDate>`,
    r.description ? `      <description>${cdata(r.description)}</description>` : '',
    r.description ? `      <itunes:summary>${cdata(r.description)}</itunes:summary>` : '',
    `      <enclosure url="${xml(ep.enclosure.url)}" length="${Math.max(0, Math.round(ep.enclosure.bytes))}" type="${xml(ep.enclosure.mime)}" />`,
    duration ? `      <itunes:duration>${duration}</itunes:duration>` : '',
    `      <itunes:explicit>${showExplicit ? 'true' : 'false'}</itunes:explicit>`,
    '    </item>',
  ]
  return parts.filter(Boolean).join('\n')
}

/**
 * Build the full RSS document for a Show's public feed. PURE. `buildDate` defaults to now (the caller may
 * pass a fixed date for a deterministic test). A feed with zero ready episodes is still valid (an empty
 * but well-formed channel), so a freshly published Show never emits malformed XML.
 */
export function buildShowRssXml(feed: ShowFeed, urls: FeedUrls, buildDate: Date = new Date()): string {
  const { show, coverUrl, episodes } = feed
  const explicit = show.explicit === true
  const channel: string[] = [
    '  <channel>',
    `    <title>${xml(show.title)}</title>`,
    `    <link>${xml(urls.showPageUrl)}</link>`,
    `    <atom:link href="${xml(urls.feedUrl)}" rel="self" type="application/rss+xml" />`,
    `    <language>${xml(show.language || 'en')}</language>`,
    show.description ? `    <description>${cdata(show.description)}</description>` : '    <description></description>',
    show.author ? `    <itunes:author>${xml(show.author)}</itunes:author>` : '',
    `    <itunes:type>episodic</itunes:type>`,
    `    <itunes:explicit>${explicit ? 'true' : 'false'}</itunes:explicit>`,
    `    <itunes:category text="${xml(show.itunesCategory)}" />`,
    coverUrl ? `    <itunes:image href="${xml(coverUrl)}" />` : '',
    coverUrl ? `    <image><url>${xml(coverUrl)}</url><title>${xml(show.title)}</title><link>${xml(urls.showPageUrl)}</link></image>` : '',
    show.ownerName || show.ownerEmail
      ? `    <itunes:owner>${show.ownerName ? `<itunes:name>${xml(show.ownerName)}</itunes:name>` : ''}${show.ownerEmail ? `<itunes:email>${xml(show.ownerEmail)}</itunes:email>` : ''}</itunes:owner>`
      : '',
    `    <lastBuildDate>${rfc822(buildDate.toISOString(), buildDate)}</lastBuildDate>`,
    ...episodes.map((ep) => itemXml(ep, urls, buildDate, explicit)),
    '  </channel>',
  ]
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" ` +
    `xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    channel.filter(Boolean).join('\n') +
    `\n</rss>\n`
  )
}
