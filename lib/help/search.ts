// Shared help search: one owned matcher behind every help search box (the public help center's
// front page and sidebar, the member Help page, and Vera's launcher). No backend, no search SaaS;
// the index is a small static file (app/api/help/search-index).
//
// What it understands, in the order a person notices:
//   - Questions as people type them. "how do I stop the emails" drops the filler words and matches
//     on "stop" and "emails", and a long question still answers when one word misses.
//   - The words people use, not only ours. Each article can carry `keywords` in its front matter
//     (docs/HELP-CENTER.md), and a short synonym list maps everyday words onto product names.
//   - Word endings and small typos. "rsvps", "messaging" and "calender" all land.
//   - Where in the article the answer is. An entry lists its section headings, so a hit can link
//     straight to the section that matched instead of the top of the page.
//
// Type-only import of HelpSearchEntry keeps this client-safe (content.ts uses fs).
import type { HelpSearchEntry } from './content'

/** A ranked match. `to` is where the result should link: the article, or the section that matched. */
export interface HelpSearchHit extends HelpSearchEntry {
  to: string
  /** The heading of the matching section, when a section explains the query better than the title. */
  sectionTitle?: string
}

const STOP = new Set(
  'a an and are as at be can do does for from how i in is it me my of on or the to what when where which who why with you your someone somebody anyone please need want'.split(
    ' ',
  ),
)

// Everyday words on the left of each group meet the product's words on the right. A group is
// symmetric: any word in it finds an article that uses any other. Keep these to single words;
// a phrase belongs in the article's own `keywords` front matter.
const SYNONYM_GROUPS: string[][] = [
  ['unsubscribe', 'optout', 'email', 'emails', 'newsletter', 'notifications'],
  ['cancel', 'refund', 'billing', 'subscription', 'plan', 'charge', 'invoice'],
  ['dm', 'chat', 'message', 'inbox', 'text'],
  ['group', 'circle', 'club'],
  ['meetup', 'gathering', 'event', 'rsvp', 'attend', 'ticket'],
  ['points', 'zaps', 'gems', 'rewards', 'xp'],
  ['shop', 'store', 'market', 'marketplace', 'sell', 'buy', 'listing'],
  ['site', 'website', 'domain', 'webpage'],
  ['course', 'journey', 'class', 'lesson', 'program'],
  ['photo', 'avatar', 'picture', 'profile', 'bio'],
  ['delete', 'remove', 'deactivate', 'close'],
  ['block', 'report', 'mute', 'harassment', 'spam'],
  ['payout', 'paid', 'stripe', 'payment', 'money'],
  ['calendar', 'ical', 'schedule'],
  ['install', 'app', 'iphone', 'android', 'download'],
  ['theme', 'look', 'colors', 'design', 'kit', 'style'],
  ['friend', 'connection', 'contact', 'follow'],
  ['login', 'signin', 'password', 'account'],
  ['privacy', 'visible', 'hide', 'private'],
  ['streak', 'checkin', 'qr', 'scan'],
]

const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')

/** A crude, predictable stemmer: enough that plurals and -ing forms meet, never clever. */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

const words = (s: string): string[] => fold(s).split(/\s+/).filter(Boolean).map(stem)

const SYNONYMS = new Map<string, string[]>()
for (const group of SYNONYM_GROUPS) {
  const stems = group.map(stem)
  for (const s of stems) SYNONYMS.set(s, [...(SYNONYMS.get(s) ?? []), ...stems.filter((o) => o !== s)])
}

/** True when two words are one edit apart: a swapped pair, or one letter added, dropped or changed. */
function nearly(a: string, b: string): boolean {
  if (a === b) return true
  const d = a.length - b.length
  if (d > 1 || d < -1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (d === 0) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)
  }
  return d > 0 ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

/** How well a query term matches one of a field's words: exact, the start of a word, or nothing. */
function quality(term: string, field: string[]): number {
  let best = 0
  for (const w of field) {
    if (w === term) return 1
    // A prefix needs four letters to count: "notif" finds "notifications", "app" does not find "approving".
    if (term.length >= 4 && w.startsWith(term)) best = Math.max(best, 0.8)
  }
  return best
}

