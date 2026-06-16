// The catalog of interior-container TEMPLATES (ADR-272). A template names the AREAS (slots) a
// layout module can be assigned to; the per-route layout (page_settings.layout) picks a template
// and assigns modules to its slots. METADATA ONLY (no React) so the editor, the actions, and the
// pure resolver can import it without pulling the grid components (those live in the renderer).
// Adding a template = one entry here + a grid case in components/widgets/page-modules.tsx.

export type TemplateId = 'single' | 'main-side' | 'two-col' | 'three-col' | 'header-side' | 'header-two-col'

export interface TemplateSlot {
  id: string
  label: string
}

export interface TemplateMeta {
  id: TemplateId
  label: string
  description: string
  /** Slots in render order; the FIRST is the default slot for any unplaced module. */
  slots: readonly TemplateSlot[]
}

export const TEMPLATES: readonly TemplateMeta[] = [
  {
    id: 'single',
    label: 'Single column',
    description: 'One stacked column.',
    slots: [{ id: 'main', label: 'Main' }],
  },
  {
    id: 'main-side',
    label: 'Main + side',
    description: 'A wide main column and a narrower side column.',
    slots: [
      { id: 'main', label: 'Main' },
      { id: 'side', label: 'Side' },
    ],
  },
  {
    id: 'two-col',
    label: '2 columns',
    description: 'A full-width area above two equal columns.',
    slots: [
      { id: 'top', label: 'Top' },
      { id: 'col-1', label: 'Column 1' },
      { id: 'col-2', label: 'Column 2' },
    ],
  },
  {
    id: 'three-col',
    label: '3 columns',
    description: 'A full-width area above three equal columns.',
    slots: [
      { id: 'top', label: 'Top' },
      { id: 'col-1', label: 'Column 1' },
      { id: 'col-2', label: 'Column 2' },
      { id: 'col-3', label: 'Column 3' },
    ],
  },
  {
    id: 'header-side',
    label: 'Header + sidebar',
    description: 'A full-width header over a wide main column and a narrower side column.',
    slots: [
      { id: 'header', label: 'Header' },
      { id: 'main', label: 'Main' },
      { id: 'side', label: 'Side' },
    ],
  },
  {
    id: 'header-two-col',
    label: 'Header + 2 columns',
    description: 'A full-width header over two equal columns.',
    slots: [
      { id: 'header', label: 'Header' },
      { id: 'col-1', label: 'Column 1' },
      { id: 'col-2', label: 'Column 2' },
    ],
  },
] as const

export const DEFAULT_TEMPLATE: TemplateId = 'single'

export function isTemplateId(v: unknown): v is TemplateId {
  return (
    v === 'single' ||
    v === 'main-side' ||
    v === 'two-col' ||
    v === 'three-col' ||
    v === 'header-side' ||
    v === 'header-two-col'
  )
}

export function templateMeta(id: TemplateId): TemplateMeta {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]
}

/** The slot ids of a template, in render order. */
export function slotIds(id: TemplateId): string[] {
  return templateMeta(id).slots.map((s) => s.id)
}

/** The slot an unplaced module falls into: the template's first slot. */
export function defaultSlotId(id: TemplateId): string {
  return templateMeta(id).slots[0].id
}
