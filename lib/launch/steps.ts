// THE LAUNCH STEPS (VLS-02). Nine steps in three stages, the one list the launch box, the step screens, the
// reminder emails and the admin funnel all read, so they cannot disagree about what comes next. PURE data and
// small readers, no imports from the app, so a probe can run it under node.
//
// Shape: Stage 1 "Be found" (Spotlight, Your Space, First offer, Website), stage 2 "Gather people" (Event,
// Circle, Journey), stage 3 "Keep them" (Your people, Get paid). Spotlight, Space, Website and Your people are
// required to count as launched; the rest can be skipped. A niche and the owner's starting intents reorder the
// stage 2 steps and may hide Journey, never a required step.

export const LAUNCH_STEP_IDS = ['spotlight', 'space', 'offer', 'website', 'event', 'circle', 'journey', 'people', 'paid'] as const
export type LaunchStepId = (typeof LAUNCH_STEP_IDS)[number]

export const LAUNCH_STAGE_IDS = ['found', 'gather', 'keep'] as const
type LaunchStageId = (typeof LAUNCH_STAGE_IDS)[number]

interface LaunchStepDef {
  id: LaunchStepId
  stage: LaunchStageId
  /** What the person reads in the box. A plain noun, no verb. */
  label: string
  /** Required steps are the ones that count as launched. Every other step can be skipped. */
  required: boolean
}

export const LAUNCH_STAGES: readonly { id: LaunchStageId; label: string }[] = [
  { id: 'found', label: 'Be found' },
  { id: 'gather', label: 'Gather people' },
  { id: 'keep', label: 'Keep them' },
]

const STEP_DEFS: Readonly<Record<LaunchStepId, LaunchStepDef>> = {
  spotlight: { id: 'spotlight', stage: 'found', label: 'Spotlight', required: true },
  space: { id: 'space', stage: 'found', label: 'Your Space', required: true },
  offer: { id: 'offer', stage: 'found', label: 'First offer', required: false },
  website: { id: 'website', stage: 'found', label: 'Website', required: true },
  event: { id: 'event', stage: 'gather', label: 'Event', required: false },
  circle: { id: 'circle', stage: 'gather', label: 'Circle', required: false },
  journey: { id: 'journey', stage: 'gather', label: 'Journey', required: false },
  people: { id: 'people', stage: 'keep', label: 'Your people', required: true },
  paid: { id: 'paid', stage: 'keep', label: 'Get paid', required: false },
}

export function launchStep(id: LaunchStepId): LaunchStepDef {
  return STEP_DEFS[id]
}

export function isLaunchStepId(v: unknown): v is LaunchStepId {
  return typeof v === 'string' && (LAUNCH_STEP_IDS as readonly string[]).includes(v)
}

/** Where a step's own screen lives. Every launch link (the box, the resume page, the reminder emails) builds
 *  its address here, so a rename is one edit. */
export function launchStepHref(id: LaunchStepId): string {
  return `/launch/step/${id === 'paid' ? 'get-paid' : id}`
}

export function isSkippable(id: LaunchStepId): boolean {
  return !STEP_DEFS[id].required
}

type GatherStep = 'event' | 'circle' | 'journey'

/** The stage 2 order a niche leads with. The niche ids are lib/theme/mega-theme.ts MEGA_NICHES. */
const GATHER_BY_NICHE: Readonly<Record<string, readonly GatherStep[]>> = {
  coaches: ['circle', 'journey', 'event'],
  studios: ['event', 'circle', 'journey'],
  hosts: ['event', 'circle', 'journey'],
  venues: ['event', 'circle', 'journey'],
  nonprofits: ['event', 'circle', 'journey'],
  networks: ['circle', 'event', 'journey'],
  general: ['event', 'circle', 'journey'],
  creators: ['event', 'circle', 'journey'],
  schools: ['journey', 'circle', 'event'],
  clubs: ['circle', 'event', 'journey'],
  faith: ['circle', 'event', 'journey'],
  wellness: ['event', 'journey', 'circle'],
  markets: ['event', 'circle', 'journey'],
}
const DEFAULT_GATHER: readonly GatherStep[] = ['event', 'circle', 'journey']

/** Niches for which a Journey is not an honest first suggestion. They can still turn it on with the
 *  "Teach programs or courses" starting intent. */
const NO_JOURNEY_NICHES: ReadonlySet<string> = new Set(['hosts', 'venues', 'markets', 'nonprofits', 'networks'])

/** A starting intent (lib/spaces/create-wizard.ts WIZARD_INTENTS) that moves one stage 2 step to the front. */
const INTENT_LEADS: Readonly<Record<string, GatherStep>> = { events: 'event', community: 'circle', programs: 'journey' }

/** The steps for one person, in the order they are shown. Stages keep their order; inside stage 2 the owner's
 *  starting intents lead (in the order given), then the niche's own order. Journey drops out for niches where
 *  it is not an honest first suggestion unless the owner asked to teach programs. Total: an unknown niche or
 *  a junk intent list reads as the default. PURE and stable: the same inputs give the same list. */
export function orderedLaunchSteps(niche?: string | null, intents?: readonly unknown[] | null): LaunchStepDef[] {
  const asked = (Array.isArray(intents) ? intents : []).filter((v): v is string => typeof v === 'string')
  const base = (niche ? GATHER_BY_NICHE[niche] : undefined) ?? DEFAULT_GATHER
  const leads = asked.map((i) => INTENT_LEADS[i]).filter((s): s is GatherStep => !!s)
  const gather: GatherStep[] = []
  for (const s of [...leads, ...base]) if (!gather.includes(s)) gather.push(s)
  const journeyOk = !(niche && NO_JOURNEY_NICHES.has(niche)) || asked.includes('programs')
  const ids: LaunchStepId[] = [
    'spotlight', 'space', 'offer', 'website',
    ...gather.filter((s) => s !== 'journey' || journeyOk),
    'people', 'paid',
  ]
  return ids.map((id) => STEP_DEFS[id])
}
