/**
 * Hunt reward specs and the grant call (FH-021). The database does the scarce part in one transaction
 * (supabase/migrations/20270346042000_hunt_rewards.sql, `hunt_reward_grant`): it serialises on the
 * reward row, so two qualifying players racing the last unit allocate exactly one, and the loser reads
 * `sold_out` with the stock terms the reward published. This file holds what the caller computes around
 * that: the validated spec (deterministic, no clock and no randomness), the pure eligibility rule the
 * database mirrors, the request hash, the narrowed answer, and the words a player sees for each answer.
 *
 * Nothing here moves money. A reward that carries a price or a refund belongs to the commerce rows.
 * A route calls this only when HUNTS_REWARDS_ENABLED is on (lib/hunts/flags.ts).
 */
import { createHash } from 'node:crypto'

export type RewardKind = 'perk' | 'badge' | 'discount' | 'item'
const KINDS: readonly RewardKind[] = ['perk', 'badge', 'discount', 'item']

type RewardEligibility = { runState: 'completed' } | { missions: readonly string[] }

type RewardSpec = {
  key: string
  title: string
  kind: RewardKind
  eligibility: RewardEligibility
  /** Null means unlimited. */
  stock: number | null
  perPlayerLimit: number
  stockTerms: string
}

export const DEFAULT_STOCK_TERMS = 'First come, first served. Your finish still counts.'

const KEY = /^[a-z0-9_-]{1,40}$/

/** Validate an author's reward. Returns the spec or the first reason it is refused; nothing is guessed. */
export function parseRewardSpec(input: unknown): { ok: true; spec: RewardSpec } | { ok: false; reason: string } {
  const r = (input ?? {}) as Record<string, unknown>
  const key = typeof r.key === 'string' ? r.key : ''
  if (!KEY.test(key)) return { ok: false, reason: 'The reward key is 1 to 40 lowercase letters, numbers, dashes or underscores.' }
  const title = typeof r.title === 'string' ? r.title.trim() : ''
  if (title.length < 1 || title.length > 120) return { ok: false, reason: 'Give the reward a title of up to 120 characters.' }
  const kind = KINDS.find((k) => k === r.kind) ?? 'perk'
  if (r.stock !== undefined && r.stock !== null && !(Number.isInteger(r.stock) && (r.stock as number) >= 0)) {
    return { ok: false, reason: 'Stock is a whole number, or left empty for no limit.' }
  }
  const limit = r.perPlayerLimit === undefined ? 1 : r.perPlayerLimit
  if (!(Number.isInteger(limit) && (limit as number) >= 1 && (limit as number) <= 10)) return { ok: false, reason: 'One player can hold 1 to 10 of a reward.' }
  const terms = typeof r.stockTerms === 'string' && r.stockTerms.trim() ? r.stockTerms.trim() : DEFAULT_STOCK_TERMS
  if (terms.length > 280) return { ok: false, reason: 'Stock terms are up to 280 characters.' }

  let eligibility: RewardEligibility = { runState: 'completed' }
  const e = r.eligibility as { missions?: unknown } | undefined
  if (e && Array.isArray(e.missions)) {
    const missions = e.missions.filter((m): m is string => typeof m === 'string' && KEY.test(m))
    if (missions.length === 0 || missions.length !== e.missions.length) return { ok: false, reason: 'Name at least one stop, using stop keys.' }
    eligibility = { missions: [...new Set(missions)].sort() }
  }
  return { ok: true, spec: { key, title, kind, eligibility, stock: (r.stock as number | null | undefined) ?? null, perPlayerLimit: limit as number, stockTerms: terms } }
}

/** The jsonb the database stores for a spec's eligibility. */
export function eligibilityJson(e: RewardEligibility): Record<string, unknown> {
  return 'missions' in e ? { missions: [...e.missions] } : { run_state: 'completed' }
}

/** The same rule the function applies, for the UI to say "finish the trail" before a tap. Pure. */
export function isEligible(e: RewardEligibility, run: { state: string; creditedMissions: readonly string[] }): boolean {
  if ('missions' in e) return e.missions.every((m) => run.creditedMissions.includes(m))
  return run.state === 'completed'
}

export function stockLeft(spec: Pick<RewardSpec, 'stock'>, grantedCount: number): number | null {
  return spec.stock === null ? null : Math.max(spec.stock - grantedCount, 0)
}

// ── The call ─────────────────────────────────────────────────────────────────────────────────────

const RESULTS = ['granted', 'already_granted', 'sold_out', 'not_eligible', 'run_not_found', 'hunt_not_live', 'reward_not_found', 'key_conflict'] as const
type GrantResult = (typeof RESULTS)[number]

type Rpc = (fn: 'hunt_reward_grant', args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>

/** Hash of everything that defines the request except the key, so a reused key for another reward is a conflict. */
export function grantRequestHash(input: { actorId: string; runId: string; rewardKey: string }): string {
  return createHash('sha256').update(JSON.stringify([input.actorId, input.runId, input.rewardKey])).digest('hex')
}

export async function grantReward(
  rpc: Rpc,
  input: { actorId: string; runId: string; rewardKey: string; idempotencyKey: string },
): Promise<{ result: GrantResult; grantId?: string; terms?: string; replayed: boolean }> {
  const { data, error } = await rpc('hunt_reward_grant', {
    p_actor: input.actorId,
    p_run_id: input.runId,
    p_reward_key: input.rewardKey,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: grantRequestHash(input),
  })
  if (error) throw new Error(`hunt_reward_grant failed: ${error.message}`)
  const a = data as { result?: string; grant_id?: string; terms?: string; replayed?: boolean } | null
  const result = RESULTS.find((r) => r === a?.result)
  if (!result) throw new Error('hunt_reward_grant returned an answer this build does not know')
  return { result, grantId: a?.grant_id, terms: a?.terms, replayed: a?.replayed === true }
}

/** What a player reads for each answer. A sold-out answer carries the published terms, never made-up ones. */
export function grantMessage(out: { result: GrantResult; terms?: string }): string {
  switch (out.result) {
    case 'granted':
      return 'It is yours.'
    case 'already_granted':
      return 'You already have this one.'
    case 'sold_out':
      return out.terms ?? DEFAULT_STOCK_TERMS
    case 'not_eligible':
      return 'Finish the trail to unlock this one.'
    case 'hunt_not_live':
      return 'This trail is not running right now.'
    case 'key_conflict':
      return 'That tap was already used. Try again.'
    default:
      return 'We could not find that reward.'
  }
}