/** `quality`, widened by synonyms (a softer match) and, when `typos` is on, by one-edit misses. */
function match(term: string, field: string[], typos: boolean): number {
  let best = quality(term, field)
  if (best === 1) return 1
  if (best === 0 && (SYNONYMS.get(term) ?? []).some((alt) => field.includes(alt))) best = 0.4
  if (best === 0 && typos && term.length >= 6 && field.some((w) => w.length >= 5 && nearly(term, w))) best = 0.5
  return best
}

interface Prepared {
  title: string[]
  keywords: string[]
  sections: { id: string; title: string; words: string[] }[]
  description: string[]
  category: string[]
  excerpt: string[]
}

const prepared = new WeakMap<HelpSearchEntry, Prepared>()

function prepare(entry: HelpSearchEntry): Prepared {
  let p = prepared.get(entry)
  if (!p) {
    p = {
      title: words(entry.title),
      keywords: words((entry.keywords ?? []).join(' ')),
      sections: (entry.sections ?? []).map((s) => ({ ...s, words: words(s.title) })),
      description: words(entry.description),
      category: words(entry.categoryTitle),
      excerpt: words(entry.excerpt),
    }
    prepared.set(entry, p)
  }
  return p
}

const WEIGHT = { title: 10, keywords: 8, section: 5, description: 3, category: 2, excerpt: 1 } as const

function scoreEntry(entry: HelpSearchEntry, terms: string[], phrase: string, needed: number): { score: number; section?: Prepared['sections'][number] } {
  const p = prepare(entry)
  let total = 0
  let matched = 0
  let titleSum = 0
  const sectionSum = new Map<number, number>()
  for (const term of terms) {
    const title = match(term, p.title, true) * WEIGHT.title
    let best = Math.max(
      title,
      match(term, p.keywords, true) * WEIGHT.keywords,
      match(term, p.description, false) * WEIGHT.description,
      match(term, p.category, false) * WEIGHT.category,
      match(term, p.excerpt, false) * WEIGHT.excerpt,
    )
    p.sections.forEach((s, i) => {
      const v = match(term, s.words, true) * WEIGHT.section
      if (v > 0) sectionSum.set(i, (sectionSum.get(i) ?? 0) + v)
      best = Math.max(best, v)
    })
    titleSum += title
    if (best > 0) matched++
    total += best
  }
  if (matched < needed) return { score: 0 }
  let score = total * (matched / terms.length)
  if (phrase.length >= 3 && fold(entry.title).replace(/\s+/g, ' ').includes(phrase)) score += 8

  let section: Prepared['sections'][number] | undefined
  let top = 0
  for (const [i, v] of sectionSum) {
    if (v > top) {
      top = v
      section = p.sections[i]
    }
  }
  // Point at a section only when it explains the query better than the title already does.
  return { score, section: section && top > titleSum * (WEIGHT.section / WEIGHT.title) ? section : undefined }
}

/** Top-N matches for a query, ranked. Returns [] for queries under 2 chars. */
export function searchHelp(index: HelpSearchEntry[], query: string, limit = 8): HelpSearchHit[] {
  const q = query.trim()
  if (q.length < 2) return []
  const all = words(q)
  const meaningful = all.filter((w) => !STOP.has(w))
  const terms = [...new Set(meaningful.length > 0 ? meaningful : all)]
  if (terms.length === 0) return []
  const phrase = fold(q).replace(/\s+/g, ' ').trim()
  // One or two words must all land, and a longer question may miss a word. When nothing clears
  // that bar, half the words are enough: a near answer beats an empty list.
  const strict = terms.length <= 2 ? terms.length : Math.ceil(terms.length * 0.6)
  const rank = (needed: number) =>
    index.map((e) => ({ e, ...scoreEntry(e, terms, phrase, needed) })).filter((r) => r.score > 0)
  let ranked = rank(strict)
  if (ranked.length === 0 && terms.length > 1) ranked = rank(Math.ceil(terms.length / 2))
  // Trailing matches far weaker than the best one are noise (a lone synonym in a summary), so cut them.
  const floor = Math.max(...ranked.map((r) => r.score), 0) * 0.5
  return ranked
    .filter((r) => r.score >= floor)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ e, section }) => ({
      ...e,
      to: section ? `${e.href}#${section.id}` : e.href,
      sectionTitle: section?.title,
    }))
}
