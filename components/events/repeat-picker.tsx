'use client'

import { useId, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Label, labelClasses } from '@/components/ui/field'
import { Radio } from '@/components/ui/radio'
import { Select } from '@/components/ui/select'
import {
  REPEAT_WEEKDAYS,
  describeRepeat,
  formatRepeat,
  formatRepeatDraft,
  parseRepeat,
  repeatUntilDate,
  type RepeatFreq,
  type RepeatRule,
  type RepeatWeekday,
} from '@/lib/events/repeat-rule'

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE REPEAT PICKER (ADR-1299) — one control for the whole Repeats question.
//
// It replaces a four-button group (One-time / Every day / Weekly / Monthly) plus a separate "Ends
// on" date, which between them could not say the two things hosts kept asking for: "every other
// Wednesday" and "the third Thursday of the month".
//
// ── THE SHAPE, AND WHY IT IS THIS SHAPE ─────────────────────────────────────────────────────────
// ONE MENU AND ONE PANEL. The menu asks how often ("Does not repeat" / Daily / Weekly / Monthly /
// Yearly) and nothing else; choosing anything but the first opens the panel, which is the whole
// editor:
//
//   1. "Repeat every N <unit>", the unit being the word the menu already chose. One number.
//   2. The unit's own detail: weekday toggles for weekly, by-date vs by-weekday for monthly and
//      yearly. This is what "every third Thursday" is made of, and it is two taps from the menu.
//   3. AN END RULE WITH THREE ARMS: never, on a date, after N times. "After N" is not a
//      convenience — for a six-week course the host knows the count and not the date, and making
//      them compute it is where a series ends up one week short.
//
// 🔴 THERE WERE PRESETS HERE, AND THEY CAME OUT (owner, 2026-09-10: "I like the custom settings
// editor you created but I don't like the preset dropdowns. Those are confusing. Make it so only
// the Settings editor is showing with it set to 1 time, does not repeat as a default setting").
// The control shipped that morning led with a menu of START-DERIVED presets — "Weekly on
// Wednesday", "Every 2 weeks on Wednesday", "Monthly on the third Wednesday" — with the editor
// behind a "Custom…" option, which is what Google, Apple and Outlook all do. The reasoning was
// sound and the result was not: seven sentences in a dropdown is a paragraph you have to read, the
// editor was hidden exactly where a host would look for it, and "Custom" had to be a computed
// state ("the rule matches no preset") rather than a stored one, which needed an interval-bumping
// seed loop to stop the panel closing the instant it opened. All of that is gone. The menu now
// carries five short words and the editor is always the thing you are looking at.
//
// DEFAULT: does not repeat. The menu opens on it, the panel stays shut, and the sentence below
// reads "This happens once."
//
// And one rule that survives from the first design, per docs/CONTENT-VOICE.md: the panel prints the
// SENTENCE back. "Every 2 weeks on Wednesday, until December 30" is the only way a host can check
// what they built, and it is also the menu's accessible description, so the same words reach a
// screen reader that reach the page.
//
// ── ONE VALUE, NOT TWO ──────────────────────────────────────────────────────────────────────────
// The control emits ONE string: the RRULE value, plus `;UNTIL=YYYYMMDD` when the host picked an end
// date. That is transport, not storage — the server splits the UNTIL back into
// `events.recurrence_until` (lib/events/recurrence.ts `resolveSubmittedRepeat`) — and it exists so
// the whole Repeats question is one field. A form that carried the pattern and the end separately
// is how a rail ends up showing "Repeats until 30 December" beside a control that says the series
// never ends.
//
// Emptiness is a real value: "" means does not repeat.
//
// PRESENTATIONAL AND CONTROLLED. No fetches, no actions, no local truth: the parent owns `value`
// and re-renders. It renders a hidden input when given a `name`, so it works inside a FormData form
// (the settings rail's autosave) and as a controlled component (the create form) without a fork.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Sunday-first, matching REPEAT_WEEKDAYS and every calendar grid in the product. Single letters
 *  with a real name behind them: the letter is the affordance, the name is the accessible label,
 *  because "T" cannot distinguish Tuesday from Thursday for anyone who cannot see the row. */
const WEEKDAY_INITIAL: Record<RepeatWeekday, string> = {
  SU: 'S', MO: 'M', TU: 'T', WE: 'W', TH: 'T', FR: 'F', SA: 'S',
}
const WEEKDAY_FULL: Record<RepeatWeekday, string> = {
  SU: 'Sunday', MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday',
  TH: 'Thursday', FR: 'Friday', SA: 'Saturday',
}

const UNIT_LABEL: Record<RepeatFreq, { one: string; many: string }> = {
  DAILY: { one: 'day', many: 'days' },
  WEEKLY: { one: 'week', many: 'weeks' },
  MONTHLY: { one: 'month', many: 'months' },
  YEARLY: { one: 'year', many: 'years' },
}

