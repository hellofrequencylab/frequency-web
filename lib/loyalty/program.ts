// REGULARS, the pure half (LIVE-940, ADR-1780, docs/LOYALTY.md). Types, limits and the card math the
// owner editor, the check-in result and the /rewards page all share. No Supabase, no Next: everything
// here is unit-testable (lib/loyalty/program.test.ts). The IO lives in ./store.ts and ./visit.ts.
//
// The program is a STAMP CARD, not a points balance: a member sees "2 more visits to your free coffee"
// (goal gradient), a first card may start with welcome stamps (endowed progress), and the reward is a
// named thing with a dollar value the owner set, never a percentage. Copy obeys CONTENT-VOICE.

/** Stamp-card limits. The migration's check constraints hold the same numbers. */
export const LOYALTY_LIMITS = {
  stampsMin: 3,
  stampsMax: 12,
  stampsDefault: 6,
  welcomeMax: 2,
  welcomeDefault: 1,
  titleMax: 80,
  noteMax: 280,
  valueMaxCents: 100_000,
} as const

/** Zaps a check-in at a Space running Regulars pays (zap_config 'space_checkin'; lib/zaps.ts fallback). */
export const SPACE_CHECKIN_ZAPS = 25

/** The program as the app consumes it (camelCased). */
export interface LoyaltyProgram {
  spaceId: string
  status: 'off' | 'on'
  stampsRequired: number
  welcomeStamps: number
  rewardTitle: string
  rewardValueCents: number
  rewardNote: string | null
  geofence: boolean
}

/** What the owner editor submits. */
export interface LoyaltyProgramInput {
  status: 'off' | 'on'
  stampsRequired: number
  welcomeStamps: number
  rewardTitle: string
  rewardValueCents: number
  rewardNote: string | null
  geofence: boolean
}

/** A member's card at one Space, as the check-in result and /rewards render it. */
export interface LoyaltyCard {
  spaceId: string
  spaceName: string
  spaceSlug: string
  stamps: number
  required: number
  rewardTitle: string
  rewardValueCents: number
  /** Rewards earned and not yet handed out, newest first. */
  openRewards: LoyaltyReward[]
}

export interface LoyaltyReward {
  id: string
  code: string
  rewardTitle: string
  rewardValueCents: number
  earnedAt: string
  redeemedAt: string | null
}

/** What the check-in result carries back to the claim button. */
export interface LoyaltyVisitOutcome {
  stamps: number
  required: number
  rewardTitle: string
  /** Set when this visit filled the card. */
  earnedCode: string | null
}

const DEFAULT_PROGRAM: Omit<LoyaltyProgram, 'spaceId'> = {
  status: 'off',
  stampsRequired: LOYALTY_LIMITS.stampsDefault,
  welcomeStamps: LOYALTY_LIMITS.welcomeDefault,
  rewardTitle: '',
  rewardValueCents: 0,
  rewardNote: null,
  geofence: false,
}

/** The program an owner starts from before saving anything. Pure. */
export function defaultProgram(spaceId: string): LoyaltyProgram {
  return { spaceId, ...DEFAULT_PROGRAM }
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * Validate the owner's input. Returns the clean input, or the one sentence to show. A program may be
 * saved OFF with an empty reward (a draft); turning it ON needs a reward title. Pure.
 */
export function normalizeProgramInput(raw: unknown): { input: LoyaltyProgramInput } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>
  const status: 'off' | 'on' = r.status === 'on' ? 'on' : 'off'
  const rewardTitle = typeof r.rewardTitle === 'string' ? r.rewardTitle.trim().slice(0, LOYALTY_LIMITS.titleMax) : ''
  const noteRaw = typeof r.rewardNote === 'string' ? r.rewardNote.trim().slice(0, LOYALTY_LIMITS.noteMax) : ''
  const input: LoyaltyProgramInput = {
    status,
    stampsRequired: clampInt(r.stampsRequired, LOYALTY_LIMITS.stampsMin, LOYALTY_LIMITS.stampsMax, LOYALTY_LIMITS.stampsDefault),
    welcomeStamps: clampInt(r.welcomeStamps, 0, LOYALTY_LIMITS.welcomeMax, LOYALTY_LIMITS.welcomeDefault),
    rewardTitle,
    rewardValueCents: clampInt(r.rewardValueCents, 0, LOYALTY_LIMITS.valueMaxCents, 0),
    rewardNote: noteRaw ? noteRaw : null,
    geofence: r.geofence === true,
  }
  if (input.status === 'on' && !input.rewardTitle) return { error: 'Name the reward before turning Regulars on.' }
  if (input.welcomeStamps >= input.stampsRequired - 1) return { error: 'Welcome stamps must leave at least two visits to earn.' }
  return { input }
}

/** Visits left on a card. Never below one while the card is open. Pure. */
export function visitsLeft(stamps: number, required: number): number {
  return Math.max(1, required - stamps)
}

/** The one line a card shows under its stamps: "2 more visits to your free coffee". Pure. */
export function cardLine(stamps: number, required: number, rewardTitle: string): string {
  const left = visitsLeft(stamps, required)
  const visits = left === 1 ? '1 more visit' : `${left} more visits`
  return `${visits} to your ${rewardTitle || 'reward'}`
}

/** A dollar value as the card prints it ("$6"), or null for an unpriced reward. Pure. */
export function formatRewardValue(cents: number): string | null {
  if (!Number.isFinite(cents) || cents <= 0) return null
  const dollars = cents / 100
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

/** The six-character counter code, spaced for reading ("K7Q 2MX"). Pure. */
export function formatCode(code: string): string {
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c
}

/** The RPC's jsonb reply, narrowed. Anything malformed reads as "nothing happened". Pure. */
export function readVisitReply(
  raw: unknown,
  rewardTitle: string,
): LoyaltyVisitOutcome | null {
  const r = (raw ?? {}) as Record<string, unknown>
  const required = typeof r.required === 'number' ? r.required : 0
  if (required <= 0) return null
  const stamps = typeof r.stamps === 'number' ? Math.max(0, r.stamps) : 0
  const earned = r.earned === true && typeof r.reward_code === 'string'
  return {
    stamps,
    required,
    rewardTitle: typeof r.reward_title === 'string' && r.reward_title ? r.reward_title : rewardTitle,
    earnedCode: earned ? (r.reward_code as string) : null,
  }
}
