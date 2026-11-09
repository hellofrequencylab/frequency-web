import type { FqEditorIconName, FqIconName } from '@/components/frequency/icon'
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
import firstvisit from './firstvisit.role.json'
import booking from './booking.role.json'
import locations from './locations.role.json'
import business from './business.role.json'
import story from './story.role.json'

// THE ROLE REGISTRY (docs/THEME-COHESION.md section 2, ADR-1923, LIVE-1858, LIVE-1859: seventeen roles). One *.role.json per role is the whole
// contract: the slots a role takes, the structural variants, the parts a theme's presentation may target, the core
// tokens it reads and the sample that fills a fresh block. The editor fields, the renderer's variant list and the
// tests all read these files, so there is nowhere else a role can drift. A theme never names a role block: it supplies
// a presentation (tokens plus decoration) and a default variant, and the same markup wears all of them.

export type RoleId = 'hero' | 'steps' | 'offerings' | 'gatherings' | 'membership' | 'proof' | 'faq' | 'cta'
  | 'statement' | 'letter' | 'contact' | 'stats' | 'shop' | 'library' | 'people' | 'gallery' | 'chapters'
  | 'firstvisit' | 'booking' | 'locations' | 'business' | 'story'

/** The Add-a-section headings (docs/design/frequency-builder-v3/block-editor-spec.md §6), in the order the sheet draws them. */
export const ROLE_GROUPS = ['Welcome', 'Show up', 'Trust', 'Answer', 'More'] as const
type RoleGroup = (typeof ROLE_GROUPS)[number]

/** The layout sketches a variant chip or an Add card draws (64×48, BLD-202, BLD-203). Several variants share one sketch. */
export const ROLE_THUMBS = ['split', 'full', 'center', 'glow', 'minimal', 'band', 'card', 'inline', 'grid', 'cards', 'list', 'rows',
  'agenda', 'timeline', 'strip', 'stack', 'mosaic', 'carousel', 'quote', 'wall', 'figures', 'tiers', 'table', 'spotlight', 'profile',
  'map', 'timetable', 'board', 'pull', 'ticker', 'thread', 'rail', 'featured', 'bar'] as const
type RoleThumb = (typeof ROLE_THUMBS)[number]

interface RoleVariant {
  label: string
  /** The layout sketch for this variant's chip. */
  thumb: RoleThumb
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
  /** What the section does, in the owner's words: the builder's name for it ("Say who you are"). */
  intent: string
  /** One line under the intent on its Add card: what the section is for. */
  why: string
  /** The Add-a-section heading it sits under. */
  group: RoleGroup
  /** A glyph in the Frequency sprite or the editor sprite (check:roles proves it resolves). */
  icon: FqIconName | FqEditorIconName
  /** Draws the Space's own rows on a live page (BLD-213) when the block asks for them. */
  live: boolean
  /** Legacy block types this role stands in for (read by the legacy resolver, LIVE-1860). */
  replaces: string[]
  /** Slot specs stay strings or list objects (lib/builder/tune.ts reads them); `labels` names every slot for the owner. */
  slots: { required: Record<string, unknown>; optional: Record<string, unknown>; labels: Record<string, { label: string; hint: string }> }
  variants: Record<string, RoleVariant>
  default: string
  /** The Space rows a live role reads when its block asks for them: events or faqs. */
  data: 'events' | 'faqs' | null
  /** Where the role must appear (BLD-215): drawn on the site and the profile, a door on Spotlight, and in email either drawn,
   *  hidden (no email form of it) or frozen (the rows at send are fixed, never live). */
  surfaces: { site: 'draw'; profile: 'draw'; spotlight: 'door'; email: 'draw' | 'hide' | 'freeze' }
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
  firstvisit: firstvisit as RoleDefinition,
  booking: booking as RoleDefinition,
  locations: locations as RoleDefinition,
  business: business as RoleDefinition,
  story: story as RoleDefinition,
}

export const ROLE_IDS = Object.keys(ROLES) as RoleId[]

const ROLE_BY_TYPE = new Map<string, RoleId>(ROLE_IDS.map((r) => [ROLES[r].type, r]))
/** The role a registered block type stands for, or null for a legacy type. */
export const roleOfType = (type: string): RoleId | null => ROLE_BY_TYPE.get(type) ?? null

/** The variant a block draws: the owner's pick when it is one this role has, else the theme's default for the role
 *  (LIVE-1861, components/sites/presentation) when it is one this role has, else the role's own default. */
export function roleVariant(role: RoleId, picked: unknown, themeDefault?: string): string {
  const def = ROLES[role]
  if (typeof picked === 'string' && picked in def.variants) return picked
  return themeDefault && themeDefault in def.variants ? themeDefault : def.default
}
