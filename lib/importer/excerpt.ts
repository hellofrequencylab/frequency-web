// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER: the VERBATIM SOURCE EXCERPT for the composer / reframe prompts.
// PURE (no IO, no AI, no framework), so it is fully unit-testable.
//
// WHY: the page composer used to see only the compressed draft, so a business whose site we
// harvested at 21,958 chars reached the composer as 982 chars of summarised prose. Every
// sentence the owner actually wrote was gone by the time we wrote their page, and the copy
// came out generic. This module hands the composer the business's OWN WORDS, labeled with
// where each block came from, so the model can lift near-verbatim instead of inventing.
//
// WHAT: pick the highest-signal sources first (the operator paste, then the home page, then
// the about pages, then the offering pages, then the rest, then third-party search snippets
// last), strip the site chrome around the words (nav, cookie banners, copyright lines), and
// fill a character budget in that order so the tail is what gets cut.
//
// This is an EXCERPT, not a summary: the text is copied through unchanged. The only editing
// is dropping boilerplate lines and collapsing whitespace.
//
// No em dashes in any of this file's strings (CONTENT-VOICE §10).
// ─────────────────────────────────────────────────────────────────────────────

import type { HarvestedSource } from './intake'

export interface SourceExcerptOptions {
  /** Total character cap on the whole excerpt. Default 12_000. */
  maxChars?: number
  /** Per-source character cap for a crawled page. Default 3_000. */
  maxPerSource?: number
  /** Per-source character cap for the operator paste (it is the highest-signal source). Default 6_000. */
  maxPaste?: number
}

const DEFAULT_MAX_CHARS = 12_000
const DEFAULT_MAX_PER_SOURCE = 3_000
const DEFAULT_MAX_PASTE = 6_000

/** Shortest usable text we will bother cutting a chunk down to. Below this a truncated block is
 *  noise rather than voice, so we skip the source and let a later one try the leftover room. */
const MIN_CHUNK_TEXT = 120

/** A line this short that shows up on this many distinct sources is site nav, not copy. */
const NAV_LINE_MAX_CHARS = 30
const NAV_LINE_MIN_SOURCES = 3

/** url path fragments that mark a page as "who we are" copy (the best voice on most sites). */
const ABOUT_PATH_HINTS = ['about', 'story', 'who-we-are', 'mission', 'team', 'bio'] as const

/** url path fragments that mark a page as "what we sell" copy. */
const OFFERING_PATH_HINTS = [
  'services',
  'offerings',
  'work-with-me',
  'sessions',
  'menu',
  'pricing',
  'programs',
  'coaching',
  'classes',
  'treatments',
] as const

/** Lines that are pure chrome wherever they appear, matched on the whole trimmed line. */
const CHROME_EXACT = new Set([
  'menu',
  'close',
  'close menu',
  'open menu',
  'toggle navigation',
  'toggle menu',
  'back to top',
  '×',
  'x',
])

/** Line shapes that are chrome wherever they appear. Matched against the trimmed line. */
const CHROME_PATTERNS: readonly RegExp[] = [
  /^skip to (the )?(main )?(content|navigation|nav)\b/i,
  /^powered by\b/i,
  /all rights reserved/i,
  /^(accept|allow|reject|decline)\s*(all|selected|cookies)?\s*$/i,
  /^manage (cookie |privacy )?(preferences|settings)\s*$/i,
]

/** Chrome shapes that only count on a SHORT line, because the same words can open a real
 *  sentence ("Designed with the same care we give every guest."). A footer credit is short;
 *  a sentence about the business usually is not. */
const SHORT_CHROME_PATTERNS: readonly RegExp[] = [/^(©|\(c\)|copyright\b)/i, /^(website|site|theme) by\b/i]
const SHORT_CHROME_MAX_CHARS = 120

/** A cookie banner is a line ABOUT cookies on a website, not any line containing the word, so a
 *  bakery's "we bake cookies fresh every morning" survives. Both halves must match. */
const COOKIE_WORD = /\bcookies?\b/i
const COOKIE_CONTEXT =
  /\b(consent|policy|preferences|privacy|browser|browsing|tracking|analytics|third[- ]party|opt[- ](in|out)|this (web)?site|our (web)?site|your experience|best experience|accept all|strictly necessary|essential)\b/i

// ── Boilerplate stripping ────────────────────────────────────────────────────────

