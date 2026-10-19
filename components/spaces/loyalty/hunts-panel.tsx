'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, Flag, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'
import { isError } from '@/lib/action-result'
import { answerHuntInvite, createHunt, inviteHuntStop, setHuntStatus } from '@/lib/loyalty/hunt-actions'
import { HUNT_COMPLETE_ZAPS, HUNT_LIMITS, huntLiveBlocker, huntWindow, type LoyaltyHunt } from '@/lib/loyalty/hunts'
import { formatRewardValue } from '@/lib/loyalty/program'

// HUNTS, the owner side (LIVE-941, docs/LOYALTY.md). Inside the Check-in panel under Regulars. The host
// names the hunt, sets its window and reward, invites Spaces by their link, and takes it live once three
// stops said yes. An invited Space answers here too. Copy obeys CONTENT-VOICE, no em dashes.

type Note = { tone: 'ok' | 'bad'; text: string } | null

const STATUS_LABEL: Record<LoyaltyHunt['status'], string> = { draft: 'Draft', live: 'Live', ended: 'Ended' }

function todayIso(offsetDays: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

export function HuntsPanel({ spaceId, hunts, canHost }: { spaceId: string; hunts: LoyaltyHunt[]; canHost: boolean }) {
  const [creating, setCreating] = useState(false)
  return (
    <div className="space-y-4">
      {hunts.length === 0 && !creating ? (
        <EmptyState
          icon={Flag}
          title="No hunts yet."
          description="Team up with neighbors: members who check in at every stop inside the window earn a reward from the host and 100 Zaps."
          action={canHost ? <Button onClick={() => setCreating(true)}>Host a hunt</Button> : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {hunts.map((h) => (
            <HuntRow key={h.id} spaceId={spaceId} hunt={h} />
          ))}
        </ul>
      )}
      {hunts.length > 0 && canHost && !creating && (
        <Button variant="secondary" onClick={() => setCreating(true)}>
          Host another hunt
        </Button>
      )}
      {creating && <HuntCreateForm spaceId={spaceId} onDone={() => setCreating(false)} />}
    </div>
  )
}

function HuntRow({ spaceId, hunt }: { spaceId: string; hunt: LoyaltyHunt }) {
  const router = useRouter()
  const [note, setNote] = useState<Note>(null)
  const [stopSlug, setStopSlug] = useState('')
  const [pending, start] = useTransition()
  const host = hunt.hostSpaceId === spaceId
  const mine = hunt.stops.find((s) => s.spaceId === spaceId)
  const accepted = hunt.stops.filter((s) => s.status === 'accepted').length
  const value = formatRewardValue(hunt.rewardValueCents)
  const liveBlocker = hunt.status === 'draft' ? huntLiveBlocker(hunt, todayIso(0)) : null

  function run(work: () => Promise<{ error?: string } | { data?: unknown }>, okText: string) {
    setNote(null)
    start(async () => {
      const result = await work()
      if ('error' in result && result.error) {
        setNote({ tone: 'bad', text: result.error })
        return
      }
      setNote({ tone: 'ok', text: okText })
      setStopSlug('')
      router.refresh()
    })
  }

  return (
    <li className="rounded-card border border-border bg-surface p-4 lift-1">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-body font-semibold text-text">
            {hunt.status === 'draft' ? hunt.title : <Link href={`/hunts/${hunt.slug}`} className="hover:underline">{hunt.title}</Link>}
          </p>
          <p className="text-meta text-muted">
            {STATUS_LABEL[hunt.status]} · {huntWindow(hunt.startsOn, hunt.endsOn)} · hosted by {host ? 'you' : hunt.hostSpaceName}
          </p>
          <p className="mt-1 text-body-sm text-text">
            Finish reward: {hunt.rewardTitle}
            {value ? <span className="text-muted"> ({value} value)</span> : null}
          </p>
        </div>
        {mine && mine.status === 'invited' && !host && (
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => answerHuntInvite(spaceId, hunt.id, true), 'You are in.')}>
              Join the hunt
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => answerHuntInvite(spaceId, hunt.id, false), 'Declined.')}>
              No thanks
            </Button>
          </div>
        )}
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {hunt.stops.map((s) => (
          <li
            key={s.spaceId}
            className={`rounded-pill border px-2.5 py-0.5 text-meta ${
              s.status === 'accepted' ? 'border-primary bg-primary-bg text-primary-strong' : s.status === 'declined' ? 'border-border text-subtle line-through' : 'border-border text-muted'
            }`}
          >
            {s.spaceName}
            {s.host ? ' (host)' : s.status === 'invited' ? ' (asked)' : ''}
          </li>
        ))}
      </ul>

      {host && hunt.status !== 'ended' && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {hunt.stops.length < HUNT_LIMITS.stopsMax && (
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault()
                if (!pending && stopSlug.trim()) run(() => inviteHuntStop(spaceId, hunt.id, stopSlug), 'Invited. They answer from their own Check-in panel.')
              }}
            >
              <div className="flex-1">
                <Label htmlFor={`hunt-stop-${hunt.id}`}>Invite a Space by its link</Label>
                <Input
                  id={`hunt-stop-${hunt.id}`}
                  value={stopSlug}
                  placeholder="the-corner-cafe"
                  autoComplete="off"
                  onChange={(e) => setStopSlug(e.target.value.replace(/^.*\/spaces\//, '').trim())}
                />
              </div>
              <Button type="submit" variant="secondary" disabled={pending || !stopSlug.trim()}>
                Invite
              </Button>
            </form>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {hunt.status === 'draft' ? (
              <>
                <Button disabled={pending || !!liveBlocker} onClick={() => run(() => setHuntStatus(spaceId, hunt.id, 'live'), 'The hunt is live.')}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Flag className="h-4 w-4" aria-hidden />}
                  Go live
                </Button>
                <span className="text-meta text-muted">{liveBlocker ?? `${accepted} stops said yes. Members can start once it is live.`}</span>
              </>
            ) : (
              <Button variant="secondary" disabled={pending} onClick={() => run(() => setHuntStatus(spaceId, hunt.id, 'ended'), 'The hunt has ended.')}>
                End the hunt
              </Button>
            )}
          </div>
        </div>
      )}
      {note && (
        <p role="status" className={`mt-2 flex items-center gap-1.5 text-body-sm ${note.tone === 'ok' ? 'text-success' : 'text-danger'}`}>
          {note.tone === 'ok' && <Check className="h-4 w-4" aria-hidden />}
          {note.text}
        </p>
      )}
    </li>
  )
}

