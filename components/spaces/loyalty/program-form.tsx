'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Label, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { isError } from '@/lib/action-result'
import { saveLoyaltyProgram } from '@/lib/loyalty/actions'
import { LOYALTY_LIMITS, SPACE_CHECKIN_ZAPS, type LoyaltyProgram } from '@/lib/loyalty/program'

// OWNER REGULARS EDITOR (LIVE-940, docs/LOYALTY.md). The owner names the reward, gives it a value, picks
// the card length and the welcome stamps, and turns the program on. Saved through the owner-gated
// saveLoyaltyProgram action as a replace-by-space. Copy obeys CONTENT-VOICE: plain labels, no em dashes.

const STAMP_CHOICES = Array.from(
  { length: LOYALTY_LIMITS.stampsMax - LOYALTY_LIMITS.stampsMin + 1 },
  (_, i) => LOYALTY_LIMITS.stampsMin + i,
)

export function LoyaltyProgramForm({
  spaceId,
  initial,
  blocker,
  hasPin,
}: {
  spaceId: string
  initial: LoyaltyProgram
  /** Why the Space cannot turn the program on yet, or null. The form still saves a draft. */
  blocker: 'plan' | null
  hasPin: boolean
}) {
  const router = useRouter()
  const [on, setOn] = useState(initial.status === 'on')
  const [rewardTitle, setRewardTitle] = useState(initial.rewardTitle)
  const [valueDollars, setValueDollars] = useState(initial.rewardValueCents ? String(initial.rewardValueCents / 100) : '')
  const [rewardNote, setRewardNote] = useState(initial.rewardNote ?? '')
  const [stampsRequired, setStampsRequired] = useState(initial.stampsRequired)
  const [welcomeStamps, setWelcomeStamps] = useState(initial.welcomeStamps)
  const [geofence, setGeofence] = useState(initial.geofence)
  const [surprise, setSurprise] = useState(initial.surpriseOdds !== 0)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startSave] = useTransition()

  function touch() {
    setSaved(false)
    setError(null)
  }

  function save() {
    const cents = Math.round(Number(valueDollars || 0) * 100)
    startSave(async () => {
      const result = await saveLoyaltyProgram(spaceId, {
        status: on ? 'on' : 'off',
        rewardTitle,
        rewardValueCents: Number.isFinite(cents) ? cents : 0,
        rewardNote,
        stampsRequired,
        welcomeStamps,
        geofence,
        surpriseOdds: surprise ? LOYALTY_LIMITS.surpriseOdds : 0,
      })
      if (isError(result)) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pending) save()
      }}
    >
      <div className="space-y-4 rounded-card border border-border bg-surface p-5 lift-1">
        <div>
          <Label htmlFor="loyalty-reward">The reward</Label>
          <Input
            id="loyalty-reward"
            value={rewardTitle}
            maxLength={LOYALTY_LIMITS.titleMax}
            placeholder="Free coffee"
            onChange={(e) => {
              setRewardTitle(e.target.value)
              touch()
            }}
          />
          <p className="mt-1 text-meta text-subtle">A thing, not a percentage. People remember a free item.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="loyalty-value">Its value in dollars</Label>
            <Input
              id="loyalty-value"
              inputMode="decimal"
              value={valueDollars}
              placeholder="6"
              onChange={(e) => {
                setValueDollars(e.target.value.replace(/[^0-9.]/g, ''))
                touch()
              }}
            />
            <p className="mt-1 text-meta text-subtle">Shown on the card. Five to ten percent of a typical visit works well.</p>
          </div>
          <div>
            <Label htmlFor="loyalty-stamps">Visits to earn it</Label>
            <Select
              id="loyalty-stamps"
              value={stampsRequired}
              options={STAMP_CHOICES.map((n) => ({ value: n, label: `${n} visits` }))}
              onChange={(e) => {
                setStampsRequired(Number(e.target.value))
                touch()
              }}
            />
            <p className="mt-1 text-meta text-subtle">Six is the sweet spot for a weekly stop.</p>
          </div>
        </div>

        <div>
          <Label htmlFor="loyalty-welcome">Welcome stamps on a new card</Label>
          <Select
            id="loyalty-welcome"
            value={welcomeStamps}
            options={[
              { value: 0, label: 'None' },
              { value: 1, label: '1 stamp, the first one is on you' },
              { value: 2, label: '2 stamps' },
            ]}
            onChange={(e) => {
              setWelcomeStamps(Number(e.target.value))
              touch()
            }}
          />
          <p className="mt-1 text-meta text-subtle">A card that starts with a stamp gets finished far more often.</p>
        </div>

        <div>
          <Label htmlFor="loyalty-note">A line for the card (optional)</Label>
          <Textarea
            id="loyalty-note"
            rows={2}
            value={rewardNote}
            maxLength={LOYALTY_LIMITS.noteMax}
            placeholder="Any drink on the menu, any size."
            onChange={(e) => {
              setRewardNote(e.target.value)
              touch()
            }}
          />
        </div>

        <Checkbox
          checked={surprise}
          onChange={(e) => {
            setSurprise(e.target.checked)
            touch()
          }}
          label="One visit in ten earns a surprise stamp (the odds are printed on the card)"
          wrapperClassName="flex"
        />

        <Checkbox
          checked={geofence && hasPin}
          disabled={!hasPin}
          onChange={(e) => {
            setGeofence(e.target.checked)
            touch()
          }}
          label="Only count a check-in from inside the shop (within 200 m of your map pin)"
          wrapperClassName="flex"
        />
        {!hasPin && <p className="text-meta text-muted">Add a map pin under Profile to use this. Check-ins work without one.</p>}

        <Checkbox
          checked={on}
          disabled={blocker !== null && !on}
          onChange={(e) => {
            setOn(e.target.checked)
            touch()
          }}
          label="Regulars is on"
          wrapperClassName="flex"
        />
        {blocker === 'plan' && (
          <p className="text-meta text-muted">Regulars is a Business feature. The draft saves now and turns on with the plan.</p>
        )}
      </div>

      <p className="text-meta text-subtle">
        Every check-in at your door code stamps the card and pays the member {SPACE_CHECKIN_ZAPS} Zaps, once a day. Zaps cost you
        nothing. A full card earns the reward; the member shows a code at the counter and you mark it handed out below.
      </p>

      {error && (
        <p className="rounded-card bg-danger-bg px-3 py-2 text-body-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving
            </>
          ) : (
            'Save Regulars'
          )}
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-body-sm text-success">
            <Check className="h-4 w-4" aria-hidden /> Saved
          </span>
        )}
      </div>
    </form>
  )
}
