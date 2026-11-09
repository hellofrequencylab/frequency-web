import { ROLES, roleOfType, type RoleId } from '@/lib/blocks/roles/roles'
import { ADOPTED_BLOCKS } from '@/lib/entity-blocks/contract'
import { EMAIL_PALETTE_BLOCK_IDS } from '@/lib/entity-blocks/registry'
import { nodeIdFor, type BlockNode, type NodeLayout } from '@/lib/entity-blocks/node-tree'
import { compileEmailDoc, type EmailBrand } from '@/lib/email-studio/shell'
import { roleRowsAtSend } from '@/components/page-editor/blocks/roles'
import type { Config, Data } from '@/lib/page-editor/types'

// THE EMAIL LENS (BLD-302; spec docs/EDITOR-NEXT.md#bld-302, move 05 "one edit across surfaces"). The builder shows the page
// as the email the owner could send from it. Nothing here draws: each section becomes blocks from the email palette
// (EMAIL_PALETTE_BLOCK_IDS, the set check:email-blocks locks 1:1 to the renderer) and the whole document goes through
// compileEmailDoc, the same compile every campaign, drip and nurture send runs. So the preview is the send, byte for byte.
//   • A role says itself how it appears in email (role.json `surfaces.email`, BLD-215): `draw` becomes its blocks; `freeze`
//     becomes its blocks with the rows fixed as they are now (the Space's live rows when it has them, else the owner's
//     words: roleRowsAtSend, the precedence the send-time resolver uses); `hide` is listed with the reason, never dropped.
//   • A section that is itself an email block passes through as stored. One that reads live at send (`resolveAt: 'send'`
//     on its contract: the Event, Circle and Product cards) is marked: the preview shows the stored snapshot, the send
//     refreshes it from the live row (lib/email-studio/data-blocks.ts), which is the only place a live read happens.
//   • A block with no role and no email form is a site-only section until Update to new layouts (BLD-205).
// PURE: no React, no I/O. The lens never touches the compile; the test proves the result equals compileEmailDoc's.

type Props = Record<string, unknown>

type EmailSectionStatus = 'drawn' | 'frozen' | 'hidden'

interface EmailSection {
  id: string
  type: string
  /** The block's label, as the outline names it. */
  name: string
  status: EmailSectionStatus
  /** Why it is hidden, or what the send fixes. Empty for a plain drawn section. */
  note: string
}

interface EmailLensInput {
  /** The subject line: the page's title until the owner writes one. */
  subject: string
  preheader?: string
  brand?: EmailBrand
  /** The live site's origin, so a page-local link (`~/book`, `/events`) leaves the email as an absolute URL. */
  origin: string
  metadata?: Props
  now?: Date
}

export interface EmailLensResult {
  html: string
  text: string
  subject: string
  preheader: string
  sections: EmailSection[]
  /** The email blocks the page became, in order: what compileEmailDoc rendered. */
  layout: NodeLayout
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const rows = (v: unknown): Props[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Props[]) : [])
/** The rich form: the accent becomes the one inline tag the email renderer keeps for it. */
const rich = (v: unknown) => str(v).replace(/\*([^*]+)\*/g, '<i>$1</i>')
const joinLines = (...parts: unknown[]) => parts.map(str).filter(Boolean).join(' · ')

/** A page link as the email needs it: absolute. `~/x` and `/x` are the site's own paths; anything else is kept as written. */
export function emailHref(href: unknown, origin: string): string {
  const h = str(href)
  if (!h) return ''
  if (h.startsWith('~/')) return `${origin.replace(/\/$/, '')}/${h.slice(2)}`
  if (h.startsWith('/')) return `${origin.replace(/\/$/, '')}${h}`
  return h
}

const SEND_RESOLVED: ReadonlySet<string> = new Set(ADOPTED_BLOCKS.filter((b) => b.resolveAt === 'send').map((b) => b.type))

/** True for an email block whose live read happens at send (the contract's `resolveAt: 'send'`). */
export function resolvedAtSend(type: string): boolean {
  return SEND_RESOLVED.has(type)
}

type Block = { type: string; content: Props }
const block = (type: string, content: Props): Block => ({ type, content })

