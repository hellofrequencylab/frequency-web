// The catalog of assignable page-LAYOUT modules (ADR-270, the module-assignment engine).
// METADATA ONLY — kept free of the React components (those live in registry.tsx) so the
// editor, the actions, and the resolver can import this without pulling server components.
// Adding a module = add a meta entry here + bind its component in registry.tsx.

export interface LayoutModuleMeta {
  id: string
  label: string
  description: string
}

export const LAYOUT_MODULES: readonly LayoutModuleMeta[] = [
  { id: 'community-pulse', label: 'Community pulse', description: 'Member and active-circle counts at a glance.' },
  { id: 'newest-members', label: 'Newest members', description: 'The latest people to join.' },
  { id: 'popular-channels', label: 'Channels', description: 'The public channels to tune into.' },
  { id: 'top-circles', label: 'Active circles', description: 'Circles filling up across the community.' },
] as const

export const LAYOUT_MODULE_IDS: readonly string[] = LAYOUT_MODULES.map((m) => m.id)

export function moduleMeta(id: string): LayoutModuleMeta | undefined {
  return LAYOUT_MODULES.find((m) => m.id === id)
}
