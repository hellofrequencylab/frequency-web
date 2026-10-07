// THE EXECUTIVE OVERVIEW, READ AS THE DESIGN SYSTEM'S DOCUMENT (LIVE-864). PURE.
//
// The overview is owner-written Markdown on the Space (`preferences.programOverview`, lib/spaces/leadership.ts).
// The website's /admin/overview page draws it as the Hearts on Fire design system's Executive Overview
// template, so this module reads the Markdown into the template's parts by their SHAPE, never by their words:
//
//   ## Heading                       a numbered section ("01 / 10"); its first paragraph is the lede
//   _A whole paragraph in italics._  a mono note under a table or list
//   **Label.** The rest.             a callout with a mono label
//   > A line                         the teal pull line
//   [Words](/admin/calendar)         a mono link on its own line
//   ![alt](src) ![alt](src)          a row of photos
//   - **Title.** Text  (every item)  a grid of cards
//   1. **Title.** Text (every item)  the numbered path; ***Title.*** marks the step to highlight
//   1. Text                          a plain numbered list (sources)
//   ### Label + a list               a labelled list; consecutive ones sit side by side
//   ### Label + a paragraph          a labelled aside
//   | Beat | ... |                   the five beats as a chevron strip over the table
//   | Season | Sign | Starts | ... | the season blocks (an empty first cell continues the season above)
//   | Level | Event | Rhythm |       the events table; a retreat row is the loud one
//   | Decision | Status |            the open-decisions checklist
//   any table of 3+ columns, 4 rows or fewer: one card per row; any other table: the plain table
//
// The text before the first heading may open with an italic line, `_Label, Date. Name._`, which becomes the
// meta row under the title.

export type OverviewTableVariant = 'beats' | 'seasons' | 'levels' | 'decisions' | 'cards' | 'plain'

export type OverviewBlock =
  | { kind: 'lede'; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'callout'; label: string; text: string }
  | { kind: 'pull'; text: string }
  | { kind: 'photos'; images: { src: string; alt: string }[] }
  | { kind: 'parts'; items: { title: string; text: string }[] }
  | { kind: 'path'; items: { title: string; text: string; current: boolean }[] }
  | { kind: 'numbered'; items: string[] }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'pairs'; groups: { label: string; items: string[] }[] }
  | { kind: 'aside'; label: string; text: string }
  | { kind: 'table'; variant: OverviewTableVariant; head: string[]; rows: string[][] }

export interface OverviewSection {
  id: string
  title: string
  blocks: OverviewBlock[]
}

export interface OverviewDoc {
  meta: { label: string; line: string } | null
  preamble: OverviewBlock[]
  sections: OverviewSection[]
}

type Raw =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'q'; text: string }
  | { t: 'list'; ordered: boolean; items: string[] }
  | { t: 'table'; rows: string[][] }

const LIST_ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

function cells(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}

/** Markdown lines to raw blocks. Fenced code is skipped: the overview has no use for it. */
function rawBlocks(markdown: string): Raw[] {
  const out: Raw[] = []
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) {
      i++
      while (i < lines.length && !/^\s*(```|~~~)/.test(lines[i])) i++
      i++
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (h) {
      out.push({ t: 'h', level: h[1].length, text: h[2] })
      i++
      continue
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        if (!TABLE_SEP.test(lines[i])) rows.push(cells(lines[i]))
        i++
      }
      out.push({ t: 'table', rows })
      continue
    }
    if (/^\s*>/.test(line)) {
      const parts: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) parts.push(lines[i++].replace(/^\s*>\s?/, ''))
      out.push({ t: 'q', text: parts.join(' ').trim() })
      continue
    }
    const li = LIST_ITEM.exec(line)
    if (li) {
      const ordered = !li[1]
      const items: string[] = []
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i])
        if (m && !m[1] === ordered) {
          items.push(m[3].trim())
          i++
        } else if (lines[i].trim() && /^\s+/.test(lines[i]) && items.length) {
          items[items.length - 1] += ` ${lines[i].trim()}`
          i++
        } else break
      }
      out.push({ t: 'list', ordered, items })
      continue
    }
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !lines[i].trim().startsWith('|') &&
      !/^\s*>/.test(lines[i]) &&
      !LIST_ITEM.test(lines[i]) &&
      !/^\s*(```|~~~)/.test(lines[i])
    ) {
      para.push(lines[i++].trim())
    }
    out.push({ t: 'p', text: para.join(' ') })
  }
  return out
}

/** Inline Markdown to the plain text it reads as: links to their words, emphasis and code marks off. */
export function plainInline(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim()
}

/** The anchor id a section heading gets, from its plain text. */
export function overviewHeadingId(text: string): string {
  return plainInline(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

/** A whole paragraph in one pair of italic marks. */
function wholeItalic(text: string): string | null {
  const m = /^_([^_]+)_$/.exec(text) ?? /^\*([^*]+)\*$/.exec(text)
  return m ? m[1].trim() : null
}

/** `**Title.** rest` (or `***Title.***` for the highlighted one): the title without its stop, and the rest. */
function titled(item: string): { title: string; text: string; current: boolean } | null {
  const m = /^(\*\*\*?)(.+?)\1\s*(.*)$/.exec(item)
  if (!m) return null
  return { title: m[2].trim().replace(/[.:]$/, ''), text: m[3].trim(), current: m[1].length === 3 }
}

const IMAGE = /!\[([^\]]*)\]\(([^)\s]+)\)/g

