import 'server-only'
import type { Data } from '@/lib/page-editor/types'
import { resolveFeatureSourceItems } from '@/lib/entity-blocks/block-data-sources'

export interface WebsiteFeatureItem {
  title: string
  body: string
  text: string
  price: string
  href: string
}
export type WebsiteFeatures = Record<string, WebsiteFeatureItem[]>
const SOURCES = new Set(['offerings', 'events', 'memberships', 'tickets'])

export async function resolveWebsiteFeatureItems(spaceId: string, source: string): Promise<WebsiteFeatureItem[]> {
  if (!SOURCES.has(source)) throw new Error('Unknown website content source')
  const rows = await resolveFeatureSourceItems(source, spaceId, 12)
  return rows.map((row) => ({ title: row.title, text: row.text, price: row.price, body: [row.text, row.price].filter(Boolean).join('\n'), href: row.link }))
}

/** Resolve live sources once per source/site, without copying rows into the draft. */
export async function loadWebsiteFeatures(spaceId: string, docs: readonly Data[]): Promise<WebsiteFeatures> {
  const blocks: { id: string; source: string }[] = []
  let visited = 0
  function visit(value: unknown, depth = 0) {
    if (++visited > 20_000 || depth > 30 || !value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach((child) => visit(child, depth + 1)); return }
    const item = value as Record<string, unknown>
    if (item.type === 'FeatureGrid' && item.props && typeof item.props === 'object') {
      const props = item.props as Record<string, unknown>
      if (typeof props.id === 'string' && typeof props.source === 'string' && SOURCES.has(props.source)) blocks.push({ id: props.id, source: props.source })
    }
    Object.values(item).forEach((child) => visit(child, depth + 1))
  }
  docs.forEach((doc) => visit(doc.content))
  const sources = [...new Set(blocks.map((b) => b.source))]
  const hydrated = new Map(await Promise.all(sources.map(async (source) => {
    try {
      return [source, await resolveWebsiteFeatureItems(spaceId, source)] as const
    } catch { return [source, [] as WebsiteFeatureItem[]] as const }
  })))
  return Object.fromEntries(blocks.flatMap((block) => [[block.id, hydrated.get(block.source) ?? []], [JSON.stringify([block.source, block.id]), hydrated.get(block.source) ?? []]]))
}
