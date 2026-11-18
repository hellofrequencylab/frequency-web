'use client'

// The Expedition team panel on the Trail page (FH-043S). The server reads the caller's own team (a name,
// a state, a member count, never a roster) and every tap goes through the actions in
// app/(main)/hunts/[slug]/play/team-actions.ts, which derive the caller themselves. The invite code is
// shown once, right after the team is formed, because only its hash is kept.
import Link from 'next/link'
import { useActionState } from 'react'
import { Users } from 'lucide-react'
import { Button, buttonClasses } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import {
  claimTeamStopAction,
  joinTeamAction,
  leaveTeamAction,
  lockTeamAction,
  startTeamAction,
  type TeamActionState,
} from '@/app/(main)/hunts/[slug]/play/team-actions'

const INITIAL: TeamActionState = { status: 'idle', message: '' }

type TeamPanelTeam = {
  teamId: string
  name: string
  state: 'forming' | 'locked' | 'disbanded'
  captain: boolean
  size: number
  stopsDone: number | null
}

function Status({ state }: { state: TeamActionState }) {
  return state.message ? <p role="status" className="text-body-sm text-muted">{state.message}</p> : null
}

function StartTeam({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(startTeamAction, INITIAL)
  const joinPath = state.teamId ? `/hunts/${encodeURIComponent(slug)}/play?team=${encodeURIComponent(state.teamId)}` : null
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <Field label="Team name">
        <Input name="name" maxLength={60} autoComplete="off" required />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Starting' : 'Start a team'}</Button>
      <Status state={state} />
      {state.inviteCode && joinPath ? (
        <div className="rounded-card border border-border bg-surface-elevated px-3 py-2">
          <p className="text-body-sm text-muted">Send your crew this link and code. The code shows only now, so save it.</p>
          <p className="break-all text-body-sm text-text">{joinPath}</p>
          <p className="text-body font-semibold tracking-wide text-text">{state.inviteCode}</p>
        </div>
      ) : null}
    </form>
  )
}

function JoinTeam({ slug, teamId }: { slug: string; teamId: string }) {
  const [state, action, pending] = useActionState(joinTeamAction, INITIAL)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="teamId" value={teamId} />
      <Field label="Code from your captain">
        <Input name="inviteCode" autoComplete="off" autoCapitalize="characters" spellCheck={false} required />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? 'Joining' : 'Join the team'}</Button>
      <Status state={state} />
    </form>
  )
}

function TeamButton({ slug, teamId, act, label, busy, variant }: {
  slug: string
  teamId: string
  act: typeof lockTeamAction
  label: string
  busy: string
  variant: 'primary' | 'ghost'
}) {
  const [state, action, pending] = useActionState(act, INITIAL)
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="teamId" value={teamId} />
      <Button type="submit" variant={variant} disabled={pending}>{pending ? busy : label}</Button>
      <Status state={state} />
    </form>
  )
}

function TeamClaim({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(claimTeamStopAction, INITIAL)
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

function stateLine(team: TeamPanelTeam): string {
  const people = `${team.size} ${team.size === 1 ? 'person' : 'people'}`
  if (team.state === 'locked') {
    const stops = team.stopsDone === null ? '' : ` Your team has ${team.stopsDone} ${team.stopsDone === 1 ? 'stop' : 'stops'}.`
    return `${people}, roster locked.${stops}`
  }
  return team.captain
    ? `${people} so far. Lock the roster when everyone is in. Stops count for the team after that.`
    : `${people} so far. Your captain locks the roster when everyone is in.`
}

/** The caller's team, or the doors to start or join one. `joinTeamId` comes from a captain's shared link. */
export function TeamPanel({ slug, team, joinTeamId }: { slug: string; team: TeamPanelTeam | null; joinTeamId: string | null }) {
  return (
    <section aria-labelledby="trail-team" className="space-y-3 rounded-card border border-border bg-surface px-4 py-3">
      <h2 id="trail-team" className="flex items-center gap-2 text-body font-semibold text-text">
        <Users className="h-4 w-4" aria-hidden />
        {team ? team.name : 'Play as a team'}
      </h2>
      {team ? (
        <>
          <p className="text-body-sm text-muted">{stateLine(team)}</p>
          {team.state === 'forming' && team.captain ? (
            <TeamButton slug={slug} teamId={team.teamId} act={lockTeamAction} label="Lock the roster" busy="Locking" variant="primary" />
          ) : null}
          {team.state === 'locked' ? (
            <>
              {/* A scanned code lands on the confirm step, which credits the team's run (FH-043S). */}
              <Link href={{ pathname: '/scan', query: { hint: 'trail' } }} prefetch={false} className={buttonClasses('primary', 'md')}>
                Scan the code at this stop
              </Link>
              <TeamClaim slug={slug} />
            </>
          ) : null}
          <TeamButton slug={slug} teamId={team.teamId} act={leaveTeamAction} label="Leave the team" busy="Leaving" variant="ghost" />
        </>
      ) : joinTeamId ? (
        <JoinTeam slug={slug} teamId={joinTeamId} />
      ) : (
        <>
          <p className="text-body-sm text-muted">One team shares one run, so each stop counts once for everyone. Joining a crew? Open the link your captain sent.</p>
          <StartTeam slug={slug} />
        </>
      )}
    </section>
  )
}
