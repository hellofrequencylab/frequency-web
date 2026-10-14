import { inlineTextValue } from './inline-edit'

// CANVAS ⇄ INSPECTOR SYNC. One selection, two views: a click on a line of copy in the canvas opens and
// highlights the field it came from in the inspector, and a field focused in the inspector highlights its
// copy on the canvas, so the owner always knows which words they are working on.
//
// The canvas side already resolves a click to { field, path } (findInlineTextMatch). These are the two
// pure halves the shell, the inspector and the canvas share.

/** A field in a block: a top-level key, then the path into nested card and list copy (`[2, 'body']`). */
export interface FieldFocus { blockId: string; field: string; path: (string | number)[] }

/** The value a field focus points at, or undefined. */
function valueAt(props: Record<string, unknown>, field: string, path: (string | number)[]): unknown {
  let value: unknown = props[field]
  for (const key of path) value = value && typeof value === 'object' ? (value as Record<string | number, unknown>)[key] : undefined
  return value
}

/** Every rendered line a field can draw, as the canvas compares text (inlineTextValue). A string field is
 *  split the way the blocks split copy (blank lines, single newlines, paragraph tags); a card or list field
 *  contributes each of its strings, so focusing "Cards" lights every card's words. */
export function fieldTextTargets(props: Record<string, unknown>, field: string, path: (string | number)[] = []): string[] {
  const out = new Set<string>()
  const walk = (value: unknown, depth: number) => {
    if (depth > 6) return
    if (typeof value === 'string') {
      for (const part of value.split(/\n|<\/p>\s*<p[^>]*>/i)) {
        const plain = inlineTextValue(part)
        if (plain.length > 1) out.add(plain)
      }
      return
    }
    if (Array.isArray(value)) for (const item of value) walk(item, depth + 1)
    else if (value && typeof value === 'object') for (const item of Object.values(value)) walk(item, depth + 1)
  }
  walk(valueAt(props, field, path), 0)
  return [...out]
}

/** The inspector field a focus opens: a card inside an array opens that card's own screen and lights the
 *  key inside it; anything else lights the top-level field. */
export function inspectorTarget(focus: Pick<FieldFocus, 'field' | 'path'>): { field: string; item: number | null; key: string } {
  const [first, second] = focus.path
  if (typeof first === 'number') return { field: focus.field, item: first, key: typeof second === 'string' ? second : focus.field }
  return { field: focus.field, item: null, key: focus.field }
}
