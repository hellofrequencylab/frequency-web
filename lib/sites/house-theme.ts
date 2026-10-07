// THE HOUSE WEBSITE THEME (owner ask 2026-10-07: the "Daniel Tyack Site v4" design becomes the default look
// of every Space website, "the house look and feel, in a website"). PURE. This module decides WHAT the theme
// renders; components/sites/house-sections.tsx decides how it looks.
//
// CONTENT IS THE SPACE'S OWN, NEVER BAKED IN. The theme reads the Space's Home layout (the same blocks the
// Space page renders, in the same order) and gives each block it knows a themed section: Editorial ->
// "who this is for", Card grid -> numbered steps, Zigzag (+ a Features block right after it) -> the story
// with its facts, Offerings -> session cards, Memberships / Circles -> the community band, FAQ -> the
// accordion, Accent beat + Contact -> the closing ink band. Any other block still renders, through the
// Space page's own block render, in a plain band, so nothing an owner placed ever disappears.

/** One themed section, in page order. `ids` are the block ids it renders from (and so absorbs). */
export type HouseSection =
  | { kind: 'who'; id: string }
  | { kind: 'steps'; id: string }
  | { kind: 'story'; id: string; factsId: string | null }
  | { kind: 'facts'; id: string }
  | { kind: 'sessions'; id: string }
  | { kind: 'community'; membershipsId: string | null }
  | { kind: 'faq'; id: string }
  | { kind: 'closing'; ctaId: string | null; contactRowTitle: string | null }
  | { kind: 'other'; rowId: string; ids: string[] }

/** The plain row shape the planner reads (lib/entity-blocks/layout RowDef, narrowed). */
interface HouseRow {
  id: string
  cells: string[][]
  title?: string
}

const CONTACT_IDS = new Set(['contact', 'business'])

/** Plan the Home page: each placed block becomes a themed section or stays a plain band. `isSourced`
 *  marks a Features block fed by a data source (offerings, events...), which keeps its own render. */
export function planHouseSections(rows: readonly HouseRow[], isSourced: (id: string) => boolean = () => false): HouseSection[] {
  const items = rows.flatMap((row) => row.cells.flat().map((id) => ({ id, row })))
  const ids = new Set(items.map((i) => i.id))
  const out: HouseSection[] = []
  const done = new Set<string>()
  let other: { rowId: string; ids: string[] } | null = null
  const flushOther = () => {
    if (other && other.ids.length > 0) out.push({ kind: 'other', ...other })
    other = null
  }

  items.forEach(({ id, row }, i) => {
    if (done.has(id) || id.length === 0) return
    done.add(id)
    let section: HouseSection | null = null
    if (id === 'editorial') section = { kind: 'who', id }
    else if (id === 'cardGrid') section = { kind: 'steps', id }
    else if (id === 'zigzag') {
      const next = items[i + 1]?.id
      const factsId = next === 'features' && !isSourced('features') ? next : null
      if (factsId) done.add(factsId)
      section = { kind: 'story', id, factsId }
    } else if (id === 'features' && !isSourced(id)) section = { kind: 'facts', id }
    else if (id === 'offerings') section = { kind: 'sessions', id }
    // Booking rides the session cards (every card books), so a booking block beside them adds nothing.
    else if (id === 'booking' && ids.has('offerings')) return
    else if (id === 'memberships' || id === 'circles') {
      done.add('memberships').add('circles')
      section = { kind: 'community', membershipsId: ids.has('memberships') ? 'memberships' : null }
    } else if (id === 'faq') section = { kind: 'faq', id }
    else if (id === 'accentBeat' || CONTACT_IDS.has(id)) {
      done.add('accentBeat').add('contact').add('business')
      const contactRow = items.find((it) => CONTACT_IDS.has(it.id))?.row
      section = {
        kind: 'closing',
        ctaId: ids.has('accentBeat') ? 'accentBeat' : null,
        contactRowTitle: contactRow?.title?.trim() || null,
      }
    }

    if (section) {
      flushOther()
      out.push(section)
      return
    }
    // An unthemed block: keep it, grouped with its row neighbours, in a plain band.
    if (!other || other.rowId !== row.id) {
      flushOther()
      other = { rowId: row.id, ids: [] }
    }
    other.ids.push(id)
  })
  flushOther()
  return out
}

/** The header menu: one link per themed section that has one, first placement wins. */
export const HOUSE_NAV: Partial<Record<HouseSection['kind'], { anchor: string; label: string }>> = {
  steps: { anchor: 'approach', label: 'How it works' },
  story: { anchor: 'about', label: 'About' },
  sessions: { anchor: 'sessions', label: 'Sessions' },
  community: { anchor: 'community', label: 'Community' },
  faq: { anchor: 'faq', label: 'Questions' },
}

