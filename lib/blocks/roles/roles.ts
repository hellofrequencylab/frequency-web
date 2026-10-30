import hero from './hero.role.json'
import steps from './steps.role.json'
import offerings from './offerings.role.json'
import gatherings from './gatherings.role.json'
import membership from './membership.role.json'
import proof from './proof.role.json'
import faq from './faq.role.json'
import cta from './cta.role.json'
import statement from './statement.role.json'
import letter from './letter.role.json'
import contact from './contact.role.json'
import stats from './stats.role.json'
import shop from './shop.role.json'
import library from './library.role.json'
import people from './people.role.json'
import gallery from './gallery.role.json'
import chapters from './chapters.role.json'

// THE ROLE REGISTRY (docs/THEME-COHESION.md section 2, ADR-1923, LIVE-1858, LIVE-1859: seventeen roles). One *.role.json per role is the whole
// contract: the slots a role takes, the structural variants, the parts a theme's presentation may target, the core
// tokens it reads and the sample that fills a fresh block. The editor fields, the renderer's variant list and the
// tests all read these files, so there is nowhere else a role can drift. A theme never names a role block: it supplies
// a presentation (tokens plus decoration) and a default variant, and the same markup wears all of them.

export type RoleId = 'hero' | 'steps' | 'offerings' | 'gatherings' | 'membership' | 'proof' | 'faq' | 'cta'
  | 'statement' | 'letter' | 'contact' | 'stats' | 'shop' | 'library' | 'people' | 'gallery' | 'chapters'

interface RoleVariant {
  label: string
  min?: number
  max?: number
  /** Slots the variant cannot draw without. */
  needs?: string[]
}

interface RoleDefinition {
  role: string
  /** The block type registered in the page editor. */
  type: string
  label: string
  /** Legacy block types this role stands in for (read by the legacy resolver, LIVE-1860). */
  replaces: string[]
  slots: { required: Record<string, unknown>; optional: Record<string, unknown> }
  variants: Record<string, RoleVariant>
  default: string
  /** The Space rows a live role reads when its block asks for them: events or faqs. */
  data: 'events' | 'faqs' | null
  /** Core token names (without the dashes) the role's structure reads. */
  tokens: string[]
  /** The `data-part` hooks the markup exposes and a presentation may target. */
  parts: string[]
  /** Placeholder words for a fresh block. `sample: true` marks them as not the owner's. */
  sample: Record<string, unknown> & { sample: true }
}

export const ROLES: Readonly<Record<RoleId, RoleDefinition>> = {
  hero: hero as RoleDefinition,
  steps: steps as RoleDefinition,
  offerings: offerings as RoleDefinition,
  gatherings: gatherings as RoleDefinition,
  membership: membership as RoleDefinition,
  proof: proof as RoleDefinition,
  faq: faq as RoleDefinition,
  cta: cta as RoleDefinition,
  statement: statement as RoleDefinition,
  letter: letter as RoleDefinition,
  contact: contact as RoleDefinition,
  stats: stats as RoleDefinition,
  shop: shop as RoleDefinition,
  library: library as RoleDefinition,
  people: people as RoleDefinition,
  gallery: gallery as RoleDefinition,
  chapters: chapters as RoleDefinition,
}

export const ROLE_IDS = Object.keys(ROLES) as RoleId[]

/** The variant a block draws: the owner's pick when it is one this role has, else the theme's default for the role
 *  (LIVE-1861, components/sites/presentation) when it is one this role has, else the role's own default. */
export function roleVariant(role: RoleId, picked: unknown, themeDefault?: string): string {
  const def = ROLES[role]
  if (typeof picked === 'string' && picked in def.variants) return picked
  return themeDefault && themeDefault in def.variants ? themeDefault : def.default
}
