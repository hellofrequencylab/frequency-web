'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Rocket, CalendarClock, FileText, Square } from 'lucide-react'
import { Input, Label } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/admin/status'
import { DangerModal } from '@/components/admin/danger-modal'
import { isError, type ActionResult } from '@/lib/action-result'
import { updateSeasonAction, setSeasonStatusAction } from '../../actions'
import { StateBadge } from '../state-badge'
import { seasonStateFromStatus, type SeasonState } from '../lifecycle'

// The season identity + lifecycle editor (janitor-only; the server re-checks). Identity:
// name / theme / window, saved through updateSeasonAction. Lifecycle: the Draft ->
// Scheduled -> Live -> Ended transitions, each routed through setSeasonStatusAction with
// the legal source/target enforced server-side. The two consequential moves (Go live, End
// the season) take a confirm. Read-only operators see the fields and badge but no controls.

/** A date input wants YYYY-MM-DD; ISO timestamps carry a time we drop for the field. */
function toDateInput(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

export function SeasonEditor({
  season,
  canEdit,
}: {
  season: {
    id: string
    seasonNumber: number
    name: string
    theme: string | null
    startsAt: string | null
    endsAt: string | null
    status: string
  }
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [name, setName] = useState(season.name)
  const [theme, setTheme] = useState(season.theme ?? '')
  const [startsAt, setStartsAt] = useState(toDateInput(season.startsAt))
  const [endsAt, setEndsAt] = useState(toDateInput(season.endsAt))

  const [goLiveAt, setGoLiveAt] = useState(toDateInput(season.startsAt))
  const [confirmGoLive, setConfirmGoLive] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)

  const state: SeasonState = seasonStateFromStatus(season.status)

  function run(fn: () => Promise<ActionResult>, onOk?: () => void) {
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await fn()
      if (isError(res)) {
        setError(res.error)
        return
      }
      onOk?.()
      router.refresh()
    })
  }

  const dirty =
    name !== season.name ||
    theme !== (season.theme ?? '') ||
    startsAt !== toDateInput(season.startsAt) ||
    endsAt !== toDateInput(season.endsAt)

  function save() {
    run(
      () =>
        updateSeasonAction(season.id, {
          name,
          theme: theme || null,
          startsAt: startsAt || null,
          endsAt: endsAt || null,
        }),
      () => setSaved(true),
    )
  }

  function transition(target: 'draft' | 'scheduled' | 'active' | 'ended', goLive?: string) {
    run(() => setSeasonStatusAction(season.id, target, goLive ? { goLiveAt: goLive } : undefined))
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-4">
      {error && (
        <Banner tone="critical" title="That didn’t go through">
          {error}
        </Banner>
      )}

      {/* Identity + window */}
      <fieldset disabled={!canEdit || pending} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="season-name">Name</Label>
          <Input id="season-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Season ${season.seasonNumber}`} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="season-theme">Theme</Label>
          <Input id="season-theme" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="What this season is about" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="season-start">Starts</Label>
          <Input id="season-start" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="season-end">Ends</Label>
          <Input id="season-end" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
      </fieldset>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={save} disabled={pending || !dirty || !name.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Save changes
          </Button>
          {saved && <span className="text-xs font-medium text-success">Saved.</span>}
        </div>
      )}

      {/* Lifecycle */}
      <div className="border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-subtle">Lifecycle</span>
          <StateBadge state={state} size="sm" />
        </div>

        {canEdit ? (
          <div className="mt-3 space-y-3">
            <LifecycleControls
              state={state}
              pending={pending}
              goLiveAt={goLiveAt}
              setGoLiveAt={setGoLiveAt}
              onDraft={() => transition('draft')}
              onSchedule={() => transition('scheduled', goLiveAt)}
              onGoLive={() => setConfirmGoLive(true)}
              onEnd={() => setConfirmEnd(true)}
            />
            <LifecycleHint state={state} />
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">Moving the season through its lifecycle is janitor-only.</p>
        )}
      </div>

      <DangerModal
        open={confirmGoLive}
        onClose={() => setConfirmGoLive(false)}
        title="Go live now?"
        body="This makes the season the live one for everyone. Only one season can be live at a time, so any season already live must be ended first."
        confirmLabel="Go live now"
        onConfirm={() => transition('active')}
      />
      <DangerModal
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title="End the season?"
        body="This closes the live season. The season reset that mints trophies and converts Zaps to Gems still runs from Gamification; this only marks the season ended."
        confirmLabel="End the season"
        requireTyping={season.name}
        onConfirm={() => transition('ended')}
      />
    </div>
  )
}

function LifecycleControls({
  state,
  pending,
  goLiveAt,
  setGoLiveAt,
  onDraft,
  onSchedule,
  onGoLive,
  onEnd,
}: {
  state: SeasonState
  pending: boolean
  goLiveAt: string
  setGoLiveAt: (v: string) => void
  onDraft: () => void
  onSchedule: () => void
  onGoLive: () => void
  onEnd: () => void
}) {
  // Pre-live states (Draft / Scheduled) can schedule and go live; only the live season
  // can end. An ended season is terminal here (the reset opens the next one).
  if (state === 'ended') {
    return <p className="text-xs text-muted">This season has ended. The next season opens from the season reset in Gamification.</p>
  }

  const preLive = state === 'draft' || state === 'scheduled'

  return (
    <div className="flex flex-wrap items-end gap-3">
      {preLive && (
        <>
          {state === 'scheduled' && (
            <Button size="sm" variant="secondary" disabled={pending} onClick={onDraft}>
              <FileText className="h-4 w-4" aria-hidden /> Back to draft
            </Button>
          )}
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="go-live-at">Go-live date</Label>
              <Input
                id="go-live-at"
                type="date"
                value={goLiveAt}
                onChange={(e) => setGoLiveAt(e.target.value)}
                className="w-auto"
              />
            </div>
            <Button size="sm" variant="secondary" disabled={pending || !goLiveAt} onClick={onSchedule}>
              <CalendarClock className="h-4 w-4" aria-hidden /> Schedule
            </Button>
          </div>
          <Button size="sm" disabled={pending} onClick={onGoLive}>
            <Rocket className="h-4 w-4" aria-hidden /> Go live now
          </Button>
        </>
      )}
      {state === 'live' && (
        <Button size="sm" variant="dangerOutline" disabled={pending} onClick={onEnd}>
          <Square className="h-4 w-4" aria-hidden /> End the season
        </Button>
      )}
    </div>
  )
}

function LifecycleHint({ state }: { state: SeasonState }) {
  const hint: Record<SeasonState, string> = {
    draft: 'Draft: composing, not public. Schedule a go-live date or take it live now.',
    scheduled: 'Scheduled: a go-live date is set. Take it live now or move it back to draft.',
    live: 'Live: this is the running season members see. Ending it is the only move left here.',
    ended: 'Ended.',
  }
  return <p className="text-xs text-muted">{hint[state]}</p>
}
