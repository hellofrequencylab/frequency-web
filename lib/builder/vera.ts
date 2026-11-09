// VERA IN THE BUILDER (BLD-402; spec docs/EDITOR-NEXT.md#bld-402). She joins the builder as one more client of the
// draft, through four tools: read_page (the outline she may see), plan_page (the server proposes, in the closed
// vocabulary of lib/sites/editor/vera-layout.ts), validate (every line is re-parsed here against this page) and
// apply_edits (the accepted lines, in order, to the draft). Her words are tokens and known slot keys only: a line
// that carries text, a colour or a font is refused with a reason, never applied.
//
// PROPOSALS ARE GHOSTED DIFFS, ACCEPTED PER SECTION. Lines are grouped by the section they touch; each group draws
// on the canvas as a read-only ghost, and Accept puts that one group on the draft as ONE edit, so one undo takes it
// back. She speaks first only when a page is created (an empty page); afterwards only from ⌘K or her rail.
//
// PURE: no React, no IO. The shell owns the state and the network call.

import type { Config, Data } from '@/lib/page-editor/types'
import { applyWebsiteVeraLayout, describeWebsiteVeraChange, parseWebsiteVeraLayout, websiteVeraBlockOptions, websiteVeraGhost, websiteVeraOutline, type WebsiteVeraChange, type WebsiteVeraSection, type WebsiteVeraStyleMenu } from '@/lib/sites/editor/vera-layout'

/** What can make Vera speak. Only the first three may; an idle page, an edit or a save never does. */
type VeraTrigger = 'page-created' | 'command' | 'rail' | 'idle' | 'edit' | 'save'
export function veraMaySpeak(trigger: VeraTrigger): boolean {
  return trigger === 'page-created' || trigger === 'command' || trigger === 'rail'
}

/** Her one unprompted line, said only at page creation: when the page has no sections yet. It asks, it never writes. */
export function veraOpening(doc: Data): string | null {
  return doc.content.length === 0 ? 'A new page. Tell me what it is for and I will suggest which sections it could use. You pick, and the words stay yours.' : null
}

/** Tool: read_page. The outline of the page in view: kinds, labels, positions, tone, width and a short summary of each section. */
export function readPage(doc: Data, config: Config): WebsiteVeraSection[] {
  return websiteVeraOutline(doc, config)
}

/** What she may propose on this page: the sections the Add sheet offers and each section's own design options. She
 *  has no site-style menu here (the theme lens owns that), so a style line is refused. */
export function veraMenu(doc: Data, config: Config, addable: { type: string; label: string }[]): WebsiteVeraStyleMenu {
  return { dials: [], accents: [], accent: null, looks: [], sections: addable.slice(0, 80), options: websiteVeraBlockOptions(doc, config) }
}

/** One proposal: the lines still waiting on an answer, with the reasons for any she was not allowed to make. */
export interface VeraProposal { slug: string; note: string; changes: WebsiteVeraChange[]; refused: string[] }

/** Tool: validate. A reply that crossed the network is parsed again against THIS page's own sections and menu. */
export function validateProposal(raw: { changes: unknown; refused?: unknown; note?: unknown }, doc: Data, slug: string, menu: WebsiteVeraStyleMenu): VeraProposal {
  const ids = new Set(doc.content.map((b) => String(b.props.id ?? '')))
  const parsed = parseWebsiteVeraLayout({ changes: raw.changes }, ids, menu)
  const earlier = Array.isArray(raw.refused) ? raw.refused.filter((r): r is string => typeof r === 'string').slice(0, 12) : []
  return { slug, note: typeof raw.note === 'string' ? raw.note.slice(0, 500) : '', changes: parsed.changes, refused: [...new Set([...earlier, ...parsed.refused])] }
}

/** A group of lines on one section (or one new section), the unit of Accept. */
export interface VeraGroup { id: string; title: string; lines: { index: number; line: string }[] }

/** The proposal's lines grouped by the section they touch, in page order; new sections come last. */
export function veraGroups(proposal: VeraProposal, doc: Data, config: Config, menu: WebsiteVeraStyleMenu): VeraGroup[] {
  const outline = new Map(websiteVeraOutline(doc, config).map((s) => [s.id, s]))
  const groups = new Map<string, VeraGroup>()
  proposal.changes.forEach((change, index) => {
    const id = 'sectionId' in change ? change.sectionId : `new:${index}`
    const title = 'sectionId' in change ? (outline.get(change.sectionId)?.label ?? 'A section') : 'A new section'
    const group = groups.get(id) ?? { id, title, lines: [] }
    group.lines.push({ index, line: describeWebsiteVeraChange(change, doc, config, menu) })
    groups.set(id, group)
  })
  const order = (g: VeraGroup) => (outline.get(g.id)?.position ?? Number.MAX_SAFE_INTEGER)
  return [...groups.values()].sort((a, b) => order(a) - order(b))
}

/** Tool: apply_edits. The chosen lines, in order, on the page document. */
export function applyEdits(doc: Data, config: Config, changes: readonly WebsiteVeraChange[]): { doc: Data; applied: number; missed: string[] } {
  const { doc: next, results } = applyWebsiteVeraLayout(doc, config, [...changes])
  return { doc: next, applied: results.filter((r) => r.ok).length, missed: results.filter((r) => !r.ok).map((r) => r.line) }
}

/** Accept one group: its lines applied as ONE document (the shell commits it as one edit), and the proposal without them. */
export function acceptGroup(proposal: VeraProposal, group: VeraGroup, doc: Data, config: Config): { doc: Data; applied: number; missed: string[]; rest: VeraProposal } {
  const take = new Set(group.lines.map((l) => l.index))
  const result = applyEdits(doc, config, proposal.changes.filter((_, i) => take.has(i)))
  return { ...result, rest: { ...proposal, changes: proposal.changes.filter((_, i) => !take.has(i)) } }
}

/** The ghost for the lines of one group, or of every group (`all`): the page as it would look, read-only. */
export function veraGhost(proposal: VeraProposal, group: VeraGroup | 'all', doc: Data, config: Config): { doc: Data; changed: number } {
  const take = group === 'all' ? null : new Set(group.lines.map((l) => l.index))
  const ticked = proposal.changes.map((_, i) => !take || take.has(i))
  const { doc: ghost, changed } = websiteVeraGhost(doc, config, proposal.changes, ticked)
  return { doc: ghost, changed }
}
