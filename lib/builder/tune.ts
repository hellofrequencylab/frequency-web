import { ROLES, roleOfType, type RoleId } from '@/lib/blocks/roles/roles'
import type { Config, Field } from '@/lib/page-editor/types'

// THE TUNE RAIL'S PROJECTION (BLD-105; spec docs/EDITOR-NEXT.md#bld-105). The settings panel is generated, never
// written per block: this module turns a block type into two layers of fields and the panel draws whatever it
// gets, so no component file names a block type.
//   Layer 1, the words and pictures: for a role block, its role.json slots, required first, then optional, with
//   the slot limits (characters, list counts). For any other block, its text, list and picture fields in order.
//   Layer 2, More: every remaining field (variant, tone, look, live data on or off), behind "More".
// Every field the block declares lands in exactly one layer, except the layout object the per-device controls own.

type TuneKind = 'text' | 'textarea' | 'list' | 'custom' | 'choice' | 'number'

export interface TuneField {
  key: string
  label: string
  kind: TuneKind
  field: Field
  required?: boolean
  /** Character limit from the slot, like text<=120. */
  limit?: number
  /** List counts from the slot (or the field). */
  min?: number
  max?: number
}

interface TuneProjection {
  role: RoleId | null
  layer1: TuneField[]
  layer2: TuneField[]
}

/** Slot names the role contract uses where the block field carries another name. */
const SLOT_ALIASES: Record<string, string[]> = { heading: ['title'], body: ['lead'] }

const OWNED_ELSEWHERE = new Set(['layout'])
/** A role block's layout is picked with the Layout chips (BLD-203, components/builder/canvas/variants), not a select. */
const OWNED_BY_CHIPS = new Set(['variant'])
const ownedElsewhere = (key: string, role: RoleId | null) => OWNED_ELSEWHERE.has(key) || (!!role && OWNED_BY_CHIPS.has(key))

function kindOf(field: Field): TuneKind | null {
  switch (field.type) {
    case 'text': return 'text'
    case 'textarea': return 'textarea'
    case 'array': return 'list'
    case 'custom': return 'custom'
    case 'select': case 'radio': return 'choice'
    case 'number': return 'number'
    default: return null
  }
}

const LIMIT = /<=(\d+)/

function entry(key: string, field: Field, extra: Partial<TuneField> = {}): TuneField | null {
  const kind = kindOf(field)
  if (!kind) return null
  const counts = field.type === 'array' ? { min: field.min, max: field.max } : {}
  return { key, label: field.label ?? key, kind, field, ...counts, ...extra }
}

/** The block field keys a role slot is drawn by. */
function slotKeys(slot: string, spec: unknown, fields: Record<string, Field>): string[] {
  if (spec === 'link') return [`${slot}Label`, `${slot}Href`].filter((k) => k in fields)
  if (slot in fields) return [slot]
  return (SLOT_ALIASES[slot] ?? []).filter((k) => k in fields)
}

function slotExtra(spec: unknown, required: boolean): Partial<TuneField> {
  if (typeof spec === 'string') {
    const limit = spec.match(LIMIT)
    return { required, ...(limit ? { limit: Number(limit[1]) } : {}) }
  }
  const list = spec as { min?: number; max?: number } | null
  return { required, ...(list && typeof list === 'object' ? { min: list.min, max: list.max } : {}) }
}

export function tuneProjection(type: string, config: Config): TuneProjection {
  const fields = ((config.components as Record<string, { fields?: Record<string, Field> }>)[type]?.fields ?? {}) as Record<string, Field>
  const role = roleOfType(type)
  const layer1: TuneField[] = []
  const taken = new Set<string>()
  const take = (key: string, extra: Partial<TuneField>) => {
    if (taken.has(key) || ownedElsewhere(key, role) || !fields[key]) return
    const e = entry(key, fields[key], extra)
    if (e) { layer1.push(e); taken.add(key) }
  }
  if (role) {
    const { required, optional } = ROLES[role].slots
    for (const [slot, spec] of Object.entries(required)) for (const key of slotKeys(slot, spec, fields)) take(key, slotExtra(spec, true))
    for (const [slot, spec] of Object.entries(optional)) for (const key of slotKeys(slot, spec, fields)) take(key, slotExtra(spec, false))
  } else {
    for (const [key, field] of Object.entries(fields)) if (['text', 'textarea', 'array', 'custom'].includes(field.type)) take(key, {})
  }
  const layer2: TuneField[] = []
  for (const [key, field] of Object.entries(fields)) {
    if (taken.has(key) || ownedElsewhere(key, role)) continue
    const e = entry(key, field)
    if (e) layer2.push(e)
  }
  return { role, layer1, layer2 }
}

/** The fields a block declares that the Tune rail must draw: all of them but the ones owned elsewhere. */
export function tuneDeclared(type: string, config: Config): string[] {
  const fields = ((config.components as Record<string, { fields?: Record<string, Field> }>)[type]?.fields ?? {}) as Record<string, Field>
  const role = roleOfType(type)
  return Object.entries(fields).filter(([key, f]) => !ownedElsewhere(key, role) && kindOf(f)).map(([key]) => key)
}
