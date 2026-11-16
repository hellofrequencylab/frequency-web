'use client'

// Expedition teams on the Trail page (FH-043S). Form a team, see the invite code once, join with a code,
// lock the roster, leave, and the team's progress. Every rule is the database's: these forms only carry
// the caller's taps to the actions in app/(main)/hunts/[slug]/play/team-actions.ts and show the answer.
// The page passes the caller's own team as a count; no teammate's name or profile reaches this file.
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import {
  claimTeamStopAction,
  joinTeamAction,
  leaveTeamAction,
  lockTeamAction,
  startTeamAction,
  type TeamActionState,
} from '@/app/(main)/hunts/[slug]/play/team-actions'

const IDLE: TeamActionState = { status: 'idle', message: '' }

type PanelTeam = { teamId: string; name: string; state: 'forming' | 'locked' | 'disbanded'; captain: boolean; size: number }

function Status({ state }: { state: TeamActionState }) {
  return state.message ? <p role="status" className="text-body-sm">{state.message}</p> : null
}

/** The share line, shown once right after the team is formed. Only the code's hash is stored. */
function Invite({ slug, teamId, inviteCode }: { slug: string; teamId: string; inviteCode: string }) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const link = `${origin}/hunts/${encodeURIComponent(slug)}/play?team=${teamId}`
  return (
    <div className="space-y-1 rounded-card border border-border bg-surface-elevated px-4 py-3">
      <p className="text-body-sm text-muted">Your invite code. It shows only this once, so share it now.</p>
      <p className="font-mono text-body font-bold tracking-widest text-text">{inviteCode}</p>
      <p className="break-all text-body-sm text-muted">Team link: {link}</p>
    </div>
  )
}

export function TeamPanel({ slug, team, progress, joinTeamId, limits }: {
  slug: string
  /** TEAM_LIMITS, passed by the page so this client file does not pull the server's hashing module in. */
  limits: { sizeMax: number; nameMax: number }
  team: PanelTeam | null
  /** Stops the team run holds, once the roster is locked. */
  progress: { done: number; total: number } | null
  /** A team id from a shared team link, already checked to be a UUID by the page. */
  joinTeamId: string | null
}) {
  const [started, startAction, starting] = useActionState(startTeamAction, IDLE)
  const [joined, joinAction, joining] = useActionState(joinTeamAction, IDLE)
  const [locked, lockAction, locking] = useActionState(lockTeamAction, IDLE)
  const [left, leaveAction, leaving] = useActionState(leaveTeamAction, IDLE)
  const active = team && team.state !== 'disbanded' ? team : null

  return (
    <section aria-labelledby="trail-team" className="space-y-3 rounded-card border border-border bg-surface px-4 py-3">
      <h2 id="trail-team" className="text-body font-semibold text-text">{active ? active.name : 'Play as a team'}</h2>
      {started.inviteCode && started.teamId ? <Invite slug={slug} teamId={started.teamId} inviteCode={started.inviteCode} /> : null}

      {active ? (
        <>
          <p className="text-body-sm text-muted">
            {active.size} {active.size === 1 ? 'person' : 'people'} on the team
            {active.captain ? '. You are the captain.' : '.'}
          </p>
          {active.state === 'locked' && progress ? (
            <p className="text-body-sm text-text">{progress.done} of {progress.total} stops confirmed for your team.</p>
          ) : null}
          {active.state === 'forming' && active.captain ? (
            <form action={lockAction} className="space-y-2">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="teamId" value={active.teamId} />
              <p className="text-body-sm text-muted">Lock the roster when everyone is in. Stops count after that, and nobody else can join.</p>
              <Button type="submit" disabled={locking}>{locking ? 'Locking' : 'Lock the roster'}</Button>
              <Status state={locked} />
            </form>
          ) : null}
          {active.state === 'forming' && !active.captain ? (
            <p className="text-body-sm text-muted">Your captain locks the roster when everyone is in. Stops count after that.</p>
          ) : null}
          <form action={leaveAction} className="space-y-2">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="teamId" value={active.teamId} />
            <Button type="submit" variant="secondary" disabled={leaving}>{leaving ? 'Leaving' : 'Leave the team'}</Button>
            <Status state={left} />
          </form>
        </>
      ) : (
        <>
          <p className="text-body-sm text-muted">
            Up to {limits.sizeMax} people share one run. A stop anyone on the team confirms counts once for everyone.
          </p>
          {joinTeamId ? (
            <form action={joinAction} className="space-y-2">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="teamId" value={joinTeamId} />
              <Field label="Invite code from your captain">
                <Input name="inviteCode" autoComplete="off" autoCapitalize="characters" spellCheck={false} required />
              </Field>
              <Button type="submit" disabled={joining}>{joining ? 'Joining' : 'Join the team'}</Button>
              <Status state={joined} />
            </form>
          ) : (
            <p className="text-body-sm text-muted">Joining a team? Open the team link your captain shared.</p>
          )}
          <form action={startAction} className="space-y-2">
            <input type="hidden" name="slug" value={slug} />
            <Field label="Team name">
              <Input name="name" maxLength={limits.nameMax} autoComplete="off" required />
            </Field>
            <Button type="submit" variant={joinTeamId ? 'secondary' : 'primary'} disabled={starting}>{starting ? 'Starting' : 'Start a team'}</Button>
          </form>
        </>
      )}
      {started.status === 'error' ? <Status state={started} /> : null}
    </section>
  )
}

/** Confirm a stop for the team with the code printed there. Replaces the solo form for a team member. */
export function TeamClaimForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(claimTeamStopAction, IDLE)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <Field label="Code at the stop">
        <Input name="code" autoComplete="off" autoCapitalize="none" spellCheck={false} required />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? 'Checking' : 'Confirm stop for your team'}</Button>
      <Status state={state} />
    </form>
  )
}
