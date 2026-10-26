// ONE ABOUT FOR EVERY SURFACE. The Space's intro lives in one place, `spaces.about`, and the Spotlight, the Space
// page and the website all read it (content-slots.ts, slot `intro`). An About block's own `body` is a per-page
// copy that beats it, so an edit typed into one page never reached the others. On save, this lifts the typed
// body out of the layout so the caller can write it to the Space, and returns the layout without it, so every
// page falls back to the one shared intro again. PURE: no IO, never mutates its input, tolerant of any shape
// (a type-keyed document with `content.about`, or a node document with About nodes, in `rows` or `bench`).

/** The Space intro column holds at most this many characters (lib/spaces/profile-settings.ts). */
export const SPACE_ABOUT_MAX = 4000

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Drop `body` from an About bag, returning the bag without it, or undefined when nothing else is left. */
function withoutBody(bag: Record<string, unknown>): Record<string, unknown> | undefined {
  const { body: _body, ...rest } = bag
  return Object.keys(rest).length ? rest : undefined
}

export function takeAboutBody(layout: unknown): { body: string | null; layout: unknown } {
  let body: string | null = null
  const take = (bag: unknown): bag is Record<string, unknown> => {
    if (!isRecord(bag) || typeof bag.body !== 'string' || !bag.body.trim()) return false
    body = bag.body.trim().slice(0, SPACE_ABOUT_MAX)
    return true
  }
  const walk = (v: unknown, key?: string): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x))
    if (!isRecord(v)) return v
    // A node: { type: 'about', content: { body } }.
    if (v.type === 'about' && take(v.content)) {
      const { content: _c, ...node } = v
      const left = withoutBody(v.content as Record<string, unknown>)
      return left ? { ...node, content: left } : node
    }
    // Built with fromEntries (own data properties), never by assigning a key taken from the input.
    const entries: [string, unknown][] = []
    for (const [k, child] of Object.entries(v)) {
      // A type-keyed document: content.about = { body }.
      if (k === 'about' && key === 'content' && take(child)) {
        const left = withoutBody(child as Record<string, unknown>)
        if (left) entries.push([k, left])
        continue
      }
      entries.push([k, walk(child, k)])
    }
    return Object.fromEntries(entries)
  }
  const next = walk(layout)
  return body === null ? { body: null, layout } : { body, layout: next }
}
