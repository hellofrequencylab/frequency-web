// The website builder's Layers tree as a keyboard surface (PROG-E6 item 6): one tab stop for the whole tree
// (a roving tabindex), arrows walk it, and a few shortcuts act on the focused row. Pure, so the shell only
// wires keys to these answers and the order rules are tested without a DOM.

/** The part of an outline node this needs: its id and the blocks nested in its slots. */
export type LayerNode = { id: string; slots: { children: LayerNode[] }[] }

/** One row of the tree as the reader meets it, top to bottom. */
type LayerRow = { id: string; parent: string | null; depth: number }

const LAYER_FOCUS_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'] as const

/** The tree in reading order: each block, then everything inside its slots, depth first. */
export function flattenLayers(nodes: readonly LayerNode[], parent: string | null = null, depth = 0): LayerRow[] {
  return nodes.flatMap((node) => [{ id: node.id, parent, depth }, ...node.slots.flatMap((slot) => flattenLayers(slot.children, node.id, depth + 1))])
}

/** The one row that takes Tab: the selected block when it is on this page, else the first row. */
export function layerTabStop(rows: readonly LayerRow[], selectedId: string | null): string | null {
  if (selectedId && rows.some((row) => row.id === selectedId)) return selectedId
  return rows[0]?.id ?? null
}

/** Where focus goes from `currentId` for an arrow, Home or End. Up and Down step through every row;
 *  Left goes to the block that holds this one; Right goes to the first block inside it. Null means stay. */
export function nextLayerFocus(rows: readonly LayerRow[], currentId: string, key: string): string | null {
  const at = rows.findIndex((row) => row.id === currentId)
  if (at < 0) return rows[0]?.id ?? null
  switch (key) {
    case 'ArrowDown': return rows[at + 1]?.id ?? null
    case 'ArrowUp': return rows[at - 1]?.id ?? null
    case 'Home': return at === 0 ? null : rows[0].id
    case 'End': return at === rows.length - 1 ? null : rows[rows.length - 1].id
    case 'ArrowLeft': return rows[at].parent
    case 'ArrowRight': { const next = rows[at + 1]; return next && next.parent === currentId ? next.id : null }
    default: return null
  }
}

type LayerShortcut = 'delete' | 'copy' | 'hide' | 'comment'

type KeyLike = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }

/** The row shortcuts, matching the section menu's actions: Delete or Backspace removes, Cmd or Ctrl and D
 *  duplicates, Cmd or Ctrl, Shift and H hides on this device, Shift and C opens comments. Alt is left to the
 *  move keys. */
export function layerShortcut(e: KeyLike): LayerShortcut | null {
  if (e.altKey) return null
  const mod = e.metaKey || e.ctrlKey
  const key = e.key.toLowerCase()
  if (!mod && !e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) return 'delete'
  if (mod && !e.shiftKey && key === 'd') return 'copy'
  if (mod && e.shiftKey && key === 'h') return 'hide'
  if (!mod && e.shiftKey && key === 'c') return 'comment'
  return null
}

type LayerKeyPlan =
  | { kind: 'move'; direction: -1 | 1 }
  | { kind: 'focus'; id: string }
  | { kind: 'act'; shortcut: LayerShortcut; refocus: string | null }

/** What one key on a Layers row does. Alt and Up or Down moves the block; a plain arrow, Home or End moves
 *  focus; a shortcut acts, and a removal names the row that takes focus after it. Hide is for top-level
 *  sections only (a nested block has no per-device display). Null leaves the key to the browser. */
export function planLayerKey(rows: readonly LayerRow[], id: string, depth: number, e: KeyLike): LayerKeyPlan | null {
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) return { kind: 'move', direction: e.key === 'ArrowUp' ? -1 : 1 }
  if (!e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && (LAYER_FOCUS_KEYS as readonly string[]).includes(e.key)) {
    const next = nextLayerFocus(rows, id, e.key)
    return next ? { kind: 'focus', id: next } : null
  }
  const shortcut = layerShortcut(e)
  if (!shortcut || (shortcut === 'hide' && depth > 0)) return null
  if (shortcut !== 'delete') return { kind: 'act', shortcut, refocus: null }
  // A removed block takes its nested blocks with it: focus goes to the next row outside it, else the one before.
  const at = rows.findIndex((row) => row.id === id)
  let after = at + 1
  while (after < rows.length && rows[after].depth > (rows[at]?.depth ?? 0)) after++
  return { kind: 'act', shortcut, refocus: rows[after]?.id ?? rows[at - 1]?.id ?? null }
}

/** What the row announces as its keys (aria-keyshortcuts), the move keys first. */
export const LAYER_KEYSHORTCUTS = 'Alt+ArrowUp Alt+ArrowDown Delete Control+D Meta+D Control+Shift+H Meta+Shift+H Shift+C'
