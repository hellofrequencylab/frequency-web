import { ROLES, roleOfType } from '@/lib/blocks/roles/roles'
import type { BlockDensity } from '@/lib/entity-blocks/define-block'
import { stackClassFor } from '@/lib/entity-blocks/density'
import type { Config, Data } from '@/lib/page-editor/types'

// THE SURFACE SWITCHER (BLD-301; spec docs/EDITOR-NEXT.md#bld-301, move 05 "one edit across surfaces"). The builder
// edits one document and shows it as each of the four surfaces the owner publishes to: the website, the Space profile
// inside Frequency, the Spotlight page and an email. The surface decides two things, both read from contracts that
// already exist, never a second list:
//   • how the canvas frames the page: the surface's declared density (the E3 scale, lib/entity-blocks/density.ts) and
//     the widest it ever draws (an email is 600 wide, the in-app profile sits in the member shell's 840 column);
//   • which sections it can show: a role block says so itself (role.json `surfaces`, BLD-215: draw, door, freeze or
//     hide); a block with no role has no surface but the site until Update to new layouts (BLD-205) moves it.
// Sections the surface cannot show are listed with the reason, never silently dropped: the document keeps them.
// PURE: no React.

export type BuilderSurface = 'site' | 'profile' | 'spotlight' | 'email'

interface SurfaceSpec {
  id: BuilderSurface
  label: string
  /** One line for the switcher's title: what the owner is looking at. */
  says: string
  /** The E3 density this surface paints at (the Spotlight and the site stand alone: roomy; a block column inside the
   *  member shell or an email: compact). */
  density: BlockDensity
  /** The widest the surface ever draws; the device frame narrows it further. */
  maxWidth: number
}

export const BUILDER_SURFACES: readonly SurfaceSpec[] = [
  { id: 'site', label: 'Site', says: 'Your website, as a visitor sees it', density: 'roomy', maxWidth: 1280 },
  { id: 'profile', label: 'Profile', says: 'Your Space inside Frequency, in the member shell', density: 'compact', maxWidth: 840 },
  { id: 'spotlight', label: 'Spotlight', says: 'Your Spotlight page: each section is a door', density: 'roomy', maxWidth: 1200 },
  { id: 'email', label: 'Email', says: 'An email to your people: live rows are fixed at send', density: 'compact', maxWidth: 600 },
]

export const SURFACE_IDS = BUILDER_SURFACES.map((s) => s.id) as readonly BuilderSurface[]

export function surfaceSpec(surface: BuilderSurface): SurfaceSpec {
  return BUILDER_SURFACES.find((s) => s.id === surface) ?? BUILDER_SURFACES[0]
}

/** The canvas frame for a surface on a device: the narrower of the two widths, the surface's density and its stack class. */
export function surfaceFrame(surface: BuilderSurface, deviceWidth: number): { width: number; density: BlockDensity; stackClass: string } {
  const spec = surfaceSpec(surface)
  return { width: Math.min(deviceWidth, spec.maxWidth), density: spec.density, stackClass: stackClassFor(spec.density) }
}

/** How a block type appears on a surface: as the role declares, or `legacy` for a block with no role off the site. */
type SurfaceShowing = 'draw' | 'door' | 'freeze' | 'hide' | 'legacy'

export function surfaceShowing(type: string, surface: BuilderSurface): SurfaceShowing {
  const role = roleOfType(type)
  if (role) return ROLES[role].surfaces[surface]
  return surface === 'site' ? 'draw' : 'legacy'
}

interface HiddenOnSurface {
  id: string
  type: string
  /** The block's label, as the outline names it. */
  name: string
  reason: string
}

export interface SurfaceSections {
  /** The sections the surface shows, in page order, exactly as stored. */
  shown: Data['content']
  /** The sections it cannot show, with the reason, in page order. */
  hidden: HiddenOnSurface[]
  /** Sections shown with their rows fixed at send (email) or as a door (Spotlight): a note, not a hide. */
  notes: { id: string; note: string }[]
}

const nameOf = (config: Config, type: string) => (config.components as Record<string, { label?: string }>)[type]?.label ?? type

/** Split a page by what the surface can show. The hidden list equals the blocks without that surface: a role whose
 *  role.json hides it there, or a block with no role anywhere but the site. */
export function surfaceSections(doc: Data, config: Config, surface: BuilderSurface): SurfaceSections {
  const spec = surfaceSpec(surface)
  const out: SurfaceSections = { shown: [], hidden: [], notes: [] }
  for (const section of doc.content) {
    const id = String(section.props?.id ?? '')
    const name = nameOf(config, section.type)
    switch (surfaceShowing(section.type, surface)) {
      case 'hide':
        out.hidden.push({ id, type: section.type, name, reason: `${name} has no ${spec.label.toLowerCase()} form. It stays on your site.` })
        break
      case 'legacy':
        out.hidden.push({ id, type: section.type, name, reason: `${name} is a site-only section. Update to new layouts gives it a role that shows here too.` })
        break
      case 'freeze':
        out.shown.push(section)
        out.notes.push({ id, note: `${name}: the rows are fixed when the email is sent.` })
        break
      case 'door':
        out.shown.push(section)
        out.notes.push({ id, note: `${name}: a door on Spotlight. It opens the full section.` })
        break
      default:
        out.shown.push(section)
    }
  }
  return out
}

/** The ids a surface cannot show, for a quick equality with "blocks without that surface". */
export function hiddenOnSurface(doc: Data, config: Config, surface: BuilderSurface): string[] {
  return surfaceSections(doc, config, surface).hidden.map((h) => h.id)
}