/**
 * Strip site chrome out of one source's text and normalise its whitespace, leaving the real
 * sentences and paragraph breaks alone. PURE + total (never throws, returns '' for junk input).
 *
 * `dropLines` is the optional cross-source nav set: normalised lines the caller found on three
 * or more distinct sources, which are nav chrome by repetition rather than by shape.
 */
export function stripBoilerplate(text: string, dropLines?: ReadonlySet<string>): string {
  if (typeof text !== 'string' || text.length === 0) return ''

  const out: string[] = []
  let blankRun = 0

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = collapseSpaces(rawLine)

    if (line.length === 0) {
      blankRun += 1
      continue
    }
    if (line.length < 3) continue
    if (isChrome(line)) continue
    if (dropLines?.has(normaliseLine(line))) continue

    // Max one blank line between paragraphs, and never a leading one.
    if (blankRun > 0 && out.length > 0) out.push('')
    blankRun = 0
    out.push(line)
  }

  return out.join('\n').trim()
}

/** Whether a trimmed line is obvious site chrome (nav, cookie banner, footer legal). PURE. */
function isChrome(line: string): boolean {
  const key = normaliseLine(line)
  if (CHROME_EXACT.has(key)) return true
  if (CHROME_PATTERNS.some((re) => re.test(line))) return true
  if (COOKIE_WORD.test(line) && COOKIE_CONTEXT.test(line)) return true
  if (line.length <= SHORT_CHROME_MAX_CHARS && SHORT_CHROME_PATTERNS.some((re) => re.test(line))) return true
  return false
}

/** Lowercase, whitespace-collapsed, punctuation-trimmed form used for line identity. PURE. */
function normaliseLine(line: string): string {
  return collapseSpaces(line)
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}©(×]+/u, '')
    .replace(/[.,:;!|·•\-\u2013\u2014]+$/u, '')
    .trim()
}

/** Collapse runs of spaces / tabs inside one line and trim the ends. PURE. */
function collapseSpaces(line: string): string {
  return typeof line === 'string' ? line.replace(/[^\S\n]+/g, ' ').trim() : ''
}

// ── Source ordering ──────────────────────────────────────────────────────────────

