// THE ACTION REGISTRY AND COMMAND BAR LIST (BLD-106; spec docs/EDITOR-NEXT.md#bld-106). Every action the top bar,
// the rails and the section toolbar offer is named here once, with its words and shortcut. The buttons carry the
// same id (data-action), and the command bar lists this registry, so anything you can press you can also find
// with ⌘K. Pure: the shell hands each id to its own handler.

export const BUILDER_ACTIONS = {
  undo: { label: 'Undo', keys: '⌘Z', needs: null },
  redo: { label: 'Redo', keys: '⇧⌘Z', needs: null },
  preview: { label: 'Preview as a visitor', keys: '⌘\\', needs: null },
  focus: { label: 'Focus: hide both side panels', keys: null, needs: null },
  publish: { label: 'Publish', keys: null, needs: null },
  add: { label: 'Add a section', keys: null, needs: null },
  theme: { label: 'Change the theme', keys: null, needs: null },
  vera: { label: 'Ask Vera', keys: null, needs: null },
  'update-layouts': { label: 'Update this page to the new layouts', keys: null, needs: null },
  'device-desktop': { label: 'Show the desktop size', keys: null, needs: null },
  'device-tablet': { label: 'Show the tablet size', keys: null, needs: null },
  'device-phone': { label: 'Show the phone size', keys: null, needs: null },
  'view-host': { label: 'View as the host (editing)', keys: null, needs: null },
  'view-member': { label: 'View as a member', keys: null, needs: null },
  'view-visitor': { label: 'View as a visitor', keys: null, needs: null },
  'surface-site': { label: 'Show as your website', keys: null, needs: null },
  'surface-profile': { label: 'Show as your Space profile', keys: null, needs: null },
  'surface-spotlight': { label: 'Show as your Spotlight', keys: null, needs: null },
  'surface-email': { label: 'Show as an email', keys: null, needs: null },
  'rail-left': { label: 'Open or close the outline', keys: null, needs: null },
  'rail-right': { label: 'Open or close the settings', keys: null, needs: null },
  'pin-left': { label: 'Keep the outline open', keys: null, needs: null },
  'pin-right': { label: 'Keep the settings open', keys: null, needs: null },
  'section-up': { label: 'Move this section up', keys: '⌥↑', needs: 'section' },
  'section-down': { label: 'Move this section down', keys: '⌥↓', needs: 'section' },
  'section-copy': { label: 'Duplicate this section', keys: null, needs: 'section' },
  'section-hide': { label: 'Hide or show this section on this device', keys: null, needs: 'section' },
  'section-delete': { label: 'Delete this section', keys: null, needs: 'section' },
} as const

export type BuilderActionId = keyof typeof BUILDER_ACTIONS

export interface CommandRow {
  id: string
  group: 'Go to' | 'Do' | 'Ask Vera'
  label: string
  keys: string | null
}

interface CommandContext {
  sections: { id: string; name: string; title: string }[]
  pages: { slug: string; label: string }[]
  /** Whether a section is selected: section actions only show when there is one. */
  selected: boolean
  recent: string[]
  query: string
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** The rows the command bar shows for a query: Go to, Do and Ask Vera, recent ones first in each group. */
export function commandRows({ sections, pages, selected, recent, query }: CommandContext): CommandRow[] {
  const q = norm(query)
  const go: CommandRow[] = [
    ...sections.map((s) => ({ id: `go-section:${s.id}`, group: 'Go to' as const, label: s.title ? `${s.name}: ${s.title}` : s.name, keys: null })),
    ...pages.map((p) => ({ id: `go-page:${p.slug}`, group: 'Go to' as const, label: `Page: ${p.label}`, keys: null })),
  ]
  const doRows: CommandRow[] = (Object.keys(BUILDER_ACTIONS) as BuilderActionId[])
    .filter((id) => BUILDER_ACTIONS[id].needs !== 'section' || selected)
    .map((id) => ({ id: `do:${id}`, group: 'Do' as const, label: BUILDER_ACTIONS[id].label, keys: BUILDER_ACTIONS[id].keys }))
  const ask: CommandRow[] = q ? [{ id: 'ask', group: 'Ask Vera', label: `Ask Vera: “${query.trim()}”`, keys: null }] : []
  const match = (r: CommandRow) => !q || norm(r.label).includes(q)
  const rank = (r: CommandRow) => { const i = recent.indexOf(r.id); return i < 0 ? Infinity : i }
  const sorted = (rows: CommandRow[]) => rows.filter(match).map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map(({ r }) => r)
  return [...sorted(go), ...sorted(doRows), ...ask]
}

/** Put a command at the front of the recent list (kept to ten). */
export function rememberCommand(recent: string[], id: string): string[] {
  return [id, ...recent.filter((r) => r !== id)].slice(0, 10)
}
