// Shared layout controls for every Puck block: vertical spacing (margins /
// buffers) and responsive visibility. Token-based selects only — no raw pixels —
// so the editor can't break responsiveness or go off-scale. These compile to a
// handful of Tailwind classes, so they add ~nothing to the public bundle.

const TOP: Record<string, string> = {
  none: 'pt-0',
  xs: 'pt-6 sm:pt-8',
  sm: 'pt-10 sm:pt-12',
  md: 'pt-16 sm:pt-20',
  lg: 'pt-24 sm:pt-28',
  xl: 'pt-32 sm:pt-40',
}

const BOT: Record<string, string> = {
  none: 'pb-0',
  xs: 'pb-6 sm:pb-8',
  sm: 'pb-10 sm:pb-12',
  md: 'pb-16 sm:pb-20',
  lg: 'pb-24 sm:pb-28',
  xl: 'pb-32 sm:pb-40',
}

const VIS: Record<string, string> = {
  all: '',
  desktop: 'hidden md:block',
  mobile: 'md:hidden',
}

const spaceField = {
  type: 'select' as const,
  options: [
    { label: 'Default', value: 'default' },
    { label: 'None', value: 'none' },
    { label: 'Extra small', value: 'xs' },
    { label: 'Small', value: 'sm' },
    { label: 'Medium', value: 'md' },
    { label: 'Large', value: 'lg' },
    { label: 'Extra large', value: 'xl' },
  ],
}

// Spread into a block's `fields`. Grouped under an "object" field so the controls
// collapse into one tidy "Layout" section in the editor instead of cluttering
// every block with three top-level fields.
export const layoutField = {
  type: 'object' as const,
  label: 'Layout',
  objectFields: {
    spaceTop: { ...spaceField, label: 'Space above' },
    spaceBottom: { ...spaceField, label: 'Space below' },
    visibility: {
      type: 'select' as const,
      label: 'Show on',
      options: [
        { label: 'Everywhere', value: 'all' },
        { label: 'Desktop only', value: 'desktop' },
        { label: 'Mobile only', value: 'mobile' },
      ],
    },
  },
}

export type LayoutValue = {
  spaceTop?: string
  spaceBottom?: string
  visibility?: string
}

export const layoutDefault: LayoutValue = {
  spaceTop: 'default',
  spaceBottom: 'default',
  visibility: 'all',
}

// Vertical-padding override. Returns undefined when both sides are "default" so
// the block keeps its own built-in padding (no visual change to seeded pages).
// When either side is overridden, both sides become explicit (a "default" side
// falls back to the standard medium pad), so there's no Tailwind specificity war
// with the block's own responsive py.
export function padClass(layout?: LayoutValue): string | undefined {
  const top = layout?.spaceTop ?? 'default'
  const bottom = layout?.spaceBottom ?? 'default'
  if (top === 'default' && bottom === 'default') return undefined
  const t = TOP[top === 'default' ? 'md' : top] ?? ''
  const b = BOT[bottom === 'default' ? 'md' : bottom] ?? ''
  return `${t} ${b}`.trim()
}

export function visClass(layout?: LayoutValue): string {
  return VIS[layout?.visibility ?? 'all'] ?? ''
}
