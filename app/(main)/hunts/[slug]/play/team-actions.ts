'use server'

// Expedition team actions on the Trail page (FH-043). Each action derives the signed-in profile itself
// and never takes a profile id, a run id or a stop key from the request: the caller's own membership
// picks the team and its run, and the code printed at the stop picks the stop. The roster rules are the
// database's (lib/hunts/teams.ts); these only carry the answer back in words.
// Dark until HUNTS_CLAIMS_ENABLED is on.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { claimAsTeamMember, joinMyTeam, leaveMyTeam, lockMyTeam, startTeam } from '@/lib/hunts/team-store'
import { teamClaimKey, teamMessage, type TeamResult } from '@/lib/hunts/teams'

export type TeamActionState = { status: 'idle' | 'done' | 'error'; message: string; teamId?: string; inviteCode?: string }

const SLUG = /^[a-z0-9-]{1,120}$/
const CODE = /^[a-z0-9-]{6,80}$/
const OFF = 'Teams are not open yet.'
const error = (message: string): TeamActionState => ({ status: 'error', message })
const GOOD: readonly TeamResult[] = ['created', 'joined', 'already_member', 'locked', 'left', 'credited', 'already_credited']

const field = (formData: FormData, name: string): string => {
  const v = formData.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

async function caller(formData: FormData): Promise<{ profileId: string; slug: string } | TeamActionState> {
  if (!huntSwitchOn('claims')) return error(OFF)
  const slug = field(formData, 'slug')
  if (!SLUG.test(slug)) return error('This Trail could not be found.')
  const profile = await getCallerProfile()
  if (!profile) return error('Sign in to play on a team.')
  return { profileId: profile.id, slug }
}

function settle(slug: string, out: { result: TeamResult | 'disabled' }, extra: Partial<TeamActionState> = {}): TeamActionState {
  if (out.result === 'disabled') return error(OFF)
  if (!GOOD.includes(out.result)) return error(teamMessage(out.result))
  revalidatePath(`/hunts/${slug}/play`)
  return { status: 'done', message: teamMessage(out.result), ...extra }
}

export async function startTeamAction(_previous: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const who = await caller(formData)
  if ('status' in who) return who
  const name = field(formData, 'name')
  if (!name) return error('Give your team a name.')
  const out = await startTeam(who.profileId, { slug: who.slug, name })
  // The invite code is shown once, here. Only its hash is stored.
  return settle(who.slug, out, 'inviteCode' in out ? { teamId: out.teamId, inviteCode: out.inviteCode } : {})
}

export async function joinTeamAction(_previous: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const who = await caller(formData)
  if ('status' in who) return who
  return settle(who.slug, await joinMyTeam(who.profileId, { teamId: field(formData, 'teamId'), inviteCode: field(formData, 'inviteCode') }))
}

export async function lockTeamAction(_previous: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const who = await caller(formData)
  if ('status' in who) return who
  return settle(who.slug, await lockMyTeam(who.profileId, field(formData, 'teamId')))
}

export async function leaveTeamAction(_previous: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const who = await caller(formData)
  if ('status' in who) return who
  return settle(who.slug, await leaveMyTeam(who.profileId, field(formData, 'teamId')))
}

export async function claimTeamStopAction(_previous: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const who = await caller(formData)
  if ('status' in who) return who
  const code = field(formData, 'code').toLowerCase()
  if (!CODE.test(code)) return error('That code does not look right. Check it and try again.')
  // One key per member, Trail and stop code: a retry or a second device replays instead of double crediting.
  const idempotencyKey = teamClaimKey(who.profileId, who.slug, code)
  const out = await claimAsTeamMember(who.profileId, { slug: who.slug, code, idempotencyKey, nowEpoch: Math.floor(Date.now() / 1000) })
  if (!out.ok) {
    return error(out.reason === 'disabled' ? OFF : out.reason === 'not_on_team' || out.reason === 'roster_not_locked' ? teamMessage(out.reason) : 'This stop could not be confirmed.')
  }
  return settle(who.slug, out)
}
