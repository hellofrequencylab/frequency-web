import { nudgeBlock, removeBlockDeep } from '@/components/page-editor/mobile/data-ops'
import { duplicateWebsiteSection } from '@/lib/sites/editor/duplicate'
import { sectionVisibility, setSectionVisibility, type Device } from '@/lib/sites/editor/state'
import type { Config, Data } from '@/lib/page-editor/types'

// THE SECTION TOOLBAR'S ACTIONS (BLD-104; spec docs/EDITOR-NEXT.md#bld-104): move, duplicate, hide on this device
// and delete. Each is one pure change to the page, so the shell applies it as ONE edit and one undo takes it back.
// Delete says so in a toast with Undo, because the section's words go with it.

type SectionAction = 'up' | 'down' | 'copy' | 'hide' | 'delete'

interface SectionResult {
  doc: Data
  /** The section to select after the change: the copy after a duplicate, nothing after a delete. */
  select?: string | null
  /** What to tell the owner. A delete carries Undo. */
  say: string
  undo?: boolean
}

export function sectionCommand(doc: Data, config: Config, id: string, action: SectionAction, device: Device): SectionResult | null {
  const block = doc.content.find((s) => s.props?.id === id)
  if (!block) return null
  const name = (config.components as Record<string, { label?: string }>)[block.type]?.label ?? block.type
  switch (action) {
    case 'up':
    case 'down':
      return { doc: nudgeBlock(doc, config, id, action === 'up' ? -1 : 1), say: `Moved ${name} ${action}` }
    case 'copy': {
      const next = duplicateWebsiteSection(doc, config, id)
      return { doc: next.data, select: next.id, say: `${name} duplicated` }
    }
    case 'hide': {
      const visible = sectionVisibility(doc, id)[device]
      return { doc: setSectionVisibility(doc, id, device, !visible), say: visible ? `${name} hidden on ${device}` : `${name} showing on ${device}` }
    }
    case 'delete':
      return { doc: removeBlockDeep(doc, config, id).data, select: null, say: `${name} deleted`, undo: true }
  }
}
