// A MENSWORK WEBSITE PAGE (owner ask 2026-10-07: "get the nuance and all the pages dialed in... make sure all
// the elements from the entire design system are implemented"). PURE. A custom page on a Space website is a
// page-editor document (preferences.pageDocs[slug]); on a Space that wears the Menswork page theme, this module
// reads each block the owner placed and decides which of the design system's sections draws it.
// components/sites/menswork-page.tsx draws them; any block it does not know keeps its own render.
//
// RULE: every word, photo and link is the owner's (the block's own fields). The theme only chooses the shape:
//   · Banner (PhotoHero): the page hero. "Beside photo" splits copy and photo; "Over" and "Below photo" set
//     the copy above a full-width photo (the design never lays type over the men); "Text only" is copy alone.
//   · Editorial section: a section head with its text; its Stats body is the facts strip; its FAQ body is
//     the accordion; a Soft card surface is a chamfered card.
//   · Card grid: Step role is the member path (chevron numbers; three columns is the numbered grid); a
//     Feature role whose cards are each one letter is the five-beat strip (P U L S E); List role is the
//     ruled chevron lists (one card per column, one line per item); Media role is the photo row; any other
//     Feature grid is the hairline grid of parts.
//   · Zigzag: a photo beside its text (a List body is chevron bullets). A run of Zigzags titled with the
//     four season names is the year: a sticky season wheel beside the four seasons, their sign modules
//     (each list line "Sign: theme") and the Space's own events placed in each module's window.
//   · Accent beat: Call to action is the closing row; a Statement with a link is the quiet one-line strip;
//     a Statement without one is the note strip (the practice-not-therapy line).
//   · Stat row, Accordion, Checklist, Gallery, Image, Display heading, Heading, Text, Divider: their twins.
//   · The live blocks are the Space's own rows: Upcoming events, Circles, Practices and journeys.

export type MwSeason = 'winter' | 'spring' | 'summer' | 'fall'

export const MW_SEASON_ORDER: readonly MwSeason[] = ['winter', 'spring', 'summer', 'fall']

/** The twelve signs on the program's lines (HANDOFF 2026-10-07), in program-year order, each with the
 *  month-day it begins and its text glyph. */
export const MW_SIGNS = [
  { id: 'capricorn', name: 'Capricorn', glyph: '♑', start: 1221, season: 'winter' },
  { id: 'aquarius', name: 'Aquarius', glyph: '♒', start: 119, season: 'winter' },
  { id: 'pisces', name: 'Pisces', glyph: '♓', start: 218, season: 'winter' },
  { id: 'aries', name: 'Aries', glyph: '♈', start: 320, season: 'spring' },
  { id: 'taurus', name: 'Taurus', glyph: '♉', start: 420, season: 'spring' },
  { id: 'gemini', name: 'Gemini', glyph: '♊', start: 520, season: 'spring' },
  { id: 'cancer', name: 'Cancer', glyph: '♋', start: 621, season: 'summer' },
  { id: 'leo', name: 'Leo', glyph: '♌', start: 722, season: 'summer' },
  { id: 'virgo', name: 'Virgo', glyph: '♍', start: 823, season: 'summer' },
  { id: 'libra', name: 'Libra', glyph: '♎', start: 922, season: 'fall' },
  { id: 'scorpio', name: 'Scorpio', glyph: '♏', start: 1023, season: 'fall' },
  { id: 'sagittarius', name: 'Sagittarius', glyph: '♐', start: 1122, season: 'fall' },
] as const satisfies readonly { id: string; name: string; glyph: string; start: number; season: MwSeason }[]

export type MwSign = (typeof MW_SIGNS)[number]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Dec 21" for a month-day number like 1221. */
export function monthDay(md: number): string {
  return `${MONTHS[Math.floor(md / 100) - 1]} ${md % 100}`
}

/** The month-day number (1221) of an ISO date or timestamp, read off its own digits (event times are stored
 *  as wall-clock time, so no zone math). Null when the string is not a date. */
export function mdOf(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? Number(m[2]) * 100 + Number(m[3]) : null
}

/** The sign a month-day falls in. */
export function signAt(md: number): MwSign {
  // Capricorn wraps the year end: Dec 21 to Jan 18.
  if (md >= 1221 || md < 119) return MW_SIGNS[0]
  let found: MwSign = MW_SIGNS[1]
  for (const s of MW_SIGNS.slice(1)) if (s.start <= md) found = s
  return found
}

