/**
 * The calls behind reporting and the emergency switch (FH-018S live half). The database guarantees the
 * moves and the once-ness (hunt_report_file, hunt_moderate); this file decides WHO (lib/hunts/authz.ts
 * decide: `pause_resume` for pause and resume, `end` for close) and what a person reads for each answer.
 *
 * Every function takes its IO as an argument, so a route passes its own service-role client and this
 * module imports no admin client. Dark behind HUNTS_ENABLED (reporting) and HUNTS_AUTHORING_ENABLED
 * (the operator queue); see lib/hunts/flags.ts.
 */
import { createHash } from 'node:crypto'
import { decide, type Actor, type HuntFacts, type PartnerRow, type RoleGrant } from './authz'

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>

const REPORT_RESULTS = ['reported', 'already_reported', 'hunt_not_found', 'bad_reason', 'details_too_long', 'key_conflict'] as const
type ReportResult = (typeof REPORT_RESULTS)[number]

const MODERATE_RESULTS = ['moderated', 'not_allowed', 'hunt_not_found', 'bad_action', 'note_too_long', 'key_conflict'] as const
type ModerateResult = (typeof MODERATE_RESULTS)[number]

type ModerationAction = 'pause' | 'resume' | 'close'

export const isModerationAction = (v: unknown): v is ModerationAction => v === 'pause' || v === 'resume' || v === 'close'

/** Facts for deciding a moderation action on one Hunt, loaded fresh for the request. */
export type ModerationFacts = {
  hunt: HuntFacts
  grants: RoleGrant[]
  partners: PartnerRow[]
  actor: Actor
}

/** May this person pause, resume or close this Hunt? Owner and admin roles only (docs/hunts/ROLE-MATRIX.md). */
export function mayModerate(facts: ModerationFacts, action: ModerationAction, targetHuntId: string, nowEpoch: number): boolean {
  return decide(action === 'close' ? 'end' : 'pause_resume', {
    hunt: facts.hunt,
    grants: facts.grants,
    partners: facts.partners,
    actor: facts.actor,
    ctx: { targetHuntId },
    now: new Date(nowEpoch * 1000).toISOString(),
  }).allow
}

/** Hash of everything that defines the request except the key, so a reused key for another request is a conflict. */
function reportRequestHash(input: { reporterId: string; huntId: string; reason: string; details: string }): string {
  return createHash('sha256').update(JSON.stringify(['report', input.reporterId, input.huntId, input.reason, input.details.trim()])).digest('hex')
}

function moderateRequestHash(input: { actorId: string; huntId: string; action: string; note: string }): string {
  return createHash('sha256').update(JSON.stringify(['moderate', input.actorId, input.huntId, input.action, input.note.trim()])).digest('hex')
}

export async function fileHuntReport(
  rpc: Rpc,
  input: { reporterId: string; huntId: string; reason: string; details: string; idempotencyKey: string },
): Promise<{ result: ReportResult; replayed: boolean }> {
  const { data, error } = await rpc('hunt_report_file', {
    p_actor: input.reporterId,
    p_hunt_id: input.huntId,
    p_reason: input.reason,
    p_details: input.details,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: reportRequestHash(input),
  })
  if (error) throw new Error(`hunt_report_file failed: ${error.message}`)
  const a = data as { result?: string; replayed?: boolean } | null
  const result = REPORT_RESULTS.find((r) => r === a?.result)
  if (!result) throw new Error('hunt_report_file returned an answer this build does not know')
  return { result, replayed: a?.replayed === true }
}

export async function moderateHunt(
  rpc: Rpc,
  input: { actorId: string; huntId: string; action: ModerationAction; note: string; idempotencyKey: string },
): Promise<{ result: ModerateResult; replayed: boolean }> {
  const { data, error } = await rpc('hunt_moderate', {
    p_actor: input.actorId,
    p_hunt_id: input.huntId,
    p_action: input.action,
    p_note: input.note,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: moderateRequestHash(input),
  })
  if (error) throw new Error(`hunt_moderate failed: ${error.message}`)
  const a = data as { result?: string; replayed?: boolean } | null
  const result = MODERATE_RESULTS.find((r) => r === a?.result)
  if (!result) throw new Error('hunt_moderate returned an answer this build does not know')
  return { result, replayed: a?.replayed === true }
}

/** What a person reads for each answer. */
export function moderationMessage(result: ReportResult | ModerateResult, action?: ModerationAction): string {
  switch (result) {
    case 'reported':
      return 'Thanks. We sent your report to the people running this Trail.'
    case 'already_reported':
      return 'You already have a report open on this Trail. The people running it have it.'
    case 'moderated':
      return action === 'pause' ? 'Paused. Players keep their progress.' : action === 'resume' ? 'Running again.' : 'Closed. Players keep their progress.'
    case 'not_allowed':
      return 'That is not possible for this Trail right now.'
    case 'details_too_long':
    case 'note_too_long':
      return 'That is too long. Shorten it and try again.'
    case 'bad_reason':
    case 'bad_action':
      return 'Pick one of the choices and try again.'
    case 'key_conflict':
      return 'That tap was already used for something else. Reload and try again.'
    case 'hunt_not_found':
      return 'We could not find that Trail.'
  }
}
