// E0's inline nodes cannot round-trip through the current type-keyed Space editor. Refuse
// that downgrade before sanitizeEntityLayout can turn object cells into an empty/cleared page.
// This is a compatibility boundary, not a node writer or the task-10 dedupe conversion.
export const NODE_LAYOUT_WRITE_ERROR = 'This page uses a layout this editor cannot save yet. Your saved work has been kept.'

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/** Stored bench belongs to the inline-node format, even when empty or malformed. Object
 * cells are also incompatible, including mixed legacy/node payloads. A parsed legacy
 * document's sibling `nodes` projection is deliberately ignored (LIVE-119/task 9). */
function hasNativeNodeStorage(value: unknown): boolean {
  const layout = record(value)
  if (!layout) return false
  if (Object.hasOwn(layout, 'bench')) return true
  if (!Array.isArray(layout.rows)) return false
  return layout.rows.some((rawRow: unknown) => {
    const row = record(rawRow)
    if (!row || !Array.isArray(row.cells)) return false
    return row.cells.some((stack: unknown) => {
      if (record(stack)) return true
      return Array.isArray(stack) && stack.some((cell: unknown) => record(cell) !== null)
    })
  })
}

/** Reject an incompatible incoming document or a stale legacy write over either stored
 * native document. Both published and draft participate: clearing an "equal" draft or
 * promoting/discarding it can otherwise erase authored node identities and bench bags. */
export function legacySpaceLayoutWriteError(incoming: unknown, preferences: unknown): string | null {
  const current = record(preferences)
  return hasNativeNodeStorage(incoming) || hasNativeNodeStorage(current?.profileLayout) || hasNativeNodeStorage(current?.profileLayoutDraft)
    ? NODE_LAYOUT_WRITE_ERROR
    : null
}
