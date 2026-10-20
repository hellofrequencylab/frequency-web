// THE render_path FLAGS (E0 task 2, docs/EDITOR-E0.md section 5): the pure half. One boolean
// platform_flags row per surface, because platform_flags.value is a boolean and a per-surface map cannot
// live in one row. The fail-closed reader is `renderPathEnabled` in lib/platform-flags.ts, beside the
// other flag readers (the service-role client stays in one module). Writes go through setPlatformFlag,
// so every flip is audited in platform_flag_events.

export const RENDER_PATH_SURFACES = ['marketing', 'space_profile', 'spotlight', 'email', 'site'] as const
export type RenderPathSurface = (typeof RENDER_PATH_SURFACES)[number]

export function renderPathKey(surface: RenderPathSurface): string {
  return `render_path_${surface}`
}