/** The heading a role section opens with: eyebrow, title and lead as one editorial block. */
function opener(p: Props): Block[] {
  const eyebrow = str(p.eyebrow)
  const title = rich(p.title ?? p.heading)
  const lead = str(p.lead)
  return eyebrow || title || lead ? [block('editorial', { eyebrow, title, body: lead })] : []
}

function button(label: unknown, href: unknown, origin: string): Block[] {
  const l = str(label)
  return l ? [block('button', { label: l, url: emailHref(href, origin), align: 'start' })] : []
}

function cards(p: Props, items: Props[], to: (it: Props) => Props): Block[] {
  const list = items.map(to).filter((c) => str(c.title) || str(c.text) || str(c.image) || (c.stat as Props | undefined)?.value)
  return list.length ? [block('cardGrid', { cards: list, buttonOn: false })] : []
}

function features(items: Props[], to: (it: Props) => { title?: string; text?: string }): Block[] {
  const list = items.map(to).filter((f) => f.title || f.text)
  return list.length ? [block('features', { items: list, layout: 'list' })] : []
}

/** The email blocks a role section becomes. Every type here is in the email palette; the test holds it to that. */
export function roleEmailBlocks(role: RoleId, p: Props, items: Props[], origin: string): Block[] {
  const action = () => button(p.actionLabel, p.actionHref, origin)
  const primary = () => button(p.primaryLabel, p.primaryHref, origin)
  const secondary = () => button(p.secondaryLabel, p.secondaryHref, origin)
  switch (role) {
    case 'hero': {
      const label = str(p.primaryLabel)
      return [
        block('photoHero', { eyebrow: str(p.eyebrow), title: rich(p.title), subtitle: str(p.lead), image: str(p.image), alt: str(p.alt), display: 'below', buttonOn: !!label, buttonLabel: label, buttonUrl: emailHref(p.primaryHref, origin) }),
        ...secondary(),
      ]
    }
    case 'cta':
      return [...opener(p), ...primary(), ...secondary()]
    case 'letter':
      return [...opener(p), ...primary(), ...(str(p.note) ? [block('text', { text: str(p.note) })] : [])]
    case 'statement':
      return [...opener(p), ...features(items, (it) => ({ title: str(it.text) })), ...primary(), ...secondary()]
    case 'steps':
    case 'firstvisit':
      return [...opener(p), ...features(items, (it) => ({ title: str(it.title), text: str(it.body) }))]
    case 'story':
      return [
        ...opener(p),
        ...items.map((it) => str(it.text)).filter(Boolean).map((text) => block('text', { text })),
        ...(str(p.quote) ? [block('quote', { text: str(p.quote) })] : []),
      ]
    case 'proof':
      return [...opener(p), ...items.filter((it) => str(it.quote)).map((it) => block('quote', { text: str(it.quote), by: [str(it.name), str(it.role)].filter(Boolean).join(', ') }))]
    case 'people':
      return [...opener(p), ...cards(p, items, (it) => ({ image: str(it.photo), title: str(it.name), text: joinLines(it.role, it.bio), link: emailHref(it.href, origin) }))]
    case 'shop':
      return [...opener(p), ...cards(p, items, (it) => ({ image: str(it.image), title: str(it.name), text: joinLines(it.price, it.badge), link: emailHref(it.href, origin) })), ...action()]
    case 'library':
      return [...opener(p), ...cards(p, items, (it) => ({ image: str(it.image), title: str(it.title), text: joinLines(it.kind, it.meta), link: emailHref(it.href, origin) })), ...action()]
    case 'stats':
      return [...opener(p), ...cards(p, items, (it) => ({ stat: { value: str(it.value), label: str(it.label) }, text: str(it.note) }))]
    case 'gatherings':
      return [...opener(p), ...cards(p, items, (it) => ({ title: str(it.title), text: joinLines([str(it.month), str(it.day)].filter(Boolean).join(' '), it.time, it.place), link: emailHref(it.href, origin) })), ...action()]
    case 'membership':
      return [...opener(p), ...cards(p, items, (it) => ({ title: str(it.name), text: joinLines([str(it.price), str(it.per)].filter(Boolean).join(' '), it.blurb) }))]
    case 'offerings':
      return [...opener(p), ...cards(p, items, (it) => ({ image: str(it.image), title: str(it.title), text: joinLines(it.price, it.body), link: emailHref(it.href, origin) })), ...action()]
    case 'booking':
      return [...opener(p), ...cards(p, items, (it) => ({ title: str(it.title), text: joinLines(it.day, it.time, it.note), link: emailHref(it.href, origin) })), ...action()]
    case 'chapters':
      return [...opener(p), ...cards(p, items, (it) => ({ image: str(it.image), title: str(it.name), text: joinLines(it.place, it.body), link: emailHref(it.href, origin) })), ...action()]
    default:
      // faq, gallery, business, contact, locations: no email form (role.json hides them), so nothing to draw.
      return []
  }
}

