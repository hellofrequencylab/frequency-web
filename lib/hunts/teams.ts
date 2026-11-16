/**
 * Expedition teams (FH-043): the rules a team plays by and the calls into the database that enforce them.
 *
 * A team is a roster that shares ONE run, so the engine's one-credit-per-run-and-stop key is also one
 * credit per team and stop. The database is the authority (supabase/migrations/
 * 20270346082000_hunt_teams_editions.sql): `hunt_team_claim_apply` is the door, and a trigger on
 * hunt_claims is the wall, so an outsider or a departed member cannot write a claim on a team run through
 * any path. This file holds what the caller computes around those functions: the invite code and its
 * hash, the same award split and captain succession the database applies (so a screen can say what will
 * happen before a tap), the narrowed answers, and the words a player reads.
 *
 * Like apply-claim.ts it takes the RPC caller as an argument and imports no admin client. The store that
 * reads the facts and passes its service-role client is lib/hunts/team-store.ts.
 */
import { createHash, randomInt } from 'node:crypto'
import { claimRequestHash, type Assurance } from './apply-claim'

export const TEAM_LIMITS = { nameMax: 60, sizeMin: 2, sizeMax: 12, sizeDefault: 6, inviteLength: 10 } as const

// No 0/O/1/I/L: a code is read aloud and typed on a phone.
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** A fresh invite code. Shown to the captain once; only its hash is stored. */
export function newInviteCode(): string {
  let code = ''
  for (let i = 0; i < TEAM_LIMITS.inviteLength; i++) code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]
  return code
}

/** The stored form of an invite code: case and spacing do not matter, so a typed code matches a shared one. */
export function inviteHash(code: string): string {
  return createHash('sha256').update(code.replace(/[\s-]/g, '').toUpperCase()).digest('hex')
}

/**
 * The idempotency key of a team member's stop confirmation. The typed code on the Trail page and the
 * scan's confirm step use the same key, so a scan and a typed retry by one member replay one claim.
 */
export function teamClaimKey(profileId: string, slug: string, code: string): string {
  return createHash('sha256').update(`team-play:${profileId}:${slug}:${code.trim().toLowerCase()}`).digest('hex')
}

export type RosterMember = { profileId: string; joinedAt: string; leftAt: string | null }

/** Active members, longest standing first; the profile id breaks a tie so the order never depends on row order. */
function standing(roster: readonly RosterMember[]): RosterMember[] {
  return roster
    .filter((m) => m.leftAt === null)
    .sort((a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt) || (a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0))
}

/**
 * Who holds each unit of a team award. Equal shares; the units left over go one each to the
 * longest-standing members. A departed member holds nothing. The same rule as hunt_team_award_allocate.
 */
export function allocateAward(units: number, roster: readonly RosterMember[]): { profileId: string; units: number }[] {
  const members = standing(roster)
  if (members.length === 0 || !Number.isInteger(units) || units < 0) return []
  const base = Math.floor(units / members.length)
  const spare = units % members.length
  return members.map((m, i) => ({ profileId: m.profileId, units: base + (i < spare ? 1 : 0) }))
}

/** Who becomes captain when `leaving` goes: the longest-standing member left, or null when the team disbands. */
export function nextCaptain(roster: readonly RosterMember[], leaving: string): string | null {
  return standing(roster).find((m) => m.profileId !== leaving)?.profileId ?? null
}

// ── The calls ────────────────────────────────────────────────────────────────────────────────────

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>