/** The sign the program is in on a date. */
export function signOn(date: Date): MwSign {
  return signAt((date.getUTCMonth() + 1) * 100 + date.getUTCDate())
}

/** The month-day a sign ends on (the day before the next one begins). */
export function signEnd(sign: MwSign): number {
  const next = MW_SIGNS[(MW_SIGNS.indexOf(sign) + 1) % MW_SIGNS.length]
  const d = new Date(Date.UTC(2027, Math.floor(next.start / 100) - 1, next.start % 100 - 1))
  return (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
}

/** The season a month-day falls in, on the solstice and equinox lines. */
export function seasonAt(md: number): MwSeason {
  if (md >= 1221 || md < 320) return 'winter'
  if (md < 621) return 'spring'
  if (md < 922) return 'summer'
  return 'fall'
}

/** The season a title names ("Winter", "fall"), else null. */
export function seasonNamed(title: unknown): MwSeason | null {
  const t = typeof title === 'string' ? title.replace(/[*.]/g, '').trim().toLowerCase() : ''
  return (MW_SEASON_ORDER as readonly string[]).includes(t) ? (t as MwSeason) : null
}

/** A module line, "Capricorn: structure, discipline" (or "Capricorn - ..."), as its sign and theme. */
export function moduleLine(text: unknown): { sign: MwSign; theme: string } | null {
  const t = typeof text === 'string' ? text.trim() : ''
  const m = /^([A-Za-z]+)\s*[:·-]\s*(.+)$/.exec(t)
  if (!m) return null
  const sign = MW_SIGNS.find((s) => s.name.toLowerCase() === m[1].toLowerCase())
  return sign ? { sign, theme: m[2].trim() } : null
}

/** Whether a month-day falls in a sign's window. */
export function inSign(md: number, sign: MwSign): boolean {
  return signAt(md).id === sign.id
}

/** A photo URL with an optional crop focus carried as a `pos` query (`?pos=58-64` = 58% 64%): the URL without
 *  it, and the CSS object-position. A query (not a fragment) so the URL still passes every image allowlist
 *  the Space page applies; storage ignores the unknown parameter. */
export function imageFocus(url: string | null): { src: string | null; position: string | null } {
  if (!url) return { src: null, position: null }
  const m = /[?&]pos=(\d{1,3})-(\d{1,3})$/.exec(url)
  if (!m) return { src: url, position: null }
  return { src: url.slice(0, m.index), position: `${Math.min(100, +m[1])}% ${Math.min(100, +m[2])}%` }
}

/** Whether a Card grid is the five-beat strip: two to seven cards, each icon one letter. */
export function isBeatStrip(cards: readonly { icon?: unknown }[]): boolean {
  return cards.length >= 2 && cards.length <= 7 && cards.every((c) => typeof c.icon === 'string' && /^[A-Za-z]$/.test(c.icon.trim()))
}

/** One placed page block, as the page document stores it. */
export interface MwBlock {
  type: string
  props: Record<string, unknown>
}

/** What draws one stretch of a Menswork page. Each carries the indexes of the blocks it draws. */
export type MwPlan =
  | { kind: 'hero'; at: number }
  | { kind: 'head'; at: number }
  | { kind: 'facts'; at: number }
  | { kind: 'faq'; at: number }
  | { kind: 'beats'; at: number }
  | { kind: 'path'; at: number; grid: boolean }
  | { kind: 'parts'; at: number }
  | { kind: 'lists'; at: number }
  | { kind: 'photos'; at: number }
  | { kind: 'quotes'; at: number }
  | { kind: 'story'; at: number }
  | { kind: 'year'; at: number[] }
  | { kind: 'closing'; at: number }
  | { kind: 'strip'; at: number }
  | { kind: 'note'; at: number }
  | { kind: 'checklist'; at: number }
  | { kind: 'text'; at: number }
  | { kind: 'band'; at: number }
  | { kind: 'events'; at: number }
  | { kind: 'circles'; at: number }
  | { kind: 'journeys'; at: number }
  | { kind: 'other'; at: number }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Plan a Menswork page from its blocks, in order. */
export function planMensworkPage(blocks: readonly MwBlock[]): MwPlan[] {
  const out: MwPlan[] = []
  for (let i = 0; i < blocks.length; i++) {
    const { type, props: p } = blocks[i]
    // A run of season Zigzags (two or more) is the year.
    if (type === 'Zigzag' && seasonNamed(p.title)) {
      const run: number[] = []
      for (let j = i; j < blocks.length && blocks[j].type === 'Zigzag' && seasonNamed(blocks[j].props.title); j++) run.push(j)
      if (run.length >= 2) {
        out.push({ kind: 'year', at: run })
        i = run[run.length - 1]
        continue
      }
    }
    out.push(planOne(type, p, i))
  }
  return out
}

function planOne(type: string, p: Record<string, unknown>, at: number): MwPlan {
  switch (type) {
    case 'PhotoHero':
    case 'Hero':
    case 'Cover':
      return { kind: 'hero', at }
    case 'EditorialSection':
      if (p.body === 'stats') return { kind: 'facts', at }
      if (p.body === 'faq') return { kind: 'faq', at }
      return { kind: 'head', at }
    case 'CardGrid': {
      const cards = Array.isArray(p.cards) ? (p.cards as { icon?: unknown }[]) : []
      if (p.role === 'step') return { kind: 'path', at, grid: Number(p.columns) === 3 }
      if (p.role === 'list') return { kind: 'lists', at }
      if (p.role === 'media') return { kind: 'photos', at }
      if (p.role === 'testimonial') return { kind: 'quotes', at }
      return isBeatStrip(cards) ? { kind: 'beats', at } : { kind: 'parts', at }
    }
    case 'Zigzag':
    case 'MediaText':
      return { kind: 'story', at }
    case 'AccentBeat':
      if (p.mode === 'cta') return { kind: 'closing', at }
      return str(p.ctaHref) ? { kind: 'strip', at } : { kind: 'note', at }
    case 'CallToAction':
    case 'SpaceCTA':
      return { kind: 'closing', at }
    case 'StatRow':
      return { kind: 'facts', at }
    case 'Accordion':
    case 'SpaceFAQ':
      return { kind: 'faq', at }
    case 'Checklist':
      return { kind: 'checklist', at }
    case 'Gallery':
    case 'PhotoTrio':
    case 'Image':
      return { kind: 'photos', at }
    case 'DisplayHeading':
    case 'Heading':
    case 'Prose':
    case 'Text':
    case 'Statement':
    case 'SpaceSectionTitle':
      return { kind: 'text', at }
    case 'Divider':
    case 'Spacer':
      return { kind: 'band', at }
    case 'SpaceEvents':
    case 'LiveEvents':
      return { kind: 'events', at }
    case 'SpaceCommunity':
    case 'CirclesGrid':
      return { kind: 'circles', at }
    case 'SpacePractices':
      return { kind: 'journeys', at }
    default:
      return { kind: 'other', at }
  }
}

/** A headline as segments, the accent word (the block's Accent word field) or `*marked*` words set apart. */
export function headlineSegments(title: string, accentWord: string): { text: string; accent: boolean }[] {
  const out: { text: string; accent: boolean }[] = []
  const marked = /\*([^*]+)\*/g
  if (marked.test(title)) {
    let last = 0
    marked.lastIndex = 0
    for (let m = marked.exec(title); m; m = marked.exec(title)) {
      if (m.index > last) out.push({ text: title.slice(last, m.index), accent: false })
      out.push({ text: m[1], accent: true })
      last = m.index + m[0].length
    }
    if (last < title.length) out.push({ text: title.slice(last), accent: false })
    return out.filter((s) => s.text)
  }
  const word = accentWord.trim()
  const at = word ? title.toLowerCase().indexOf(word.toLowerCase()) : -1
  if (at < 0) return [{ text: title, accent: false }]
  return [
    { text: title.slice(0, at), accent: false },
    { text: title.slice(at, at + word.length), accent: true },
    { text: title.slice(at + word.length), accent: false },
  ].filter((s) => s.text)
}

/** Text lines from a stored body: one per line, blanks dropped. */
export function lines(raw: unknown): string[] {
  return str(raw)
    .split(/\r?\n|<br\s*\/?>/i)
    .map((l) => l.replace(/<[^>]*>/g, '').trim())
    .filter(Boolean)
}

/** A one-line date label from a wall-clock timestamp: "Tue Mar 9", "6:00 PM". */
export function dateLabel(iso: string): { day: string; time: string | null } {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso)
  if (!m) return { day: iso, time: null }
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  const day = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${MONTHS[+m[2] - 1]} ${+m[3]}`
  if (m[4] === undefined) return { day, time: null }
  const h = +m[4]
  const time = `${h % 12 || 12}:${m[5]} ${h < 12 ? 'AM' : 'PM'}`
  return { day, time: h === 0 && m[5] === '00' ? null : time }
}