const ORDINAL_LABELS: { value: string; label: string }[] = [
  { value: '1', label: 'first' },
  { value: '2', label: 'second' },
  { value: '3', label: 'third' },
  { value: '4', label: 'fourth' },
  { value: '-1', label: 'last' },
]

/** How the MENU says each frequency. Plain words, no arithmetic for the host to do in their head:
 *  the detail ("on Wednesday", "the third Thursday") is the panel's job and the sentence's job. */
const FREQ_LABEL: Record<RepeatFreq, string> = {
  DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly', YEARLY: 'Yearly',
}

/** The menu value for "does not repeat", which is the empty rule. A sentinel rather than '' so an
 *  <option> value is never the empty string, which some browsers treat as "no selection". */
const NONE = '__none__'

/** Which <weekday> of its month a date is, as a BYSETPOS: 1..4, or -1 when it is the last one. */
function setPosOf(anchor: Date): number {
  const day = anchor.getUTCDate()
  const monthLength = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)).getUTCDate()
  const week = Math.floor((day - 1) / 7) + 1
  return day + 7 > monthLength ? -1 : week
}

export function RepeatPicker({
  value,
  onChange,
  startsAt,
  name,
  disabled = false,
  label = 'Repeats',
  className = '',
}: {
  /** The current transport string: an RRULE value, optionally with `;UNTIL=YYYYMMDD`. Empty means
   *  the event does not repeat. */
  value: string
  onChange: (next: string) => void
  /** The event's start, as the ISO the row stores or the `YYYY-MM-DDTHH:mm` a datetime input holds.
   *  Every IMPLICIT part of a rule is derived from it — which weekday a weekly rule means, which day
   *  of the month a monthly one does — so a picker with no start yet still renders and simply leaves
   *  those parts to the server, which resolves them against the start once there is one. */
  startsAt?: string | null
  /** Render a hidden input under this name, for a form that reads its own FormData. */
  name?: string
  disabled?: boolean
  label?: string
  className?: string
}) {
  const groupId = useId()
  const rule = useMemo(() => parseRepeat(value), [value])
  const untilDate = useMemo(() => repeatUntilDate(value) ?? '', [value])
  const anchor = useMemo(() => {
    const d = startsAt ? new Date(startsAt) : null
    return d && !Number.isNaN(d.getTime()) ? d : null
  }, [startsAt])

  const emit = (nextRule: RepeatRule | null, nextUntil: string | null = untilDate) =>
    onChange(formatRepeatDraft(nextRule, nextRule ? nextUntil : null))

  /** The menu. "Does not repeat" clears the rule outright; a frequency either STARTS one from the
   *  event's own start date, or re-bases the existing one.
   *
   *  Re-basing rebuilds the parts that only make sense for the new frequency rather than carrying a
   *  BYSETPOS into a weekly rule where it means nothing. What it KEEPS is the interval and the end
   *  rule, because "every 2 weeks, 6 times" -> "every 2 months, 6 times" is one menu change to a
   *  host and should not silently become "every 1 month, forever". */
  function pickFreq(next: string) {
    if (next === NONE) {
      emit(null, null)
      return
    }
    const freq = next as RepeatFreq
    const base: RepeatRule = { freq, interval: rule?.interval ?? 1, count: rule?.count }
    if (freq === 'WEEKLY' && anchor) base.byDay = [REPEAT_WEEKDAYS[anchor.getUTCDay()]]
    if ((freq === 'MONTHLY' || freq === 'YEARLY') && anchor) base.byMonthDay = anchor.getUTCDate()
    if (freq === 'YEARLY' && anchor) base.byMonth = anchor.getUTCMonth() + 1
    emit(base)
  }

  function patch(next: Partial<RepeatRule>) {
    if (!rule) return
    emit({ ...rule, ...next })
  }

  function toggleWeekday(day: RepeatWeekday) {
    if (!rule || rule.freq !== 'WEEKLY') return
    const current = rule.byDay?.length
      ? rule.byDay
      : anchor
        ? [REPEAT_WEEKDAYS[anchor.getUTCDay()]]
        : []
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day]
    // A weekly rule with no day is not a rule. The anchor's own weekday is the floor, which is also
    // why it cannot be turned off: the event already happens that day (the engine treats the start
    // as occurrence one no matter what the rule says, so removing it would be a lie in the UI).
    patch({ byDay: next.length ? next : current })
  }

  const endMode = rule?.count !== undefined ? 'count' : untilDate ? 'on' : 'never'

  function pickEnd(mode: 'never' | 'on' | 'count') {
    if (!rule) return
    if (mode === 'never') {
      const { count: _drop, ...rest } = rule
      emit(rest as RepeatRule, null)
    } else if (mode === 'on') {
      const { count: _drop, ...rest } = rule
      emit(rest as RepeatRule, untilDate || defaultUntil(anchor))
    } else {
      emit({ ...rule, count: rule.count ?? 10 }, null)
    }
  }

  const summary = rule
    ? untilDate
      ? `${describeRepeat(rule, startsAt)}, until ${formatUntil(untilDate)}`
      : describeRepeat(rule, startsAt)
    : 'This happens once.'

  const selectedDays = rule?.byDay?.length
    ? rule.byDay
    : anchor
      ? [REPEAT_WEEKDAYS[anchor.getUTCDay()]]
      : []

  return (
    <div className={`space-y-2 ${className}`}>
      <Label className={`${labelClasses} block`} htmlFor={`${groupId}-freq`}>
        {label}
      </Label>

      {/* THE ONE MENU: how often, or not at all. Five short words, and every one of them is a
          frequency rather than a sentence about this event's own date — the detail is the panel's
          job, and the sentence at the bottom reads it all back. */}
      <Select
        id={`${groupId}-freq`}
        value={rule?.freq ?? NONE}
        onChange={(e) => pickFreq(e.target.value)}
        disabled={disabled}
        aria-describedby={`${groupId}-summary`}
        options={[
          // These are <option>s in a form control, not destinations, so the admin menu contract
          // (ADR-553/927) does not govern them. The annotation is what tells `pnpm check:menu` so.
          { value: NONE, label: 'Does not repeat' }, // menu-ok: form-control options, not menu rows
          ...(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as RepeatFreq[]).map((f) => ({
            value: f,
            label: FREQ_LABEL[f],
          })),
        ]}
      />

      {/* THE EDITOR. Open whenever the event repeats at all, shut when it does not — so the default
          state of this control is one menu reading "Does not repeat" and nothing else. */}
      {rule && (
        <div className="space-y-3 rounded-control border border-border bg-surface-elevated p-3">
          {/* ── Row 1: how often. The UNIT is the word the menu already chose, printed rather than
              re-asked: two controls that both say "weekly" is how a host ends up with a rule they
              did not mean. ── */}
          <div className="space-y-1">
            <Label className={labelClasses} htmlFor={`${groupId}-interval`}>
              Repeat every
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id={`${groupId}-interval`}
                type="number"
                min={1}
                max={99}
                inputMode="numeric"
                className="w-20"
                value={String(rule.interval)}
                disabled={disabled}
                onChange={(e) => patch({ interval: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })}
              />
              <span className="text-body-sm text-text">
                {rule.interval === 1 ? UNIT_LABEL[rule.freq].one : UNIT_LABEL[rule.freq].many}
              </span>
            </div>
          </div>

          {/* ── Row 2a: which weekdays (weekly only) ── */}
          {rule.freq === 'WEEKLY' && (
            <div className="space-y-1">
              <p className={labelClasses} id={`${groupId}-days-label`}>
                On these days
              </p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`${groupId}-days-label`}>
                {REPEAT_WEEKDAYS.map((day) => {
                  const active = selectedDays.includes(day)
                  return (
                    // The kit's own pair carries this exactly: `primarySoft` IS
                    // `bg-primary-bg` + `text-primary-strong` stepping up to the full amber on
                    // hover, and `secondary` is the bordered rest. Composing them keeps the tap
                    // floor, the press state and the focus ring in one place — a hand-rolled copy
                    // is how the Space hero's chip silently lost `tap-target` (see button.tsx).
                    <Button
                      key={day}
                      type="button"
                      size="sm"
                      variant={active ? 'primarySoft' : 'secondary'}
                      disabled={disabled}
                      aria-pressed={active}
                      onClick={() => toggleWeekday(day)}
                      className="size-9 shrink-0 rounded-full p-0 text-body-sm"
                    >
                      <span aria-hidden>{WEEKDAY_INITIAL[day]}</span>
                      {/* The letter cannot tell Tuesday from Thursday out loud, so the name rides
                          along as the button's accessible name. */}
                      <span className="sr-only">{WEEKDAY_FULL[day]}</span>
                    </Button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Row 2b: by date or by weekday (monthly + yearly) ── */}
          {(rule.freq === 'MONTHLY' || rule.freq === 'YEARLY') && anchor && (
            <div className="space-y-1.5">
              <p className={labelClasses} id={`${groupId}-month-label`}>
                Which day
              </p>
              <div className="space-y-1.5" role="radiogroup" aria-labelledby={`${groupId}-month-label`}>
                <Radio
                  name={`${groupId}-monthmode`}
                  label={`On day ${anchor.getUTCDate()} of the month`}
                  checked={rule.byDay === undefined}
                  disabled={disabled}
                  onChange={() => patch({ byDay: undefined, bySetPos: undefined, byMonthDay: anchor.getUTCDate() })}
                />
                <div className="flex flex-wrap items-center gap-2 text-body-sm text-text">
                  <Radio
                    name={`${groupId}-monthmode`}
                    label="On the"
                    checked={rule.byDay !== undefined}
                    disabled={disabled}
                    onChange={() =>
                      patch({
                        byMonthDay: undefined,
                        byDay: [REPEAT_WEEKDAYS[anchor.getUTCDay()]],
                        bySetPos: setPosOf(anchor),
                      })
                    }
                  />
                  <Select
                    aria-label="Which week of the month"
                    wrapperClassName="inline-block w-max max-w-full"
                    className="text-body-sm"
                    value={String(rule.bySetPos ?? setPosOf(anchor))}
                    disabled={disabled || rule.byDay === undefined}
                    onChange={(e) =>
                      patch({
                        byMonthDay: undefined,
                        byDay: rule.byDay ?? [REPEAT_WEEKDAYS[anchor.getUTCDay()]],
                        bySetPos: Number(e.target.value),
                      })
                    }
                    options={ORDINAL_LABELS}
                  />
                  <Select
                    aria-label="Which weekday"
                    wrapperClassName="inline-block w-max max-w-full"
                    className="text-body-sm"
                    value={rule.byDay?.[0] ?? REPEAT_WEEKDAYS[anchor.getUTCDay()]}
                    disabled={disabled || rule.byDay === undefined}
                    onChange={(e) =>
                      patch({
                        byMonthDay: undefined,
                        byDay: [e.target.value as RepeatWeekday],
                        bySetPos: rule.bySetPos ?? setPosOf(anchor),
                      })
                    }
                    options={REPEAT_WEEKDAYS.map((d) => ({ value: d, label: WEEKDAY_FULL[d] }))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Row 3: the end rule. Inside the panel now: with the presets gone there is no
              "plain" series that lives outside the editor, so every row of the question is in one
              box instead of two. ── */}
          <div className="space-y-1.5">
            <p className={labelClasses} id={`${groupId}-end-label`}>
              Ends
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2" role="radiogroup" aria-labelledby={`${groupId}-end-label`}>
              <Radio
                name={`${groupId}-end`}
                label="Never"
                checked={endMode === 'never'}
                disabled={disabled}
                onChange={() => pickEnd('never')}
              />
              <div className="flex items-center gap-2 text-body-sm text-text">
                <Radio
                  name={`${groupId}-end`}
                  label="On"
                  checked={endMode === 'on'}
                  disabled={disabled}
                  onChange={() => pickEnd('on')}
                />
                <Input
                  type="date"
                  aria-label="Repeat until"
                  className="w-40"
                  value={untilDate}
                  min={typeof startsAt === 'string' ? startsAt.slice(0, 10) : undefined}
                  disabled={disabled || endMode !== 'on'}
                  onChange={(e) => emit(rule, e.target.value || null)}
                />
              </div>
              <div className="flex items-center gap-2 text-body-sm text-text">
                <Radio
                  name={`${groupId}-end`}
                  label="After"
                  checked={endMode === 'count'}
                  disabled={disabled}
                  onChange={() => pickEnd('count')}
                />
                <Input
                  type="number"
                  min={1}
                  max={400}
                  inputMode="numeric"
                  aria-label="How many times"
                  className="w-20"
                  value={String(rule.count ?? 10)}
                  disabled={disabled || endMode !== 'count'}
                  onChange={(e) => patch({ count: Math.max(1, Math.min(400, Number(e.target.value) || 1)) })}
                />
                <span>times</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* THE SENTENCE. Named by `aria-describedby` on the menu above, so the same words a host reads
          are the words a screen reader announces when the control takes focus. */}
      <p id={`${groupId}-summary`} className="text-2xs text-muted" aria-live="polite">
        {summary}
      </p>

      {name ? <input type="hidden" name={name} value={rule ? formatRepeatDraft(rule, untilDate || null) : ''} /> : null}
    </div>
  )
}

/** A sensible first "ends on" when a host picks the date arm with no date yet: a year out, which is
 *  past every horizon the product materialises and reads as "for the foreseeable future" rather
 *  than as a number someone chose. */
function defaultUntil(anchor: Date | null): string {
  const base = anchor ?? new Date()
  const d = new Date(base)
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

/** "December 30, 2026" from a `YYYY-MM-DD`, read in UTC so a stored day never shifts by a zone. */
function formatUntil(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return day
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** The canonical rule a picker value means, for a caller that needs it without re-parsing. */
export function repeatRuleOf(value: string): string {
  const rule = parseRepeat(value)
  return rule ? formatRepeat(rule) : ''
}
