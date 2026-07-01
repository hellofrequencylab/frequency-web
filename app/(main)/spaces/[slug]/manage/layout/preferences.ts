import type { SpaceTemplate } from '@/lib/spaces/templates'

// PURE preferences-merge helper for the layout layer, kept in its OWN module (NOT the
// 'use server' actions file — a Server Actions file may only export async functions, so a
// synchronous helper exported there fails the production build). Imported by both the
// action and its unit test.

/** Compute the next preferences blob for a layout change. PURE:
 *   - 'auto'  -> delete the `template` override (derive from type + Focus).
 *   - a template id -> set `template` to it.
 *   - opts.reset -> also delete the `puck` doc (so the new layout's preset actually shows).
 *  Every other preferences key is preserved (non-destructive merge). */
export function nextLayoutPreferences(
  current: Record<string, unknown>,
  template: SpaceTemplate | 'auto',
  opts?: { reset?: boolean },
): Record<string, unknown> {
  const next = { ...current }
  if (template === 'auto') delete next.template
  else next.template = template
  if (opts?.reset) delete next.puck
  return next
}