function HuntCreateForm({ spaceId, onDone }: { spaceId: string; onDone: () => void }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startsOn, setStartsOn] = useState(todayIso(7))
  const [endsOn, setEndsOn] = useState(todayIso(7 + 42))
  const [rewardTitle, setRewardTitle] = useState('')
  const [valueDollars, setValueDollars] = useState('')
  const [rewardNote, setRewardNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    setError(null)
    const cents = Math.round(Number(valueDollars || 0) * 100)
    start(async () => {
      const result = await createHunt(spaceId, {
        title,
        description,
        startsOn,
        endsOn,
        rewardTitle,
        rewardValueCents: Number.isFinite(cents) ? cents : 0,
        rewardNote,
      })
      if (isError(result)) {
        setError(result.error)
        return
      }
      onDone()
      router.refresh()
    })
  }

  return (
    <form
      className="space-y-4 rounded-card border border-border bg-surface p-5 lift-1"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pending) save()
      }}
    >
      <div>
        <Label htmlFor="hunt-title">Name the hunt</Label>
        <Input id="hunt-title" value={title} maxLength={HUNT_LIMITS.titleMax} placeholder="Main Street Passport" onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="hunt-description">What it is, in a line or two</Label>
        <Textarea id="hunt-description" value={description} maxLength={HUNT_LIMITS.descriptionMax} rows={2} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="hunt-start">Starts</Label>
          <Input id="hunt-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="hunt-end">Ends</Label>
          <Input id="hunt-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          <p className="mt-1 text-meta text-subtle">Two to ten weeks. A deadline is what gets the last stop visited.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="hunt-reward">The reward for finishing</Label>
          <Input id="hunt-reward" value={rewardTitle} maxLength={HUNT_LIMITS.rewardTitleMax} placeholder="A $25 gift card" onChange={(e) => setRewardTitle(e.target.value)} />
          <p className="mt-1 text-meta text-subtle">You hand it out at your counter, like a card reward. Members also get {HUNT_COMPLETE_ZAPS} Zaps.</p>
        </div>
        <div>
          <Label htmlFor="hunt-value">Its value in dollars</Label>
          <Input id="hunt-value" inputMode="decimal" value={valueDollars} placeholder="25" onChange={(e) => setValueDollars(e.target.value.replace(/[^0-9.]/g, ''))} />
        </div>
      </div>
      <div>
        <Label htmlFor="hunt-note">How to collect it (optional)</Label>
        <Input id="hunt-note" value={rewardNote} maxLength={HUNT_LIMITS.noteMax} placeholder="Show your code at the register" onChange={(e) => setRewardNote(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Create the draft
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <span className="text-meta text-muted">Then invite at least two more Spaces and go live.</span>
      </div>
    </form>
  )
}
