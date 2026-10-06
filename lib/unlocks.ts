// THE UNLOCK MAP (LIVE-668). Which feature wakes up when, in one declarative table: a feature
// unlocks at a member STAGE (lib/member-progress.ts, ADR-146: stages reveal surfaces, never nav),
// at a COMMUNITY ROLE floor (lib/core/roles.ts, the trust ladder), or both. The gates read this
// map instead of carrying their own `stageIndex >= 3` or `atLeastRole(role, 'host')`, so the
// answer to "when does a member see X" lives here and nowhere else. docs/UNLOCKS.md is generated
// from it (`pnpm unlocks:doc`) and unlocks.test.ts fails when the two drift.
//
// PURE and client-safe: no Next or Supabase import, so a client component (the feed's practice
// board) can read the same map a server gate does. Retuning a stage or a floor is a one-line edit
// here; adding an unlock is one entry plus the gate that reads it.
//
// A role floor here is a feature WAKING UP, not the whole security story: a server action still
// checks its caller (it calls `roleUnlocked` with the caller's real role), and RLS still holds.

import { atLeastRole, type CommunityRole } from './core/roles'

/** The member stages, in order (lib/member-progress.ts MEMBER_STAGES carries the copy). */
export const STAGE_ORDER = ['newcomer', 'finding_feet', 'regular', 'established', 'anchor'] as const
export type StageKey = (typeof STAGE_ORDER)[number]

export const STAGE_LABELS: Record<StageKey, string> = {
  newcomer: 'Newcomer',
  finding_feet: 'Finding your feet',
  regular: 'Regular',
  established: 'Established',
  anchor: 'Anchor',
}

export function stageIndexOf(stage: StageKey): number {
  return STAGE_ORDER.indexOf(stage)
}

export interface UnlockDef {
  /** What the member gets, in plain words. */
  label: string
  /** Where it shows. */
  where: string
  /** The stage it wakes up at; omitted ⇒ no stage floor. */
  stage?: StageKey
  /** The community role floor; omitted ⇒ no role floor. */
  role?: CommunityRole
  /** The layout module id this unlock holds back, for module-driven pages (PageModules). */
  module?: string
}

export const UNLOCKS = {
  // ── Stage unlocks (ADR-146) ──────────────────────────────────────────────────────────────
  'feed.resource-doors': {
    label: 'The "Keep exploring" doors on the practice board',
    where: 'Feed',
    stage: 'regular',
  },
  'feed.pillar-balance': {
    label: 'Pillar balance on the practice board',
    where: 'Feed',
    stage: 'established',
  },
  // The comparison surfaces wait until a member has a habit of their own (LIVE-669).
  'quest.leaderboard': {
    label: 'The Circle leaderboard',
    where: 'My Quest',
    stage: 'regular',
    module: 'quest-leaderboard',
  },
  'rail.leaderboard': {
    label: 'The leaderboard panel (also needs Crew standing)',
    where: 'Right rail',
    stage: 'regular',
  },
  'profile.achievements': {
    label: 'The full Achievements grid on your own profile',
    where: 'Your profile',
    stage: 'finding_feet',
  },
  // ── Role unlocks (the trust ladder) ──────────────────────────────────────────────────────
  'lead.outreach': {
    label: 'Outreach: message the members you steward',
    where: 'Lead tools, /outreach',
    role: 'host',
  },
  'lead.inbox': {
    label: 'The group inbox',
    where: 'Lead tools',
    role: 'host',
  },
  'view-as': {
    label: 'View as: preview the app as a lower role',
    where: 'Header',
    role: 'host',
  },
  'profile.member-support': {
    label: 'The member support panel on someone else\'s profile',
    where: 'Profiles',
    role: 'host',
  },
} as const satisfies Record<string, UnlockDef>

export type UnlockFeature = keyof typeof UNLOCKS

function def(feature: UnlockFeature): UnlockDef {
  return UNLOCKS[feature]
}

/** Has a member at `stageIndex` reached this feature's stage? True when it has no stage floor. */
export function stageUnlocked(feature: UnlockFeature, stageIndex: number): boolean {
  const stage = def(feature).stage
  return stage === undefined || stageIndex >= stageIndexOf(stage)
}

/** Does `role` clear this feature's role floor? True when it has no role floor. */
export function roleUnlocked(feature: UnlockFeature, role: CommunityRole | null | undefined): boolean {
  const floor = def(feature).role
  return floor === undefined || atLeastRole(role, floor)
}

/** Both floors at once. A missing signal counts as the lowest rung. */
export function isUnlocked(
  feature: UnlockFeature,
  viewer: { stageIndex?: number | null; role?: CommunityRole | null },
): boolean {
  return stageUnlocked(feature, viewer.stageIndex ?? 0) && roleUnlocked(feature, viewer.role ?? 'member')
}

/** Module id → the stage it wakes up at, for the module-driven pages. */
export const MODULE_STAGE_FLOORS: ReadonlyMap<string, StageKey> = new Map(
  (Object.values(UNLOCKS) as UnlockDef[]).flatMap((u) => (u.module && u.stage ? [[u.module, u.stage] as const] : [])),
)

/** The module ids a member at `stageIndex` may not see yet. */
export function lockedModules(moduleIds: readonly string[], stageIndex: number): Set<string> {
  const out = new Set<string>()
  for (const id of moduleIds) {
    const stage = MODULE_STAGE_FLOORS.get(id)
    if (stage && stageIndex < stageIndexOf(stage)) out.add(id)
  }
  return out
}

/** docs/UNLOCKS.md, rendered from the map. */
export function renderUnlocksDoc(): string {
  const rows = (Object.entries(UNLOCKS) as [UnlockFeature, UnlockDef][]).map(([key, u]) => {
    const when = [u.stage ? `stage ${STAGE_LABELS[u.stage]}` : '', u.role ? `role ${u.role} and up` : '']
      .filter(Boolean)
      .join(' and ')
    return `| \`${key}\` | ${u.label} | ${u.where} | ${when} |`
  })
  return [
    '# Unlocks',
    '',
    'GENERATED from `lib/unlocks.ts` by `pnpm unlocks:doc`. Do not edit by hand: change the map and',
    'regenerate. `lib/unlocks.test.ts` fails when this file and the map disagree.',
    '',
    'Which feature wakes up when. Stages come from `lib/member-progress.ts` (ADR-146) and reveal',
    'surfaces, never nav. Role floors are the community trust ladder (`lib/core/roles.ts`).',
    '',
    `Stages, in order: ${STAGE_ORDER.map((s) => STAGE_LABELS[s]).join(', ')}.`,
    '',
    '| Feature | What | Where | Wakes up at |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n')
}
