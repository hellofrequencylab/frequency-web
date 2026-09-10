'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, QrCode, Zap } from 'lucide-react'
import { checkInEvent, type CheckInResult } from '@/app/(main)/events/actions'
import { showZapToast } from '@/components/zap-toast'
import { SPECIAL_INSTRUCTIONS_LABEL } from '@/lib/events/special-instructions'
import { checkInSurfaceState, formatCountdown, type CheckInSurfaceInput } from '@/lib/events/checkin-surface'

/**
 * THE HEADER'S CHECK-IN SURFACE — the countdown that becomes the door.
 *
 * Owner, 2026-09-10: one box, under Share | Manage | Edit, that counts down to the start and then
 * *"converts to the check in function for members"*, blended into the canvas with no border.
 *
 * ── WHY IT SITS WHERE IT SITS, AND WHY IT IS WIDE RATHER THAN TALL ────────────────────────────
 * `DetailTemplate`'s header band is `title (min-w-0) | actions (sm:shrink-0)`, so the actions
 * column takes its natural width and the H1 absorbs every pixel of the squeeze.
 *
 * 🔴 THE FIRST VERSION READ THAT CONSTRAINT TOO NARROWLY AND MADE IT WORSE. It capped the box at
 * `16rem` and let it grow DOWNWARD, on the reasoning that height is free and width is not. The
 * result was a four-deep stack in the right column — buttons, then EVENT STARTS IN, then the
 * clock, then two more rows — against a title that had one line and a lot of empty space beside
 * it. Narrow and tall does not stop a two-column header from looking broken; it is what made it
 * look broken (owner, 2026-09-10: *"the two columns are still fucked up. I want the info and
 * countdown to be on the same row"*).
 *
 * So the clock and the two facts are now COLUMNS OF ONE ROW: the box is short and wide instead of
 * narrow and tall, which is both a calmer header and less vertical distance between the title and
 * the content under it. It is a `flex-wrap` row, so where the column really is too tight the two
 * halves stack on their own rather than being forced to. Every piece inside is `whitespace-nowrap`
 * and the box sizes to its content, so it cannot creep wider than the ~305px it needs.
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
      className="mt-1 w-full rounded-card bg-canvas px-3 py-2.5 sm:w-auto sm:max-w-[24rem]"
      // A live region, because the box changes what it says while a member is looking at it: the
      // handover from countdown to control is the moment worth announcing, and the result of a
      // press is the other one.
      aria-live="polite"
    >
      {/* THE ROW. Two columns that size to their content and wrap to a stack only when they truly
          cannot fit, which is what "dynamically sized columns that stack nicely" asks for. */}
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        <div className="shrink-0 text-right">
          {state.kind === 'countdown' && (
            <>
              <p className="text-meta uppercase tracking-wide text-subtle">Event starts in</p>
              {/* `tabular-nums` is what keeps the box still: proportional digits change width as they
                  tick, and a header element that breathes once a second is worse than no clock. */}
              <p className="text-lead font-bold tabular-nums text-text">
                {remaining === null ? formatCountdown(state.startsAtMs - nowMs) : formatCountdown(state.startsAtMs - remaining)}
              </p>
            </>
          )}

          {state.kind === 'open' && !checkedIn && (
            <button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await checkInEvent(eventId)
                  setResult(res)
                  if (res.ok && !res.alreadyCheckedIn && res.zapsAwarded) {
                    showZapToast({ amount: res.zapsAwarded, label: 'Checked in' })
                  }
                })
              }
              className="inline-flex items-center justify-center gap-2 rounded-control bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              <Zap className="h-4 w-4 shrink-0" strokeWidth={2.5} />
              {pending ? 'Checking in…' : 'Check in'}
            </button>
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

        {/* TWO FACTS, TWO ROWS — never one wrapping sentence (owner, 2026-09-10).
            🔴 WHAT WAS WRONG, because it is not obvious from reading the old line. It was a single
            `inline-flex` <p> holding an icon and the sentence "Check in at the door to earn +25
            Zaps". A flex row lays the icon and the text out as two ITEMS, so when the sentence ran
            out of width it wrapped INSIDE its own item and the icon stayed vertically centred beside
            a two-line block — stranded at the far left of the box with a gap across to the text.
            That is the header "getting split up": not a layout that wrapped, a layout that orphaned.

            So each fact is now its own row, `whitespace-nowrap` so a row can never wrap internally,
            and the rows stack in a column that sizes to its widest child. The box still shrinks and
            grows with the column it sits in; what it will not do is come apart. */}
        {!checkedIn && zaps > 0 && (
          /* Left-aligned INSIDE its own column so the two icons stack under one another; the column
             as a whole still sits at the right-hand end of the row. */
          <div className="flex shrink-0 flex-col items-start gap-1 text-left text-meta text-muted">
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
      </div>

      {/* THE HOST'S DOOR NOTE, carried over from the retired `event-checkin` block (ADR-1309). It
          is shown only while there is a door to walk through, which is the same window the block
          gated itself to. `whitespace-pre-line` because the host typed it as lines. Left-aligned
          against the box's right-aligned chrome: a paragraph of parking directions is prose, and
          right-ragged prose is hard to read. */}
      {doorNote && state.kind !== 'countdown' && (
        <div className="mt-2 border-t border-border pt-2 text-left">
          <p className="text-meta font-semibold uppercase tracking-wide text-subtle">{SPECIAL_INSTRUCTIONS_LABEL}</p>
          <p className="mt-0.5 whitespace-pre-line text-meta text-text">{doorNote}</p>
        </div>
      )}
    </div>
  )
}
