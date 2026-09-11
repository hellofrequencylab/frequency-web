'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, QrCode, Zap } from 'lucide-react'
import { checkInEvent, type CheckInResult } from '@/app/(main)/events/actions'
import { Button } from '@/components/ui/button'
import { showZapToast } from '@/components/zap-toast'
import { SPECIAL_INSTRUCTIONS_LABEL } from '@/lib/events/special-instructions'
import { checkInSurfaceState, formatCountdown, type CheckInSurfaceInput } from '@/lib/events/checkin-surface'

/**
 * THE HEADER'S CHECK-IN SURFACE — the countdown that becomes the door.
 *
 * Owner, 2026-09-10: one box, under Share | Manage | Edit, that counts down to the start and then
 * *"converts to the check in function for members"*, blended into the canvas with no border.
 *
 * ── WHY IT IS A NARROW STACK, AND WHAT DECIDES THAT ──────────────────────────────────────────
 * `DetailTemplate`'s header band is `title (min-w-0) | actions (sm:shrink-0)`. The actions column
 * is NOT a fixed width: it takes whatever its WIDEST CHILD needs, and the H1 gets the remainder.
 * This box is stacked under the Share | Manage | Edit row inside that column, so those two are
 * siblings competing to be the widest.
 *
 * 🔴 THAT IS THE WHOLE CONSTRAINT, AND TWO PASSES MISSED IT IN OPPOSITE DIRECTIONS.
 *   1. The first capped the box at `16rem` and grew it DOWNWARD, which made a four-deep stack in
 *      the right column beside a one-line title.
 *   2. The second read "put them on one row" as "make them two COLUMNS", which took the box to
 *      ~305px — WIDER than the ~235px button row above it. That made the box the widest child, so
 *      the actions column grew by ~70px and the title wrapped onto two lines (owner, 2026-09-10:
 *      *"the timer section pushes the title over and make it go two rows"*).
 *
 * The rule both passes needed: **stay no wider than the button row and this box costs the title
 * nothing.** Stacked, the widest line is "Check in at the door" at roughly 165px, well under the
 * ~235px the buttons already spend, so the column width is still decided by the buttons and the H1
 * keeps every pixel it had before this surface existed. That is why there is no `max-w` here — a
 * cap would be guessing at a number the CONTENT already answers. Keep it stacked, and keep every
 * line `whitespace-nowrap`, and the geometry takes care of itself.
 *
 * ── WHY IT IS A CLIENT COMPONENT AND WHAT IT STILL DOES NOT DECIDE ─────────────────────────────
 * A clock ticks, so this half must be client. Every GATE is resolved on the server by the page and
 * arrives as a resolved value: the host's switch, the window, the RSVP, the idempotency row. It
 * calls `checkInSurfaceState` and renders the answer, and it owns no rules of its own.
 *
 * 🔴 `startsAtMs` IS AN INSTANT, NOT A STRING. The page resolves it through `eventInstant(iso,
 * zone)`. Never rebuild it here from `starts_at`: that column holds the host's wall clock in UTC
 * parts, so `new Date(starts_at)` is a seven-hour lie in the event's own city (ADR-1150).
 *
 * ⚠️ `remaining` STARTS NULL AND THAT IS DELIBERATE. `Date.now()` during render is impure (the
 * repo's `react-hooks/purity` rule) and a server-rendered clock hydrates against a client clock
 * that has already moved. Null on the first paint, filled by the effect, is the pattern
 * `components/quest/season-countdown.tsx` established for exactly this.
 */
