'use client'

import { useNodeLayout } from './node-layout-store'
import { useProfileLayout } from './profile-layout-context'

// THE EDITOR BINDING (E0 task 12b, ADR-1837). The canvas block and the publish bar need only a small slice
// of the editor store: which block is selected, which item inside it, and the autosave state. Two stores
// can answer that: the live type-keyed store, and the node store (ADR-1835) once a node document has been
// seeded into it. This hook returns whichever is in charge, so those consumers do not fork into two copies
// while the editor moves across behind render_path_space_profile. Until a node store is seeded (nothing
// seeds it yet) it is exactly the live store, so every existing surface behaves as before.
//
// `select` takes the key of the thing selected: a block TYPE on the live store, a NODE ID on the node
// store. A consumer that knows its node id passes it; one that does not passes the type.

export interface EditorBinding {
  selectedItemIndex: number | null
  select: (key: string | null) => void
  selectItem: (index: number | null) => void
  saving: boolean
  dirty: boolean
  canUndo: boolean
  undo: () => void
}

export function useEditorBinding(): EditorBinding | null {
  const node = useNodeLayout()
  const live = useProfileLayout()
  if (node?.seeded) {
    return {
      selectedItemIndex: node.selectedItemIndex,
      select: node.select,
      selectItem: node.selectItem,
      saving: node.saving,
      dirty: node.dirty,
      canUndo: node.canUndo,
      undo: node.undo,
    }
  }
  if (!live) return null
  return {
    selectedItemIndex: live.selectedItemIndex,
    select: live.select,
    selectItem: live.selectItem,
    saving: live.saving,
    dirty: live.dirty,
    canUndo: live.canUndo,
    undo: live.undo,
  }
}