/** The url path of a source, lowercased and hyphen-normalised, or '' when there is none. PURE. */
function pathOf(source: HarvestedSource): string {
  const url = typeof source.url === 'string' ? source.url.trim() : ''
  if (url.length === 0) return ''
  let path = ''
  try {
    path = new URL(url).pathname
  } catch {
    // Not an absolute url: treat everything after the first slash that follows a host as the path.
    const stripped = url.replace(/^[a-z]+:\/\//i, '')
    const slash = stripped.indexOf('/')
    path = slash === -1 ? '' : stripped.slice(slash)
  }
  return path.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

/** How deep a page sits, used to find the home / seed page (the shallowest path). PURE. */
function pathWeight(source: HarvestedSource): number {
  const path = pathOf(source).replace(/^-+|-+$/g, '')
  return path.length
}

/**
 * Order the usable sources best first, because the BUDGET TRUNCATES THE TAIL: paste, home page,
 * about pages, offering pages, remaining pages, other text sources, then search snippets last
 * (third-party words are the worst grounding for a business's own voice). Stable within each
 * band, so the harvest order breaks ties. PURE.
 */
function orderSources(sources: HarvestedSource[]): HarvestedSource[] {
  const paste: HarvestedSource[] = []
  const pages: HarvestedSource[] = []
  const searches: HarvestedSource[] = []
  const others: HarvestedSource[] = []

  for (const source of sources) {
    if (source.kind === 'paste') paste.push(source)
    else if (source.kind === 'page') pages.push(source)
    else if (source.kind === 'search_result') searches.push(source)
    else others.push(source)
  }

  // The home / seed page: the page source with the shortest path, else the first page source.
  let home: HarvestedSource | null = null
  for (const page of pages) {
    if (!home || pathWeight(page) < pathWeight(home)) home = page
  }

  const about: HarvestedSource[] = []
  const offerings: HarvestedSource[] = []
  const rest: HarvestedSource[] = []
  for (const page of pages) {
    if (page === home) continue
    const path = pathOf(page)
    if (ABOUT_PATH_HINTS.some((hint) => path.includes(hint))) about.push(page)
    else if (OFFERING_PATH_HINTS.some((hint) => path.includes(hint))) offerings.push(page)
    else rest.push(page)
  }

  return [...paste, ...(home ? [home] : []), ...about, ...offerings, ...rest, ...others, ...searches]
}

// ── Budgeting ───────────────────────────────────────────────────────────────────

/** Cut `text` to at most `limit` chars, preferring a sentence end, then a line break, then a
 *  word boundary, so the excerpt never ends mid-word. PURE. */
function truncateOnBoundary(text: string, limit: number): string {
  if (limit <= 0) return ''
  if (text.length <= limit) return text

  const slice = text.slice(0, limit)
  const floor = Math.floor(limit * 0.5)

  const sentence = lastSentenceEnd(slice)
  if (sentence > floor) return slice.slice(0, sentence).trimEnd()

  const newline = slice.lastIndexOf('\n')
  if (newline > floor) return slice.slice(0, newline).trimEnd()

  const space = slice.lastIndexOf(' ')
  if (space > 0) return slice.slice(0, space).trimEnd()

  return slice.trimEnd()
}

/** Index just past the last sentence-ending punctuation in `s`, or -1. PURE. */
function lastSentenceEnd(s: string): number {
  for (let i = s.length - 1; i >= 0; i -= 1) {
    const ch = s[i]
    if (ch !== '.' && ch !== '!' && ch !== '?') continue
    const next = s[i + 1]
    if (next === undefined || next === ' ' || next === '\n' || next === '"' || next === ')') return i + 1
  }
  return -1
}

/** The attribution line above a chunk, so the model can say where a sentence came from. PURE. */
function labelFor(source: HarvestedSource): string {
  const url = typeof source.url === 'string' ? source.url.trim() : ''
  const where = url.length > 0 ? url : source.kind === 'paste' ? 'operator paste' : `${source.kind} source`
  const title = typeof source.title === 'string' ? collapseSpaces(source.title) : ''
  return title.length > 0 ? `--- from ${where} (${title})` : `--- from ${where}`
}

/** A positive integer option, or the fallback when it is missing or nonsense. PURE. */
function cap(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

// ── The excerpt ─────────────────────────────────────────────────────────────────

/**
 * Build a labeled, de-boilerplated, priority-ordered VERBATIM excerpt of the harvested sources
 * for the composer / reframe prompts. PURE (no IO, no AI). Returns '' when there is nothing
 * usable. Never throws, whatever shape the caller hands it.
 */
export function buildSourceExcerpt(sources: HarvestedSource[], opts?: SourceExcerptOptions): string {
  if (!Array.isArray(sources) || sources.length === 0) return ''

  const maxChars = cap(opts?.maxChars, DEFAULT_MAX_CHARS)
  const maxPerSource = cap(opts?.maxPerSource, DEFAULT_MAX_PER_SOURCE)
  const maxPaste = cap(opts?.maxPaste, DEFAULT_MAX_PASTE)

  const usable = sources.filter(
    (s): s is HarvestedSource => !!s && typeof s === 'object' && typeof s.text === 'string' && s.text.trim().length > 0,
  )
  if (usable.length === 0) return ''

  const navLines = repeatedNavLines(usable)

  const chunks: string[] = []
  let used = 0

  for (const source of orderSources(usable)) {
    const body = stripBoilerplate(source.text ?? '', navLines)
    if (body.length === 0) continue

    const label = labelFor(source)
    const overhead = label.length + 2 + (chunks.length > 0 ? 2 : 0) // label + blank line + join
    const room = maxChars - used - overhead
    if (room <= 0) break

    const take = Math.min(source.kind === 'paste' ? maxPaste : maxPerSource, room)
    // Too little room left to cut this source down to something worth reading: leave it out and
    // let a shorter later source use the remainder.
    if (body.length > take && take < MIN_CHUNK_TEXT) continue

    const text = truncateOnBoundary(body, take)
    if (text.length === 0) continue

    chunks.push(`${label}\n\n${text}`)
    used += overhead + text.length
  }

  return chunks.join('\n\n')
}

/** Normalised short lines that appear on three or more distinct sources: nav chrome by
 *  repetition (a header / footer link list), so we drop them everywhere. PURE. */
function repeatedNavLines(sources: HarvestedSource[]): ReadonlySet<string> {
  const counts = new Map<string, number>()

  for (const source of sources) {
    const seen = new Set<string>()
    for (const rawLine of (source.text ?? '').split(/\r\n|\r|\n/)) {
      const line = collapseSpaces(rawLine)
      if (line.length < 3 || line.length > NAV_LINE_MAX_CHARS) continue
      const key = normaliseLine(line)
      if (key.length === 0 || seen.has(key)) continue
      seen.add(key)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  const nav = new Set<string>()
  for (const [key, count] of counts) {
    if (count >= NAV_LINE_MIN_SOURCES) nav.add(key)
  }
  return nav
}
