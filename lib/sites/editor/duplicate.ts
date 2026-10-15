import type { Config, ContentItem, Data } from '@/lib/page-editor/types'
import { duplicateBlockDeep, findBlockDeep, slotFieldsFor } from '@/components/page-editor/mobile/data-ops'
import type { Device, SectionDisplay } from './state'

/** Website display settings live outside block props, keyed by each block's ID.
 * Copy them alongside the re-identified subtree, without copying unique anchors.
 * Keep this editor-only so public layout readers never import editing operations. */
export function duplicateWebsiteSection(doc: Data, config: Config, id: string): { data: Data; id: string } {
  const result = duplicateBlockDeep(doc, config, id)
  if (!result.id || !doc.root.props?.websiteLayout) return result
  const layout = { ...doc.root.props.websiteLayout }
  function copyLayout(source: ContentItem, copy: ContentItem) {
    const entry = layout[source.props.id!]
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      layout[copy.props.id!] = Object.fromEntries(Object.entries(entry as Partial<Record<Device, SectionDisplay>>).filter(([, display]) => display && typeof display === 'object' && !Array.isArray(display)).map(([device, display]) => {
        const { anchor: _anchor, ...retained } = structuredClone(display!)
        void _anchor
        return [device, retained]
      }))
    }
    for (const { key } of slotFieldsFor(config, source.type)) {
      const children = source.props[key] as ContentItem[] | undefined
      const copies = copy.props[key] as ContentItem[] | undefined
      children?.forEach((child, index) => { if (copies?.[index]) copyLayout(child, copies[index]) })
    }
  }
  const source = findBlockDeep(doc, config, id)
  const copy = findBlockDeep(result.data, config, result.id)
  if (source && copy) copyLayout(source, copy)
  return { ...result, data: { ...result.data, root: { ...result.data.root, props: { ...result.data.root.props, websiteLayout: layout } } } }
}