/** A paragraph that is nothing but images. */
function imagesOnly(text: string): { src: string; alt: string }[] | null {
  const images = [...text.matchAll(IMAGE)].map((m) => ({ alt: m[1].trim(), src: m[2] }))
  if (!images.length || text.replace(IMAGE, '').trim()) return null
  return images
}

function tableVariant(head: string[], rows: string[][]): OverviewTableVariant {
  const h0 = plainInline(head[0] ?? '').toLowerCase()
  if (h0 === 'beat') return 'beats'
  if (h0 === 'season' && head.length >= 3) return 'seasons'
  if (h0 === 'level' && head.length >= 3) return 'levels'
  if (head.length === 2 && plainInline(head[1]).toLowerCase() === 'status') return 'decisions'
  if (head.length >= 3 && rows.length <= 4) return 'cards'
  return 'plain'
}

function paragraph(text: string): OverviewBlock {
  const images = imagesOnly(text)
  if (images) return { kind: 'photos', images }
  const note = wholeItalic(text)
  if (note) return { kind: 'note', text: note }
  const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(text)
  if (link) return { kind: 'link', text: link[1], href: link[2] }
  const callout = /^\*\*([^*]+?)\*\*\s+(.+)$/.exec(text)
  if (callout && /[.:]$/.test(callout[1].trim())) return { kind: 'callout', label: callout[1].trim(), text: callout[2].trim() }
  return { kind: 'para', text }
}

function list(raw: Extract<Raw, { t: 'list' }>): OverviewBlock {
  const items = raw.items.map(titled)
  if (items.length && items.every((x) => x)) {
    const done = items as { title: string; text: string; current: boolean }[]
    return raw.ordered ? { kind: 'path', items: done } : { kind: 'parts', items: done.map(({ title, text }) => ({ title, text })) }
  }
  return raw.ordered ? { kind: 'numbered', items: raw.items } : { kind: 'bullets', items: raw.items }
}

function toBlocks(raws: Raw[]): OverviewBlock[] {
  const out: OverviewBlock[] = []
  for (let i = 0; i < raws.length; i++) {
    const r = raws[i]
    if (r.t === 'h') {
      const next = raws[i + 1]
      const label = plainInline(r.text)
      if (next?.t === 'list') {
        const group = { label, items: next.items }
        const last = out[out.length - 1]
        if (last?.kind === 'pairs' && raws[i - 1]?.t === 'list') last.groups.push(group)
        else out.push({ kind: 'pairs', groups: [group] })
        i++
      } else if (next?.t === 'p') {
        out.push({ kind: 'aside', label, text: next.text })
        i++
      } else {
        out.push({ kind: 'aside', label, text: '' })
      }
      continue
    }
    if (r.t === 'p') out.push(paragraph(r.text))
    else if (r.t === 'q') out.push({ kind: 'pull', text: r.text })
    else if (r.t === 'list') out.push(list(r))
    else if (r.t === 'table' && r.rows.length) {
      const [head, ...rows] = r.rows
      out.push({ kind: 'table', variant: tableVariant(head, rows), head, rows })
    }
  }
  // The section's first plain paragraph, when it opens the section, is its lede.
  if (out[0]?.kind === 'para') out[0] = { kind: 'lede', text: out[0].text }
  return out
}

/** The meta line `_Master overview, Oct 7, 2026. Daniel Tyack._` as a label and a line. */
function metaOf(text: string): { label: string; line: string } | null {
  const inner = wholeItalic(text)
  if (!inner) return null
  const comma = inner.indexOf(',')
  if (comma <= 0) return { label: inner.replace(/\.$/, ''), line: '' }
  const label = inner.slice(0, comma).trim()
  const line = inner
    .slice(comma + 1)
    .trim()
    .replace(/\.$/, '')
    .split(/\.\s+/)
    .join(' · ')
  return { label, line }
}

/** Read the overview Markdown into the template's parts. Level 1 and 2 headings open sections. */
export function readOverviewDoc(markdown: string): OverviewDoc {
  const raws = rawBlocks(markdown)
  const firstHeading = raws.findIndex((r) => r.t === 'h' && r.level <= 2)
  const head = firstHeading < 0 ? raws : raws.slice(0, firstHeading)
  let meta: OverviewDoc['meta'] = null
  if (head[0]?.t === 'p') {
    meta = metaOf(head[0].text)
    if (meta) head.shift()
  }
  const sections: OverviewSection[] = []
  if (firstHeading >= 0) {
    let current: { title: string; raws: Raw[] } | null = null
    for (const r of raws.slice(firstHeading)) {
      if (r.t === 'h' && r.level <= 2) {
        if (current) sections.push(section(current))
        current = { title: r.text, raws: [] }
      } else current?.raws.push(r)
    }
    if (current) sections.push(section(current))
  }
  return { meta, preamble: toBlocks(head).map((b) => (b.kind === 'lede' ? { kind: 'para', text: b.text } : b)), sections }
}

function section(s: { title: string; raws: Raw[] }): OverviewSection {
  const title = plainInline(s.title)
  return { id: overviewHeadingId(title) || 'section', title, blocks: toBlocks(s.raws) }
}

/** A link target the overview may carry: a site path, an anchor, or a web or mail address. */
export function safeOverviewHref(href: string): string | null {
  const h = href.trim()
  if (/^(\/(?!\/)|#)/.test(h)) return h
  if (/^(https?:\/\/|mailto:)/i.test(h)) return h
  return null
}