const nameOf = (config: Config, type: string) => (config.components as Record<string, { label?: string }>)[type]?.label ?? type

/** Pack blocks into a node layout the email compiler reads: single column, stacks of at most twelve (the tree's cap). */
export function emailLayoutOf(blocks: { id: string; type: string; content: Props }[]): NodeLayout {
  const taken = new Set<string>()
  const nodes: BlockNode[] = blocks.map((b, i) => {
    const nid = nodeIdFor(`${b.id}:${b.type}:${i}`, taken)
    taken.add(nid)
    return { nid, type: b.type, content: b.content }
  })
  const layoutRows: NodeLayout['rows'] = []
  for (let i = 0; i < nodes.length; i += 12) layoutRows.push({ id: `r${layoutRows.length}`, columns: 1, cells: [nodes.slice(i, i + 12)] })
  return { rows: layoutRows, bench: [] }
}

/** Read a page as an email: the blocks it becomes and what each section's status is, in page order. */
export function emailSections(doc: Data, config: Config, origin: string, metadata?: Props, now = new Date()): { blocks: { id: string; type: string; content: Props }[]; sections: EmailSection[] } {
  const blocks: { id: string; type: string; content: Props }[] = []
  const sections: EmailSection[] = []
  for (const section of doc.content) {
    const p = (section.props ?? {}) as Props
    const id = str(p.id)
    const name = nameOf(config, section.type)
    const role = roleOfType(section.type)
    if (role) {
      const how = ROLES[role].surfaces.email
      if (how === 'hide') { sections.push({ id, type: section.type, name, status: 'hidden', note: `${name} has no email form. It stays on your site.` }); continue }
      const items = how === 'freeze' ? roleRowsAtSend(role, p, metadata, now) : rows(p.items)
      for (const b of roleEmailBlocks(role, p, items, origin)) blocks.push({ id, ...b })
      sections.push(how === 'freeze'
        ? { id, type: section.type, name, status: 'frozen', note: `${name}: these rows are fixed when the email is sent.` }
        : { id, type: section.type, name, status: 'drawn', note: '' })
      continue
    }
    if (EMAIL_PALETTE_BLOCK_IDS.has(section.type)) {
      const { id: _id, ...content } = p
      blocks.push({ id, type: section.type, content })
      sections.push(resolvedAtSend(section.type)
        ? { id, type: section.type, name, status: 'frozen', note: `${name}: the send refreshes it from the live row. This is the picked snapshot.` }
        : { id, type: section.type, name, status: 'drawn', note: '' })
      continue
    }
    sections.push({ id, type: section.type, name, status: 'hidden', note: `${name} is a site-only section. Update to new layouts gives it a role that can be sent.` })
  }
  return { blocks, sections }
}

/** The page as the email it would send: compileEmailDoc over the blocks the page becomes, plus each section's status. */
export function emailLens(doc: Data, config: Config, input: EmailLensInput): EmailLensResult {
  const { blocks, sections } = emailSections(doc, config, input.origin, input.metadata, input.now)
  const layout = emailLayoutOf(blocks)
  const compiled = compileEmailDoc({ layout, subject: input.subject, preheader: input.preheader ?? '' }, { brand: input.brand })
  return { ...compiled, sections, layout }
}
