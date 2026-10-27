// THE SPACE PICKER (ADR-1883). Four short questions at Space creation that choose a starting point: what
// the owner is building (niche), the one thing they want people to do, a feel (theme), and an optional
// existing site to borrow from. Tap, do not type: the only typed answer is the link.
//
// PURE and client-safe, as lib/spaces/create-wizard.ts. The questions are DATA here and the resolver turns
// raw answers into the four stored values (lib/theme/mega-theme.ts, `preferences.megaTheme`). It trusts
// nothing: an unknown niche, an action the niche does not offer, a theme that is not live yet, or a link that
// is not https reads as "no answer", never as an error, so a stale link or a hostile query cannot break
// Space creation. A niche that arrives from a /for door answers question one before it is asked.
//
// Copy follows docs/marketing/voice-and-language-guide.md. Each niche's card, action and button wording
// lives in this one table, so a new niche is one row.

import {
  cleanSourceUrl,
  isMegaActionId,
  isMegaNicheId,
  isMegaThemeId,
  type MegaActionId,
  type MegaNicheId,
  type MegaThemeId,
} from '@/lib/theme/mega-theme'

interface PickerNiche {
  id: MegaNicheId
  label: string
  hint: string
  /** What this niche's owners most often want people to do, the first one being the default. */
  actions: readonly MegaActionId[]
}

export const PICKER_NICHES: readonly PickerNiche[] = [
  { id: 'coaches', label: 'Coaching or healing', hint: 'One to one work, programs, a way to book', actions: ['book', 'list', 'ask'] },
  { id: 'studios', label: 'A studio or gym', hint: 'Classes on a schedule and memberships', actions: ['try', 'join', 'book'] },
  { id: 'hosts', label: 'Events', hint: 'Gatherings, workshops, ticketed nights', actions: ['tickets', 'list', 'ask'] },
  { id: 'venues', label: 'A venue', hint: 'A room other people fill', actions: ['tour', 'ask', 'book'] },
  { id: 'nonprofits', label: 'A nonprofit', hint: 'A mission, programs and a fund', actions: ['donate', 'join', 'list'] },
  { id: 'networks', label: 'A network', hint: 'Many chapters under one name', actions: ['chapter', 'list', 'ask'] },
  { id: 'general', label: 'A local business', hint: 'A cafe, shop or service with things on', actions: ['ask', 'list', 'book'] },
  { id: 'creators', label: 'Art, music or making', hint: 'Your work, your shows and your list', actions: ['list', 'tickets', 'ask'] },
  { id: 'schools', label: 'A school or program', hint: 'Workshops, courses, camps and training', actions: ['book', 'list', 'ask'] },
  { id: 'clubs', label: 'A club or group', hint: 'Regular meetups and members who pay dues', actions: ['join', 'list', 'ask'] },
  { id: 'faith', label: 'A faith community', hint: 'Weekly gatherings, small groups and giving', actions: ['join', 'donate', 'list'] },
  { id: 'wellness', label: 'A spa or retreat center', hint: 'Treatments, packages and retreats', actions: ['book', 'list', 'ask'] },
  { id: 'markets', label: 'A market or festival', hint: 'Market days, vendors and visitors', actions: ['list', 'ask', 'tickets'] },
]

/** Shown for "Something else": no niche, so no starting tools, and a general set of actions. */
const GENERAL_ACTIONS: readonly MegaActionId[] = ['book', 'ask', 'list']

export const PICKER_ACTION_LABEL: Record<MegaActionId, string> = {
  book: 'Book a call or session',
  try: 'Try a class',
  tickets: 'Get tickets',
  tour: 'Request a tour',
  donate: 'Donate',
  chapter: 'Find a chapter',
  join: 'Become a member',
  list: 'Join my list',
  ask: 'Send me a message',
}

/** The feels, in the order shown. Each points at the theme it wears. `live` is the one switch: a feel whose
 *  theme package is not installed yet shows as coming soon and cannot be chosen. Every theme with starter kits is live. */
export const PICKER_FEELS: readonly { id: string; label: string; hint: string; theme: MegaThemeId; live: boolean }[] = [
  { id: 'night', label: 'After dark', hint: 'True black, bone type, square frames', theme: 'midnight', live: true },
  { id: 'warm', label: 'Warm and open', hint: 'Bright, soft and welcoming', theme: 'frequency', live: true },
  { id: 'bold', label: 'Strong and direct', hint: 'Big type and a firm voice', theme: 'bold', live: true },
  { id: 'calm', label: 'Calm and ceremonial', hint: 'Gold, stone and room to breathe', theme: 'temple', live: true },
  { id: 'wild', label: 'Earthy and alive', hint: 'Moon phases, ornament and hand-made warmth', theme: 'wildheart', live: true },
  { id: 'network', label: 'Clear and organised', hint: 'Many chapters, one steady voice', theme: 'network', live: true },
]

/** The questions, in the voice guide's words. */
export const PICKER_COPY = {
  niche: { title: "Let's skip the blank page. What are you building?", other: 'Something else' },
  action: { title: 'Tired of chasing people down? Pick the one thing you want them to do.' },
  feel: { title: 'Pick a feel. You can change it anytime.', soon: 'Coming soon' },
  site: { title: "Already have a site? Drop the link and we'll borrow the good stuff.", placeholder: 'yourname.com' },
} as const

interface PickerAnswers {
  niche?: unknown
  action?: unknown
  /** A PICKER_FEELS id. */
  feel?: unknown
  site?: unknown
}

interface PickerResult {
  niche: MegaNicheId | null
  action: MegaActionId | null
  theme: MegaThemeId | null
  sourceUrl: string | null
}

/** The actions a niche offers (or the general set), in order. */
export function actionsForNiche(niche: MegaNicheId | null): readonly MegaActionId[] {
  return PICKER_NICHES.find((n) => n.id === niche)?.actions ?? GENERAL_ACTIONS
}

/** Which questions to ask. A niche that already arrived from a door skips question one. */
export function pickerQuestions(arrivedNiche: MegaNicheId | null): ('niche' | 'action' | 'feel' | 'site')[] {
  return arrivedNiche ? ['action', 'feel', 'site'] : ['niche', 'action', 'feel', 'site']
}

/** Read a niche from a door's hint (a query value or the funnel cookie). Total. */
export function nicheFromHint(raw: string | string[] | null | undefined): MegaNicheId | null {
  const one = Array.isArray(raw) ? raw[0] : raw
  return isMegaNicheId(one) ? one : null
}

/** Turn raw answers into the stored values. An answer that is not valid reads as no answer. The action must be
 *  one the niche offers, the feel must be live, and the link must be https. PURE and total. */
export function resolvePicker(answers: PickerAnswers, arrivedNiche: MegaNicheId | null = null): PickerResult {
  const niche = arrivedNiche ?? (isMegaNicheId(answers.niche) ? answers.niche : null)
  const action = isMegaActionId(answers.action) && actionsForNiche(niche).includes(answers.action) ? answers.action : null
  const feel = PICKER_FEELS.find((f) => f.id === answers.feel && f.live)
  const theme = feel && isMegaThemeId(feel.theme) ? feel.theme : null
  return { niche, action, theme, sourceUrl: cleanSourceUrl(answers.site) }
}