// ── Text from the authored bags ─────────────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Plain text from a stored value: tags dropped, entities decoded (repeatedly, so a twice-escaped value
 *  heals), whitespace collapsed. */
export function plainText(raw: unknown): string {
  let s = typeof raw === 'string' ? raw.replace(/<[^>]*>/g, ' ') : ''
  for (let pass = 0; pass < 3 && /&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(s); pass++) {
    s = s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === '#') {
        const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
      }
      return ENTITIES[code.toLowerCase()] ?? m
    })
  }
  return s.replace(/\s+/g, ' ').trim()
}

/** A stored rich-text body as paragraphs: split on blank lines, a double `<br>` or paragraph tags. */
export function paragraphs(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  return raw
    .split(/(?:<br\s*\/?>\s*){2,}|<\/p>\s*<p[^>]*>|\n\s*\n/i)
    .map(plainText)
    .filter(Boolean)
}

/** The sentences of a paragraph, closing quotes kept with their sentence. */
function sentences(text: string): string[] {
  const found = text.match(/[^.!?]+[.!?]+["'”’)]*/g) ?? []
  const rest = text.slice(found.join('').length).trim()
  return [...found.map((s) => s.trim()), ...(rest ? [rest] : [])].filter(Boolean)
}

/** The longest sentence that still reads as a list row rather than prose. */
const SIGN_MAX = 80

/** "Who this is for", from an Editorial body: the opening paragraph leads, the closing paragraph is the
 *  pull line, and the paragraphs between become the statement rows (a run of short sentences splits into
 *  one row each). One paragraph is all lead; two are lead and pull line. */
export function splitWhoBody(raw: unknown): { lead: string | null; signs: string[]; closing: string | null } {
  const ps = paragraphs(raw)
  if (ps.length === 0) return { lead: null, signs: [], closing: null }
  if (ps.length === 1) return { lead: ps[0], signs: [], closing: null }
  const signs = ps.slice(1, -1).flatMap((p) => {
    const ss = sentences(p)
    return ss.length > 1 && ss.every((s) => s.length <= SIGN_MAX) ? ss : [p]
  })
  return { lead: ps[0], signs, closing: ps[ps.length - 1] }
}

/** A headline with `*accent*` marks as segments, the marked words set in the accent italic. Unmarked text
 *  is one plain segment, so a headline without marks renders as typed. */
export function accentSegments(text: string): { text: string; accent: boolean }[] {
  const out: { text: string; accent: boolean }[] = []
  const re = /\*([^*]+)\*/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), accent: false })
    out.push({ text: m[1], accent: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), accent: false })
  return out.filter((s) => s.text.length > 0)
}

/** The big step number: the card's own number when it is one, else its position. Two digits. */
export function stepNumber(icon: unknown, index: number): string {
  const n = typeof icon === 'string' && /^\d{1,2}$/.test(icon.trim()) ? Number(icon.trim()) : index + 1
  return String(n).padStart(2, '0')
}

// ── Prices and lengths ──────────────────────────────────────────────────────────────────────────────────

/** "1 hr", "1 hr 30 min", "45 min", or null. */
export function formatDuration(minutes: number | undefined): string | null {
  if (!minutes || minutes <= 0 || !Number.isFinite(minutes)) return null
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount)
  } catch {
    return `$${amount}`
  }
}

/** An offering's headline price, in major units: "$120", "From $80", "Free", or null (price on request). */
export function formatOfferingPrice(o: { price?: number; currency?: string; priceModel?: string }): string | null {
  if (o.priceModel === 'free') return 'Free'
  if (o.priceModel === 'contact' || o.price === undefined || !Number.isFinite(o.price)) return null
  if (o.price === 0) return 'Free'
  const p = money(o.price, o.currency || 'USD')
  return o.priceModel === 'from' ? `From ${p}` : p
}

/** A membership tier's price: "$10 per month", "$90 per year", "$20 once", or "Free". */
export function formatTierPrice(priceCents: number, interval: string): string {
  if (!priceCents || priceCents <= 0) return 'Free'
  const p = money(priceCents / 100, 'USD')
  return interval === 'year' ? `${p} per year` : interval === 'once' ? `${p} once` : `${p} per month`
}

/** An href that stays on Frequency: a `/path` is made absolute on the app origin (a Space website on its
 *  own domain only serves its pages), an absolute http(s) URL passes, anything else is dropped. */
export function appHref(url: unknown, origin: string): string | null {
  if (typeof url !== 'string' || !url.trim()) return null
  const u = url.trim()
  if (u.startsWith('/') && !u.startsWith('//')) return `${origin}${u}`
  try {
    const parsed = new URL(u)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null
  } catch {
    return null
  }
}
