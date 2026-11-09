import { buildOutline } from '@/components/page-editor/mobile/data-ops'
import { sectionDeviceLayout } from '@/lib/sites/editor/layout'
import { roleOfType } from '@/lib/blocks/roles/roles'
import type { Device } from '@/lib/sites/editor/state'
import type { Config, Data, Field } from '@/lib/page-editor/types'
import { spineItems } from './spine'
import { tuneProjection } from './tune'

// THE SHADOW RENDER (BLD-108; spec docs/EDITOR-NEXT.md#bld-108). Before the new builder becomes the website editor
// for everyone, both editors are run over the same document and every difference in what they show the owner is
// listed. Both editors draw the page through the one WebsiteCanvas, so the canvas itself cannot differ; what can
// is the editors' own reading of the document: which sections they list, what they call them, where they say a
// section is hidden, and which fields they offer for it. This module projects each editor's reading to the same
// shape (pure: no React, no I/O) and diffs them. A delta is either zero or EXPLAINED, with the pass that owns the
// difference; an unexplained delta fails lib/builder/shadow.test.ts over the frozen kit corpus and is logged when a
// real draft opens in the builder (components/sites/editor/editor-page.tsx), so the cohort rollout has evidence.

interface ShadowSection {
  id: string
  type: string
  /** What the editor calls the section in its outline. */
  name: string
  /** Hidden on the device being edited, as that editor resolves it. */
  hidden: boolean
  /** The field keys that editor's panel offers for the section, in its order. */
  fields: string[]
}

interface ShadowView { sections: ShadowSection[] }

type ShadowDeltaKind = 'section' | 'name' | 'hidden' | 'field'

interface ShadowDelta {
  id: string
  type: string
  kind: ShadowDeltaKind
  /** The field key for a `field` delta; the two values otherwise. */
  detail: string
  /** The pass that owns the difference. Absent means the delta is unexplained. */
  explained?: string
}

type Fields = Record<string, Field>
const fieldsOf = (config: Config, type: string): Fields => ((config.components as Record<string, { fields?: Fields }>)[type]?.fields ?? {}) as Fields

/** FeatureGrid reading a live source hides its `items` list in the current inspector (components/sites/editor/inspector.tsx). */
const LIVE_FEATURE_SOURCES = new Set(['offerings', 'events', 'memberships', 'tickets'])

/** The current editor's reading: its Layers outline, its per-device layout and its inspector's field filter. */
export function classicView(doc: Data, config: Config, device: Device): ShadowView {
  const outline = buildOutline(doc, config)
  return {
    sections: doc.content.map((section, index) => {
      const id = String(section.props?.id ?? '')
      const liveFeatures = section.type === 'FeatureGrid' && LIVE_FEATURE_SOURCES.has(String((section.props as Record<string, unknown>)?.source))
      const fields = Object.entries(fieldsOf(config, section.type)).filter(([key, f]) => f.type !== 'slot' && f.type !== 'external' && !(liveFeatures && key === 'items')).map(([key]) => key)
      return { id, type: section.type, name: outline[index]?.label ?? section.type, hidden: id ? !!sectionDeviceLayout(doc, id, device).hidden : false, fields }
    }),
  }
}

/** The new builder's reading: the spine, the shared visibility resolver and the Tune rail's two layers. */
export function builderView(doc: Data, config: Config, device: Device): ShadowView {
  return {
    sections: spineItems(doc, config, device).map((item) => {
      const p = tuneProjection(item.type, config)
      return { id: item.id, type: item.type, name: item.name, hidden: item.hidden, fields: [...p.layer1, ...p.layer2].map((f) => f.key) }
    }),
  }
}

/** Why a field the current inspector offers is not in the Tune rail, or null when nothing explains it. */
function explainField(type: string, key: string, config: Config, side: 'classic' | 'builder'): string | null {
  const field = fieldsOf(config, type)[key]
  if (!field) return null
  if (side === 'classic') {
    if (key === 'layout') return 'BLD-104: the per-device layout controls own `layout`, not a field'
    if (key === 'variant' && roleOfType(type)) return 'BLD-203: the Layout chips own a role block\'s `variant`'
    if (field.type === 'object') return 'BLD-105: the Tune rail has no object kind; the current inspector draws it as a nested form'
    return null
  }
  // A field only the builder offers: FeatureGrid's live `items`, which the Tune rail shows as the list's look.
  if (key === 'items' && type === 'FeatureGrid') return 'BLD-105: the Tune rail keeps a live list\'s field for its look; the current inspector hides it'
  return null
}

/** Every difference between the two editors' readings of one document on one device. */
export function shadowDeltas(doc: Data, config: Config, device: Device): ShadowDelta[] {
  const a = classicView(doc, config, device).sections
  const b = builderView(doc, config, device).sections
  const deltas: ShadowDelta[] = []
  const byId = new Map(b.map((s) => [s.id, s]))
  for (const s of a) {
    const t = byId.get(s.id)
    if (!t) { deltas.push({ id: s.id, type: s.type, kind: 'section', detail: 'listed by the current editor only' }); continue }
    byId.delete(s.id)
    if (t.type !== s.type) deltas.push({ id: s.id, type: s.type, kind: 'section', detail: `${s.type} vs ${t.type}` })
    if (t.name !== s.name) deltas.push({ id: s.id, type: s.type, kind: 'name', detail: `${JSON.stringify(s.name)} vs ${JSON.stringify(t.name)}` })
    if (t.hidden !== s.hidden) deltas.push({ id: s.id, type: s.type, kind: 'hidden', detail: `${s.hidden} vs ${t.hidden}` })
    const mine = new Set(s.fields)
    const theirs = new Set(t.fields)
    for (const key of s.fields) if (!theirs.has(key)) deltas.push({ id: s.id, type: s.type, kind: 'field', detail: key, explained: explainField(s.type, key, config, 'classic') ?? undefined })
    for (const key of t.fields) if (!mine.has(key)) deltas.push({ id: s.id, type: s.type, kind: 'field', detail: key, explained: explainField(s.type, key, config, 'builder') ?? undefined })
  }
  for (const t of byId.values()) deltas.push({ id: t.id, type: t.type, kind: 'section', detail: 'listed by the new builder only' })
  return deltas
}

interface ShadowReport {
  /** Sections compared, over every page and device. */
  sections: number
  deltas: ShadowDelta[]
  unexplained: ShadowDelta[]
}

const DEVICES: Device[] = ['desktop', 'tablet', 'phone']

/** The shadow render over a draft's pages on every device. */
export function shadowReport(pages: { slug: string; doc: Data }[], config: Config): ShadowReport {
  const deltas: ShadowDelta[] = []
  let sections = 0
  for (const page of pages) {
    for (const device of DEVICES) {
      sections += page.doc.content.length
      for (const d of shadowDeltas(page.doc, config, device)) deltas.push({ ...d, id: `${page.slug}:${device}:${d.id}` })
    }
  }
  return { sections, deltas, unexplained: deltas.filter((d) => !d.explained) }
}

/** One line per unexplained delta, for the server log when a draft opens in the builder. Silent when there are none. */
export function shadowLogLines(host: string, report: ShadowReport): string[] {
  return report.unexplained.map((d) => `[builder shadow] ${host} ${d.id} ${d.type} ${d.kind}: ${d.detail}`)
}
