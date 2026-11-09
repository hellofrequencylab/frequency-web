import { moveBlock } from '@/components/page-editor/mobile/data-ops'
import { sectionVisibility, type Device } from '@/lib/sites/editor/state'
import type { Config, Data } from '@/lib/page-editor/types'

// THE SPINE AND OUTLINE (BLD-103; spec docs/EDITOR-NEXT.md#bld-103). Both read the same list: one entry per
// top-level section of the page, named by what the section is for (its block's label, the role intent) and by
// its own words (the title slot), dimmed where it is hidden on the device being edited. Reordering goes through
// one pure move, so a drag and the keyboard produce the same document and every block keeps its exact props.

interface SpineItem {
  id: string
  type: string
  /** What the section is for: the block's label, like "Services story". */
  name: string
  /** The section's own heading, markup stripped, or empty. */
  title: string
  /** Hidden on the device being edited: the outline dims it, the spine still lists it. */
  hidden: boolean
}

const TITLE_SLOTS = ['title', 'heading', 'headline', 'eyebrow', 'name'] as const

function titleOf(props: Record<string, unknown>): string {
  for (const key of TITLE_SLOTS) {
    const value = props[key]
    if (typeof value === 'string' && value.trim()) return value.replace(/&#39;/g, "'").replace(/[*_]/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  return ''
}

export function spineItems(doc: Data, config: Config, device: Device): SpineItem[] {
  return doc.content.map((section) => {
    const id = String(section.props?.id ?? '')
    return {
      id,
      type: section.type,
      name: (config.components as Record<string, { label?: string }>)[section.type]?.label ?? section.type,
      title: titleOf((section.props ?? {}) as Record<string, unknown>),
      hidden: id ? !sectionVisibility(doc, id)[device] : false,
    }
  })
}

/** Move the section with `id` to position `to` (a drop). Unknown ids leave the document as it is. */
export function moveSection(doc: Data, id: string, to: number): Data {
  const from = doc.content.findIndex((s) => s.props?.id === id)
  return from < 0 ? doc : moveBlock(doc, from, to)
}

/** Move the section one step up or down (the keyboard: Alt plus an arrow on a focused row). */
export function stepSection(doc: Data, id: string, delta: -1 | 1): Data {
  const from = doc.content.findIndex((s) => s.props?.id === id)
  return from < 0 ? doc : moveBlock(doc, from, from + delta)
}
