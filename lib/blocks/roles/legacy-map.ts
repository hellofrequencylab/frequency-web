import { ROLES, type RoleId } from './roles'

// THE LEGACY MAP (docs/THEME-COHESION.md section 4, ADR-1923, LIVE-1860). Old theme-named blocks (MidnightHero,
// NetworkKitCTA, ...) stand in for a role. This file is the opt-in half: nothing here runs on its own, a document
// renders identically before and after it ships, and a page only changes when an owner presses "Update to new
// layouts" and keeps the diff. Only blocks whose words carry over one for one are converted (flat text and button
// fields, and the Space-fed ones). A block with lists in a shape the role cannot take (steps, tiers, services) is
// left exactly as it is and reported as kept, never half converted.

type Props = Record<string, unknown>
interface Block { type: string; props: Props }
interface Doc { content?: Block[]; zones?: Record<string, Block[]>; [k: string]: unknown }

interface Rule {
  role: RoleId
  /** Legacy field name → role field name. Fields not named here are dropped (look-only fields). */
  fields: Record<string, string>
  /** The role variant that draws closest to the old block, or empty for "the theme's default". */
  variant?: string
  /** Extra props the role needs, such as `live: true` for a block that read the Space's own rows. */
  set?: Props
}

const HERO = { eyebrow: 'eyebrow', title: 'title', lead: 'lead', image: 'image', alt: 'alt', primaryLabel: 'primaryLabel', primaryHref: 'primaryHref', secondaryLabel: 'secondaryLabel', secondaryHref: 'secondaryHref' }
const BUTTON = { eyebrow: 'eyebrow', title: 'title', buttonLabel: 'primaryLabel', buttonHref: 'primaryHref', secondaryLabel: 'secondaryLabel', secondaryHref: 'secondaryHref' }
const LETTER = { title: 'title', lead: 'lead', buttonLabel: 'primaryLabel' }
const EVENTS = { eyebrow: 'eyebrow', title: 'title', lead: 'lead', actionLabel: 'actionLabel', actionHref: 'actionHref', count: 'count', image: 'image', alt: 'alt', empty: 'empty' }

export const LEGACY_RULES: Readonly<Record<string, Rule>> = {
  Hero: { role: 'hero', fields: { eyebrow: 'eyebrow', title: 'title', subtitle: 'lead', image: 'image', ctaPrimaryLabel: 'primaryLabel', ctaPrimaryHref: 'primaryHref', ctaSecondaryLabel: 'secondaryLabel', ctaSecondaryHref: 'secondaryHref' } },
  PhotoHero: { role: 'hero', variant: 'full', fields: { eyebrow: 'eyebrow', title: 'title', subtitle: 'lead', image: 'image', alt: 'alt', actionPrimaryLabel: 'primaryLabel', actionPrimaryHref: 'primaryHref', actionSecondaryLabel: 'secondaryLabel', actionSecondaryHref: 'secondaryHref' } },
  MidnightHero: { role: 'hero', fields: HERO },
  NetworkKitHero: { role: 'hero', fields: HERO },
  NetworkHero: { role: 'hero', fields: HERO },
  DesignerHero: { role: 'hero', fields: HERO },
  TempleHero: { role: 'hero', fields: HERO },
  TempleKitHero: { role: 'hero', fields: HERO },
  CallToAction: { role: 'cta', fields: { eyebrow: 'eyebrow', heading: 'title', body: 'lead', ctaPrimaryLabel: 'primaryLabel', ctaPrimaryHref: 'primaryHref', ctaSecondaryLabel: 'secondaryLabel', ctaSecondaryHref: 'secondaryHref' } },
  MidnightCTA: { role: 'cta', fields: BUTTON },
  NetworkKitCTA: { role: 'cta', fields: BUTTON },
  DesignerClosing: { role: 'cta', fields: { title: 'title', buttonLabel: 'primaryLabel', buttonHref: 'primaryHref' } },
  NetworkBand: { role: 'statement', fields: { eyebrow: 'eyebrow', title: 'title', body: 'lead', primaryLabel: 'primaryLabel', primaryHref: 'primaryHref', secondaryLabel: 'secondaryLabel', secondaryHref: 'secondaryHref' } },
  MidnightBand: { role: 'statement', fields: BUTTON },
  DesignerStatement: { role: 'statement', fields: { eyebrow: 'eyebrow', title: 'title', lead: 'lead', linkLabel: 'primaryLabel', linkHref: 'primaryHref' } },
  MidnightLetter: { role: 'letter', fields: LETTER },
  NetworkKitLetter: { role: 'letter', fields: LETTER },
  TempleFollow: { role: 'letter', fields: { eyebrow: 'eyebrow', title: 'title', lead: 'lead', buttonLabel: 'primaryLabel' } },
  SpaceJoinList: { role: 'letter', fields: { eyebrow: 'eyebrow', title: 'title', body: 'lead', submitLabel: 'primaryLabel' } },
  LiveEvents: { role: 'gatherings', fields: {}, set: { live: true } },
  SpaceEvents: { role: 'gatherings', fields: { eyebrow: 'eyebrow', heading: 'title', max: 'count' }, set: { live: true } },
  MidnightGatherings: { role: 'gatherings', fields: EVENTS, set: { live: true } },
  NetworkKitGatherings: { role: 'gatherings', fields: EVENTS, set: { live: true } },
  NetworkEvents: { role: 'gatherings', fields: { eyebrow: 'eyebrow', title: 'title', lead: 'lead', actionLabel: 'actionLabel', actionHref: 'actionHref', empty: 'empty' }, set: { live: true } },
  TempleEvents: { role: 'gatherings', fields: { eyebrow: 'eyebrow', title: 'title', lead: 'lead', actionLabel: 'actionLabel', actionHref: 'actionHref', count: 'count' }, set: { live: true } },
  TempleKitGatherings: { role: 'gatherings', fields: { eyebrow: 'eyebrow', title: 'title', lead: 'lead', actionLabel: 'actionLabel', actionHref: 'actionHref', count: 'count', empty: 'empty' }, set: { live: true } },
}

