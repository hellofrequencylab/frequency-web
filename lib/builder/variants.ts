// LAYOUT CHIPS WITH NEEDS AND PINS (BLD-203, docs/EDITOR-NEXT.md#bld-203; spec docs/design/frequency-builder-v3/
// block-editor-spec.md §3 "Edit, section selected"). A role block's layouts are its role.json variants, drawn as chips
// with their sketch (variants[x].thumb, BLD-201). A chip whose `needs` the section cannot meet stays visible and says
// why, with a shortcut to the field that fills it. PURE: no React.
//
// One rule decides the layout a section draws, and it is roleVariant() (lib/blocks/roles/roles.ts): the owner's pick,
// else the theme's default for the role (components/sites/presentation), else the role's own default. Picking a chip is
// the owner's pick, so it PINS the layout (`variant` plus `variantSet: true`) and it stays through a theme switch.
// Unpinning clears both, and the section follows the theme again.

import { ROLES, roleOfType, roleVariant, type RoleId } from '@/lib/blocks/roles/roles'
import { presentationDefault } from '@/components/sites/presentation'

type Props = Record<string, unknown>

interface LayoutChip {
  id: string
  label: string
  thumb: string
  /** The layout the section draws now. */
  current: boolean
  /** The first need this section does not meet: what to say, and the field that fills it. */
  blocked: { need: string; say: string; field: string } | null
}

export interface LayoutChips {
  role: RoleId
  /** The owner picked this layout: it stays through a theme switch. */
  pinned: boolean
  current: string
  /** What the section would draw unpinned on this theme. */
  themeDefault: string
  chips: LayoutChip[]
}

const filled = (v: unknown) => (typeof v === 'string' ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : v === true || (typeof v === 'number' && Number.isFinite(v)))

/** Whether the section's props meet one `needs` entry: a slot with a value, a link with a label and an address, or an
 *  item field that at least one item sets (a tier marked featured, say). */
export function needMet(props: Props, need: string): boolean {
  if (filled(props[need])) return true
  if (filled(props[`${need}Label`]) && filled(props[`${need}Href`])) return true
  const items = props.items
  return Array.isArray(items) && items.some((item) => !!item && typeof item === 'object' && filled((item as Props)[need]))
}

/** Owner words for a missing need. */
function needSay(role: RoleId, need: string): string {
  if (need === 'image' || need === 'photo') return 'needs a photo'
  if (need === 'featured') return 'needs a featured one'
  const label = ROLES[role].slots.labels[need]?.label
  return `needs ${label ? label.toLowerCase() : need}`
}

/** The chips for a block, or null for a block that is not a role (its layout, if any, stays a plain field). */
export function layoutChips(type: string, props: Props, theme: unknown): LayoutChips | null {
  const role = roleOfType(type)
  if (!role) return null
  const def = ROLES[role]
  const themeDefault = roleVariant(role, '', presentationDefault(theme, role))
  const current = roleVariant(role, props.variant, presentationDefault(theme, role))
  const pinned = typeof props.variant === 'string' && props.variant in def.variants
  const chips = Object.entries(def.variants).map(([id, v]) => {
    const missing = (v.needs ?? []).find((need) => !needMet(props, need))
    return {
      id, label: v.label, thumb: v.thumb, current: id === current,
      blocked: missing ? { need: missing, say: needSay(role, missing), field: missing in props || `${missing}Label` in props ? (missing in props ? missing : `${missing}Label`) : 'items' } : null,
    }
  })
  return { role, pinned, current, themeDefault, chips }
}

/** Picking a chip pins it. */
export const pinLayout = (id: string): Props => ({ variant: id, variantSet: true })
/** Unpinning hands the layout back to the theme (roleVariant falls through to the theme's default). */
export const unpinLayout = (): Props => ({ variant: '', variantSet: false })