async function call<R extends string>(rpc: Rpc, fn: string, args: Record<string, unknown>, results: readonly R[]) {
  const { data, error } = await rpc(fn, args)
  if (error) throw new Error(`${fn} failed: ${error.message}`)
  const answer = (data ?? {}) as Record<string, unknown>
  const result = results.find((r) => r === answer.result)
  // An answer this build does not know is a bug: it throws rather than reading as success.
  if (!result) throw new Error(`${fn} returned an answer this build does not know`)
  return { result, answer }
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

const CREATE = ['created', 'hunt_not_live', 'already_on_team'] as const
const JOIN = ['joined', 'already_member', 'departed', 'bad_invite', 'already_on_team', 'team_full'] as const
const LOCK = ['locked', 'not_on_team', 'not_captain', 'team_closed', 'too_few_members', 'hunt_not_live'] as const
const LEAVE = ['left', 'not_on_team'] as const
const ALLOCATE = ['allocated', 'not_on_team', 'roster_not_locked'] as const
/** Every answer hunt_claim_apply gives, plus the two the team door adds in front of it. */
const CLAIM = [
  'credited', 'already_credited', 'duplicate_evidence', 'key_conflict', 'run_not_found', 'run_not_active', 'hunt_not_live',
  'version_superseded', 'outside_window', 'mission_not_found', 'mission_closed', 'placement_not_valid', 'assurance_too_low',
  'stale_progress', 'held', 'not_on_team', 'roster_not_locked',
] as const

export type TeamResult = (typeof CREATE)[number] | (typeof JOIN)[number] | (typeof LOCK)[number] | (typeof LEAVE)[number] | (typeof CLAIM)[number]

/** Form a team on a live Hunt. The caller becomes captain and gets the invite code, once. */
export async function createTeam(rpc: Rpc, input: { actorId: string; huntId: string; name: string; maxMembers?: number }) {
  const code = newInviteCode()
  const { result, answer } = await call(rpc, 'hunt_team_create', {
    p_actor: input.actorId,
    p_hunt_id: input.huntId,
    p_name: input.name.trim().slice(0, TEAM_LIMITS.nameMax),
    p_invite_hash: inviteHash(code),
    p_max_members: Math.min(Math.max(input.maxMembers ?? TEAM_LIMITS.sizeDefault, TEAM_LIMITS.sizeMin), TEAM_LIMITS.sizeMax),
  }, CREATE)
  return result === 'created' ? { result, teamId: str(answer.team_id), inviteCode: code } : { result }
}

export async function joinTeam(rpc: Rpc, input: { actorId: string; teamId: string; inviteCode: string }) {
  const { result } = await call(rpc, 'hunt_team_join', { p_actor: input.actorId, p_team_id: input.teamId, p_invite_hash: inviteHash(input.inviteCode) }, JOIN)
  return { result }
}

/** The captain closes the roster. This opens the team's one run; nobody joins after it. */
export async function lockTeam(rpc: Rpc, input: { actorId: string; teamId: string }) {
  const { result, answer } = await call(rpc, 'hunt_team_lock', { p_actor: input.actorId, p_team_id: input.teamId }, LOCK)
  return { result, runId: str(answer.run_id) }
}

/** Leave a team. The team keeps its credits; a leaving captain hands the run to the next member. */
export async function leaveTeam(rpc: Rpc, input: { actorId: string; teamId: string }) {
  const { result, answer } = await call(rpc, 'hunt_team_leave', { p_actor: input.actorId, p_team_id: input.teamId }, LEAVE)
  return { result, disbanded: answer.disbanded === true, captainId: str(answer.captain) ?? null }
}

type TeamClaimInput = {
  actorId: string
  teamId: string
  /** The team's run, used only for the request hash; the database reads the run off the team row. */
  runId: string
  missionKey: string
  placementId: string
  evidenceId: string
  assurance: Assurance
  idempotencyKey: string
  expectedProgressCount?: number | null
}

/** A roster member credits one stop on the team's run. An outsider or departed member gets `not_on_team`. */
export async function applyTeamClaim(rpc: Rpc, input: TeamClaimInput) {
  const { result, answer } = await call(rpc, 'hunt_team_claim_apply', {
    p_actor: input.actorId,
    p_team_id: input.teamId,
    p_mission_key: input.missionKey,
    p_placement_id: input.placementId,
    p_evidence_id: input.evidenceId,
    p_assurance: input.assurance,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: claimRequestHash(input),
    p_expected_progress_count: input.expectedProgressCount ?? null,
  }, CLAIM)
  return { result, claimId: str(answer.claim_id), replayed: answer.replayed === true }
}

/** Split a team award. Written once per team and award: a second call reads the first split. */
export async function allocateTeamAward(rpc: Rpc, input: { actorId: string; teamId: string; awardKey: string; units: number }) {
  const { result, answer } = await call(rpc, 'hunt_team_award_allocate', {
    p_actor: input.actorId,
    p_team_id: input.teamId,
    p_award_key: input.awardKey,
    p_units: input.units,
  }, ALLOCATE)
  const rows = Array.isArray(answer.shares) ? (answer.shares as { profile_id?: unknown; units?: unknown }[]) : []
  const shares = rows.flatMap((s) => (typeof s.profile_id === 'string' && typeof s.units === 'number' ? [{ profileId: s.profile_id, units: s.units }] : []))
  return { result, shares, replayed: answer.replayed === true }
}

/** What a player reads for each answer. An outsider and a departed member read the same line. */
export function teamMessage(result: TeamResult): string {
  switch (result) {
    case 'created':
      return 'Your team is ready. Share the code with your crew.'
    case 'joined':
      return 'You are on the team.'
    case 'already_member':
      return 'You are already on this team.'
    case 'departed':
      return 'You left this team, so you cannot rejoin it.'
    case 'bad_invite':
      return 'That code does not open a team. Check it with your captain.'
    case 'already_on_team':
      return 'You are already on a team for this Trail.'
    case 'team_full':
      return 'This team is full.'
    case 'locked':
      return 'The roster is locked. Go find your first stop.'
    case 'not_captain':
      return 'Only the captain can lock the roster.'
    case 'too_few_members':
      return 'A team needs at least two people before it locks.'
    case 'left':
      return 'You left the team. Its stops stay with the team.'
    case 'not_on_team':
      return 'You are not on this team.'
    case 'roster_not_locked':
      return 'Your captain needs to lock the roster before stops count.'
    case 'credited':
      return 'Stop confirmed for your team.'
    case 'already_credited':
      return 'Your team already has this stop.'
    case 'hunt_not_live':
    case 'team_closed':
      return 'This Trail is not running right now.'
    default:
      return 'This stop could not be confirmed.'
  }
}