const ROLE_BY_TYPE = new Map((Object.keys(ROLES) as RoleId[]).map((r) => [ROLES[r].type, r]))
const LEGACY_TYPES = new Set((Object.keys(ROLES) as RoleId[]).flatMap((r) => ROLES[r].replaces))
const isLegacyType = (type: unknown): type is string => typeof type === 'string' && LEGACY_TYPES.has(type)

/** Every legacy type a role claims through `replaces`, with whether this map converts it. */
export function legacyCoverage(): { type: string; role: RoleId; converts: boolean }[] {
  const out: { type: string; role: RoleId; converts: boolean }[] = []
  for (const role of Object.keys(ROLES) as RoleId[]) for (const type of ROLES[role].replaces) out.push({ type, role, converts: type in LEGACY_RULES })
  return out
}

/** The block as its role stands in for it, or null when this map does not convert it. The block keeps its id, so
 *  comments, layout positions and anchors still find it. */
export function upgradeBlock(block: Block): Block | null {
  const rule = LEGACY_RULES[block?.type]
  if (!rule) return null
  const props: Props = { id: block.props?.id }
  for (const [from, to] of Object.entries(rule.fields)) {
    const v = block.props?.[from]
    if (typeof v === 'string' ? v.trim() : v != null && v !== '') props[to] = v
  }
  if (block.props?.layout) props.layout = block.props.layout
  if (rule.variant) props.variant = rule.variant
  Object.assign(props, rule.set)
  return { type: ROLES[rule.role].type, props }
}

export interface LegacyChange { id: string; from: string; to: string; role: RoleId }
export interface LegacyUpgrade { doc: Doc; changes: LegacyChange[]; kept: { id: string; type: string }[] }

/** Upgrade every convertible block on a page. Pure: the input is not touched, `changes` is the diff the owner reads
 *  before keeping it, and `kept` lists the old blocks left alone because their words would not carry over. */
export function upgradeDocument(doc: Doc, only?: ReadonlySet<string>): LegacyUpgrade {
  const changes: LegacyChange[] = []
  const kept: LegacyUpgrade['kept'] = []
  const run = (blocks: Block[] | undefined) => blocks?.map((b) => {
    const id = String(b?.props?.id ?? '')
    if (only && !only.has(id)) return b
    const next = upgradeBlock(b)
    if (next) { changes.push({ id, from: b.type, to: next.type, role: ROLE_BY_TYPE.get(next.type)! }); return next }
    if (isLegacyType(b?.type)) kept.push({ id, type: b.type })
    return b
  })
  const content = run(doc.content)
  const zones = doc.zones ? Object.fromEntries(Object.entries(doc.zones).map(([k, v]) => [k, run(v) ?? v])) : undefined
  return { doc: changes.length ? { ...doc, ...(content ? { content } : {}), ...(zones ? { zones } : {}) } : doc, changes, kept }
}

/** How many blocks on these pages the Update button would change, for the badge on the button. */
export function upgradableCount(docs: readonly unknown[]): number {
  return docs.reduce<number>((n, d) => n + upgradeDocument(d as Doc).changes.length, 0)
}
