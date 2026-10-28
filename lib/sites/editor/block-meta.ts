import type { Config } from '@/lib/page-editor/types'
import type { FqEditorIconName, FqIconName } from '@/components/frequency/icon'

// HOW THE FREQUENCY PAGE EDITOR PRESENTS A BLOCK (design_handoff/frequency/templates/admin/editor/editor.js,
// `TYPES`). The design keys each block to an icon, one of four Add-tab groups (Sections, Content, Live,
// Media) and a "live" flag (it pulls Space data). Our block registry is lib/page-editor/config.tsx, so this
// is NOT a second registry: it reads the registry's own category for each type and derives the design's
// presentation from it, so a new block that joins a registry category is presented with no edit here.
// PURE: no React, no editor state.

type EditorBlockGroup = 'Sections' | 'Content' | 'Live' | 'Media'
const EDITOR_BLOCK_GROUPS: readonly EditorBlockGroup[] = ['Sections', 'Content', 'Live', 'Media']

/** The design's suggestion sets (editor.js `SUG`) are keyed by these kinds; `_` is the general set. */
type EditorBlockKind = 'Hero' | 'About' | 'FAQ' | 'CTA' | '_'

interface EditorBlockMeta {
  icon: FqIconName | FqEditorIconName
  group: EditorBlockGroup
  /** Reads the Space's own data (events, people, plans, numbers, answers) at render time. */
  live: boolean
  kind: EditorBlockKind
}

/** Registry category → the design's Add-tab group. */
const GROUP_OF_CATEGORY: Record<string, EditorBlockGroup> = {
  sections: 'Sections', blocks: 'Sections', productStory: 'Sections',
  content: 'Content', layout: 'Content', profile: 'Content', linkTree: 'Content',
  dynamic: 'Live', spaceContent: 'Live', wildheart: 'Live', circles: 'Live', midnight: 'Sections', designer: 'Sections', networkKit: 'Sections',
  media: 'Media',
}

/** Blocks whose rows come from the Space at render time (the design's `live: 1`). */
const LIVE = /^(Live\w+|SpaceEvents|SpaceCommunity|SpaceTeam|SpaceStats|SpaceOfferings|SpaceReviews|SpaceFAQ|SpacePractices|SpaceBooking|CirclesGrid|CirclesFeatured|CirclesMap|Network(Hero|Events|Circles)|NetworkKit(Hero|Live|Journeys|Gatherings|Proof|FAQ)|Midnight(Live|Journeys|Gatherings|Proof|FAQ)|Designer(FAQ)|Wildheart(YearJourney|SkyMap|NowLine|MoonPath|Modules|FirstNight|MoonStrip))$/

/** Type-name patterns → the design's icon for the same kind of block, first match wins. */
const ICONS: [RegExp, FqIconName | FqEditorIconName][] = [
  [/Hero|Cover|IdentityHeader/, 'photo'],
  [/Event|Calendar|Year|Season|Timeline|NowLine|FirstNight/, 'event'],
  [/Moon|Sky/, 'moon'],
  [/Community|NetworkCircles|Team|Host|Roles?Pick|RolesPath/, 'host'],
  [/Gallery|Photo|Image|Media|Marquee|Showcase/, 'camera'],
  [/Tier|Plan|Membership|Offering|Booking|Pricing/, 'membership'],
  [/Stat/, 'chart'],
  [/FAQ|Accordion/, 'help'],
  [/CTA|CallToAction|Action|Buttons|LeadFunnel/, 'arrow'],
  [/Quote|Review|Posts/, 'message'],
  [/Contact|Map/, 'pin'],
  [/Container|Columns|Spacer|Divider|Layout/, 'layers'],
]
const GROUP_ICON: Record<EditorBlockGroup, FqIconName | FqEditorIconName> = { Sections: 'layers', Content: 'page', Live: 'event', Media: 'photo' }

function categoryOf(config: Config, type: string): string | null {
  for (const [key, category] of Object.entries(config.categories ?? {})) if (category.components?.includes(type)) return key
  return null
}

/** The design's presentation of a registry block type. */
export function editorBlockMeta(config: Config, type: string): EditorBlockMeta {
  const live = LIVE.test(type)
  const category = categoryOf(config, type)
  const group: EditorBlockGroup = live ? 'Live' : (category && GROUP_OF_CATEGORY[category]) || 'Sections'
  const icon = ICONS.find(([pattern]) => pattern.test(type))?.[1] ?? GROUP_ICON[group]
  const kind: EditorBlockKind = /Hero|Cover|IdentityHeader/.test(type) ? 'Hero'
    : /FAQ|Accordion/.test(type) ? 'FAQ'
    : /CTA|CallToAction|Action/.test(type) ? 'CTA'
    : /About|Text|Statement|Prose|Callout|Story|Manifesto|MediaText|Zigzag|Editorial/.test(type) ? 'About'
    : '_'
  return { icon, group, live, kind }
}

/** The registry's picker groups (derivePickerGroups) regrouped under the design's four Add-tab headings,
 *  keeping each item's order, disabled state and reason. Empty groups drop out. */
export function editorPickerGroups<T extends { type: string }>(config: Config, groups: { items: T[] }[]): { key: EditorBlockGroup; title: EditorBlockGroup; items: T[] }[] {
  const out = new Map<EditorBlockGroup, T[]>(EDITOR_BLOCK_GROUPS.map((group) => [group, []]))
  const seen = new Set<string>()
  for (const group of groups) for (const item of group.items) {
    if (seen.has(item.type)) continue
    seen.add(item.type)
    out.get(editorBlockMeta(config, item.type).group)!.push(item)
  }
  return EDITOR_BLOCK_GROUPS.filter((group) => out.get(group)!.length > 0).map((group) => ({ key: group, title: group, items: out.get(group)! }))
}

/** Vera's suggestion chips per kind (editor.js `SUG`), kept to the ones the assistant can actually do: it
 *  rewrites one text field of the selected section. Photo swaps and new facts are left out. `field` names the
 *  props the chip prefers, in order; the shell falls back to the section's main text. */
export interface VeraSuggestion { label: string; prompt: string; fields: string[] }
const HEADING = ['title', 'headline', 'heading', 'text']
const BODY = ['body', 'lead', 'text', 'description', 'subtitle', 'sub']
const BUTTON = ['ctaLabel', 'cta', 'buttonLabel', 'label']
export const VERA_SUGGESTIONS: Record<EditorBlockKind, VeraSuggestion[]> = {
  Hero: [
    { label: 'Review the headline', prompt: 'Which questions would help me review this headline in my own words?', fields: HEADING },
    { label: 'Review the button', prompt: 'What should I consider before writing my own button label?', fields: BUTTON },
  ],
  About: [
    { label: 'Review length', prompt: 'Help me decide which details to keep in this passage.', fields: BODY },
    { label: 'Review tone', prompt: 'What should I consider about welcoming tone while writing in my own words?', fields: BODY },
  ],
  FAQ: [
    { label: 'Review the heading', prompt: 'Which questions should I consider while writing my own heading for this section?', fields: HEADING },
  ],
  CTA: [
    { label: 'Review the invitation', prompt: 'What would make this invitation clear to its intended reader?', fields: HEADING },
    { label: 'Review the button', prompt: 'What should I consider before writing my own button label?', fields: BUTTON },
  ],
  _: [
    { label: 'Review the heading', prompt: 'Which questions should I consider while writing my own heading for this section?', fields: HEADING },
    { label: 'Review our voice', prompt: 'Which questions would help me check that this sounds like our own voice?', fields: [...BODY, ...HEADING] },
  ],
}
