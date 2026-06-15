// Pure per-route page-LAYOUT resolution (the module-assignment engine, ADR-270): which
// modules show inside a page and in what order. Stored in page_settings.layout (jsonb) as
// { order, hidden } and merged over the registry's default order. Dependency-free so it is
// unit-tested and safe to import anywhere (server, client editor, or the save action).

export interface LayoutConfig {
  order: string[]
  hidden: string[]
}

/** Coerce the stored jsonb into a safe LayoutConfig (string arrays only). */
export function parseLayout(raw: unknown): LayoutConfig {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as { order?: unknown; hidden?: unknown }
    const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
    return { order: arr(o.order), hidden: arr(o.hidden) }
  }
  return { order: [], hidden: [] }
}

/** All module ids in resolved order: the saved order first (known ids only, de-duped), then
 *  any registry modules not yet placed (in registry order). Hidden ids are KEPT — the editor
 *  needs them; use resolveModuleIds for rendering. */
export function orderedModuleIds(config: LayoutConfig, allIds: readonly string[]): string[] {
  const known = new Set(allIds)
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of config.order) {
    if (known.has(id) && !seen.has(id)) {
      out.push(id)
      seen.add(id)
    }
  }
  for (const id of allIds) {
    if (!seen.has(id)) {
      out.push(id)
      seen.add(id)
    }
  }
  return out
}

/** The ordered, VISIBLE module ids to render (resolved order minus the hidden set). */
export function resolveModuleIds(config: LayoutConfig, allIds: readonly string[]): string[] {
  const hidden = new Set(config.hidden)
  return orderedModuleIds(config, allIds).filter((id) => !hidden.has(id))
}
