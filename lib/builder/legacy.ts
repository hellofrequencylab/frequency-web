// UPDATE TO NEW LAYOUTS IN THE BUILDER (BLD-205, docs/EDITOR-NEXT.md#bld-205). LIVE-1860 made the conversion: old
// theme-named blocks (MidnightHero, NetworkKitCTA, ...) to role blocks, words carried one for one, nothing moving
// until the owner keeps it (lib/blocks/roles/legacy-map.ts). The builder surfaces it per page: each convertible
// section with its role version beside it and what carries over, the owner picks which to update, and the pick is
// one new document, so it is one undo step. PURE: no React.

import type { Config, Data } from '@/lib/page-editor/types'
import { upgradeDocument } from '@/lib/blocks/roles/legacy-map'
import { ROLES, type RoleId } from '@/lib/blocks/roles/roles'

type Props = Record<string, unknown>
type Block = { type: string; props: Props }
type LegacyDoc = Parameters<typeof upgradeDocument>[0]

export interface LegacyRow {
  id: string
  /** The old block, as the outline names it. */
  from: string
  /** The role it becomes, by its intent ("Say who you are"). */
  to: string
  role: RoleId
  /** Owner words for each field whose value comes along. */
  carried: string[]
  /** Settings on the old block that do not come along: look-only, the theme draws them now. */
  dropped: string[]
  before: Block
  after: Block
}

export interface LegacyPlan {
  rows: LegacyRow[]
  /** Old blocks the map leaves as they are, because their lists do not fit a role yet. */
  kept: { id: string; name: string }[]
}

const filled = (v: unknown) => v != null && (typeof v !== 'string' || v.trim() !== '')
const SKIP = new Set(['id', 'layout', 'variant', 'variantSet', 'live'])

function blocksOf(doc: { content?: unknown; zones?: unknown }): Block[] {
  const zones = doc.zones && typeof doc.zones === 'object' ? Object.values(doc.zones as Record<string, Block[]>).flat() : []
  return [...((doc.content as Block[] | undefined) ?? []), ...zones].filter((b) => !!b && typeof b === 'object' && typeof b.type === 'string')
}

const nameOf = (config: Config, type: string) => String(config.components[type]?.label ?? type).replace(/\*/g, '')

/** What "Update to new layouts" would do on this page: each section it converts, before and after, and those it keeps. */
export function legacyPlan(doc: Data, config: Config): LegacyPlan {
  const { doc: next, changes, kept } = upgradeDocument(doc as unknown as LegacyDoc)
  const before = new Map(blocksOf(doc as never).map((b) => [String(b.props?.id ?? ''), b]))
  const after = new Map(blocksOf(next).map((b) => [String(b.props?.id ?? ''), b]))
  const rows = changes.flatMap((c): LegacyRow[] => {
    const old = before.get(c.id)
    const role = after.get(c.id)
    if (!old || !role) return []
    const labels = ROLES[c.role].slots.labels as Record<string, { label: string } | undefined>
    const keys = Object.keys(role.props).filter((k) => !SKIP.has(k) && filled(role.props[k]))
    const carried = [...new Set(keys.map((k) => labels[k]?.label ?? labels[k.replace(/(Label|Href)$/, '')]?.label ?? k))]
    const values = new Set(keys.map((k) => JSON.stringify(role.props[k])))
    const dropped = Object.keys(old.props ?? {}).filter((k) => !SKIP.has(k) && filled(old.props[k]) && !values.has(JSON.stringify(old.props[k])))
    return [{ id: c.id, from: nameOf(config, c.from), to: ROLES[c.role].intent, role: c.role, carried, dropped, before: old, after: role }]
  })
  return { rows, kept: kept.map((k) => ({ id: k.id, name: nameOf(config, k.type) })) }
}

/** The page with the picked sections updated: one new document, so the caller records one undo step. A pick of
 *  nothing returns the page unchanged. */
export function applyLegacy(doc: Data, ids: ReadonlySet<string>): Data {
  if (!ids.size) return doc
  return upgradeDocument(doc as unknown as LegacyDoc, ids).doc as unknown as Data
}