export function EventCheckInSurface({
  eventId,
  doorNote,
  ...gates
}: Omit<CheckInSurfaceInput, 'nowMs'> & {
  readonly eventId: string
  /** `events.details.specialInstructions` — parking, the gate code, what to bring. */
  readonly doorNote?: string | null
}) {
  const { startsAtMs } = gates
  const [remaining, setRemaining] = useState<number | null>(null)
  const [result, setResult] = useState<CheckInResult | null>(null)
  const [pending, start] = useTransition()

  // One ticker for the whole surface. It also drives the HANDOVER: when the clock reaches zero the
  // state below re-resolves, so the box turns into the control on its own rather than waiting for a
  // reload. `windowOpen` is still the server's answer, so the very first tick past zero can lead it
  // by up to a second; the action re-checks the window anyway, so the worst case is one refused
  // press, never an early check-in.
  useEffect(() => {
    const tick = () => setRemaining(Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Before the first tick there is no honest clock, so hold the server's own reading of "now": the
  // start instant, which renders the countdown at its full value rather than flashing 00:00:00.
  const nowMs = remaining ?? (startsAtMs ?? 0)
  const state = checkInSurfaceState({ ...gates, nowMs })

  // A successful press wins over the server's `alreadyCheckedIn`, which was read before it.
  const checkedIn = result?.ok === true || state.kind === 'done'

  if (state.kind === 'hidden') return null

  // Every surviving state carries the reward, so this reads it once for all four branches.
  const zaps = state.zaps
  const earned = result?.zapsAwarded ?? zaps

  return (
    /* NO BORDER, NO CARD FILL. `bg-canvas` is the page's own ground, so the box reads as part of
       the header band rather than a widget dropped into it — the owner's "blend it into background
       canvas without borders". Every skin redeclares --color-canvas, so naming the token is the
       only correct move (never a hex). */
    <div
      className="mt-1 flex w-full flex-col items-end gap-1.5 rounded-card bg-canvas px-3 py-2.5 sm:w-auto"
      // A live region, because the box changes what it says while a member is looking at it: the
      // handover from countdown to control is the moment worth announcing, and the result of a
      // press is the other one.
      aria-live="polite"
    >
      {/* THE COUNTER, and whatever it becomes. `items-end` on the parent keeps its right edge flush
          with the rows below it, so the box reads as one block rather than two loose pieces. */}
      <div className="text-right">
        {state.kind === 'countdown' && (
          <>
            {/* `eyebrow`, the ROLE, not `text-meta uppercase tracking-wide` spelled out. Both of
                these labels were hand-rolled when this component was written, which pushed the
                `handrolled-eyebrow` ratchet from 481 to 482 and left `main` failing `checks` for
                every PR in the repo. The role carries size, tracking and weight together, so it
                is also the only way the two labels stay identical to each other. */}
            <p className="eyebrow text-subtle">Event starts in</p>
            {/* `tabular-nums` is what keeps the box still: proportional digits change width as they
                tick, and a header element that breathes once a second is worse than no clock. */}
            <p className="text-lead font-bold tabular-nums text-text">
              {remaining === null ? formatCountdown(state.startsAtMs - nowMs) : formatCountdown(state.startsAtMs - remaining)}
            </p>
          </>
        )}

        {state.kind === 'open' && !checkedIn && (
          /* THE KIT BUTTON, NOT A HAND-ROLLED COPY OF IT. Spelling the amber out is `primary × md`
             written by hand — the exact bucket `LIVE-114` holds at zero, so it fails
             `check:backlog` and re-opens a closed row. The primitive also carries three things a
             copy drops silently: `tap-target` (the `--tap-min` touch floor), `press` (the one
             sanctioned pressed look) and `lift-1`.

             `loading` rather than a swapped label: the primitive marks the control `aria-busy` and
             disables it while LEAVING THE LABEL ALONE, because a pending state must not change a
             button's width (INTERACTION-STATES §4 rule 3). That is the same rule `tabular-nums`
             enforces on the clock above it, and it matters more here than in most places: a
             control that resizes mid-press moves the whole header column around it. */
          <Button
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await checkInEvent(eventId)
                setResult(res)
                if (res.ok && !res.alreadyCheckedIn && res.zapsAwarded) {
                  showZapToast({ amount: res.zapsAwarded, label: 'Checked in' })
                }
              })
            }
          >
            <Zap className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            Check in
          </Button>
        )}

        {checkedIn && (
          <div className="inline-flex items-center justify-center gap-2 rounded-control bg-success-bg px-4 py-2 text-body-sm font-semibold text-success">
            <Check className="h-4 w-4 shrink-0" />
            {earned > 0 ? `Checked in · +${earned} Zaps` : 'Checked in'}
          </div>
        )}

        {state.kind === 'waiting' && (
          /* The door is open and this viewer cannot walk through it: signed out, or holding no going
             seat. Say so plainly and leave the sign-in and the RSVP where they already are, in the
             Join box. A second sign-in door here would be the scatter this surface removes. */
          <p className="text-body-sm font-semibold text-text">Check-in is open</p>
        )}
      </div>

      {/* TWO FACTS, TWO ROWS, DIRECTLY UNDER THE COUNTER (owner, 2026-09-10: *"Check in at the door
          and Earn 25 Zaps should both be underneath the counter"*).

          🔴 THEY ARE NOT A SECOND COLUMN. Putting them beside the counter is what made this box
          ~305px wide and pushed the title onto two lines; see the geometry note at the top. Under
          it, they cost the header nothing.

          🔴 AND NEVER ONE WRAPPING SENTENCE. The original was a single `inline-flex` <p> holding an
          icon and "Check in at the door to earn +25 Zaps". A flex row lays the icon and the text
          out as two ITEMS, so when the sentence ran out of width it wrapped INSIDE its own item and
          the icon stayed vertically centred beside a two-line block, stranded at the far left with
          a gap across to the text. That is a layout that orphaned, not one that wrapped.

          So each fact is its own row and `whitespace-nowrap`, which also makes "Check in at the
          door" the box's widest line and therefore the thing that sets its width. */}
      {!checkedIn && zaps > 0 && (
        /* Left-aligned inside its own block so the two icons stack under one another; the block as
           a whole sits flush right with the counter above it. */
        <div className="flex flex-col items-start gap-1 text-left text-meta text-muted">
          {/* 🔴 BOTH ROWS, ALWAYS — including the `open` state (owner, 2026-09-10). An earlier pass
              hid the door row there, reasoning that the button directly above already says Check
              in. That reasoning treated the rows as two independent labels. They are not: this is
              ONE two-part sentence broken across two lines, and "Earn 25 Zaps" on its own is a
              fragment with nothing to attach to. Dropping either half is dropping half a sentence,
              so the pair travels together in every state that prints it. */}
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <QrCode aria-hidden className="h-3.5 w-3.5 shrink-0 text-subtle" />
            Check in at the door
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Zap aria-hidden className="h-3.5 w-3.5 shrink-0 text-primary" />
            Earn {zaps} Zaps
          </span>
        </div>
      )}

      {/* THE HOST'S DOOR NOTE, carried over from the retired `event-checkin` block (ADR-1309). It
          is shown only while there is a door to walk through, which is the same window the block
          gated itself to. `whitespace-pre-line` because the host typed it as lines. Left-aligned:
          a paragraph of parking directions is prose, and right-ragged prose is hard to read.
          `w-full` so the rule spans the box rather than the note's own text width. */}
      {doorNote && state.kind !== 'countdown' && (
        <div className="mt-1 w-full border-t border-border pt-2 text-left">
          <p className="eyebrow text-subtle">{SPECIAL_INSTRUCTIONS_LABEL}</p>
          <p className="mt-0.5 whitespace-pre-line text-meta text-text">{doorNote}</p>
        </div>
      )}
    </div>
  )
}
