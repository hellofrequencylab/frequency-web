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
  matchRepeatPreset,
  parseRepeat,
  repeatPresets,
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
// Google Calendar, Apple Calendar, Outlook and the design-system components that follow them all
// converge on the same three ideas, and the convergence is the finding:
//
//   1. ONE MENU OF DATE-DERIVED PRESETS, then "Custom" one tap away. The presets are computed from
//      the start the host already chose — "Weekly on Wednesday", "Every 2 weeks on Wednesday",
//      "Monthly on the third Wednesday", "Annually on September 16" — so the common cases need no
//      panel at all AND the ambiguity is gone from the label. This is the half that cannot be
//      retrofitted onto a static list: "Monthly" alone means "the 16th" to the software and "the
//      third Wednesday" to the host, and the only fix is to say which in the option.
//   2. A CUSTOM PANEL OF THREE ROWS: "Repeat every N <unit>", then the unit's own detail (weekday
//      toggles for weekly; by-date vs by-weekday for monthly and yearly), then the end rule.
//   3. AN END RULE WITH THREE ARMS: never, on a date, after N times. "After N" is not a
//      convenience — for a six-week course the host knows the count and not the date, and making
//      them compute it is where a series ends up one week short.
//
// And one rule that is ours rather than theirs, from docs/CONTENT-VOICE.md: the panel prints the
// SENTENCE back. "Every 2 weeks on Wednesday, until December 30" is the only way a host can check
// what they built, and it is also the control group's accessible description, so the same words
// reach a screen reader that reach the page.
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

const CUSTOM = '__custom__'

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
   *  EVERY preset and every implicit part of a rule is derived from it, so a picker with no start
   *  yet falls back to bare Daily / Weekly / Monthly options rather than guessing a weekday. */
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
  const presets = useMemo(() => repeatPresets(startsAt), [startsAt])
  const preset = useMemo(() => matchRepeatPreset(rule, startsAt), [rule, startsAt])
  const anchor = useMemo(() => {
    const d = startsAt ? new Date(startsAt) : null
    return d && !Number.isNaN(d.getTime()) ? d : null
  }, [startsAt])

  // "Custom" is not a stored state — it is "the rule does not match any preset". A host who opens
  // the panel on a preset therefore sees that preset's own settings loaded, which is what makes
  // "every 2 weeks" -> "every 3 weeks" a one-field edit rather than a rebuild.
  const isCustom = !!rule && !preset

  const emit = (nextRule: RepeatRule | null, nextUntil: string | null = untilDate) =>
    onChange(formatRepeatDraft(nextRule, nextRule ? nextUntil : null))

  function pickPreset(id: string) {
    if (id === CUSTOM) {
      // Seed the panel from whatever is selected, so opening Custom never blanks a host's choice.
      const seed: RepeatRule = rule
        ? { ...rule }
        : anchor
          ? { freq: 'WEEKLY', interval: 1, byDay: [REPEAT_WEEKDAYS[anchor.getUTCDay()]] }
          : { freq: 'WEEKLY', interval: 1 }
      // 🔴 A PRESET-SHAPED SEED MUST BECOME NOT-A-PRESET, or the panel closes again the moment it
      // opens: `isCustom` is "the rule matches no preset", not a stored flag. Bumping the interval
      // is the smallest honest change and is what a host opening Custom came for — but it has to
      // KEEP bumping, because +1 from the weekly preset lands exactly on the fortnightly one, and a
      // single bump would have made "Custom…" a no-op on the most common starting point. Bounded so
      // a menu that somehow presets every interval cannot spin.
      let seeded = seed
      for (let i = 0; i < 8 && matchRepeatPreset(seeded, startsAt); i++) {
        seeded = { ...seeded, interval: (seeded.interval || 1) + 1 }
      }
      emit(seeded)
      return
    }
    emit(presets.find((p) => p.id === id)?.rule ?? null, untilDate)
  }

  function patch(next: Partial<RepeatRule>) {
    if (!rule) return
    emit({ ...rule, ...next })
  }

  /** Switching frequency rebuilds the parts that only make sense for the new one, rather than
   *  carrying a BYSETPOS into a weekly rule where it means nothing. */
  function pickFreq(freq: RepeatFreq) {
    if (!rule) return
    const base: RepeatRule = { freq, interval: rule.interval, count: rule.count }
    if (freq === 'WEEKLY' && anchor) base.byDay = [REPEAT_WEEKDAYS[anchor.getUTCDay()]]
    if ((freq === 'MONTHLY' || freq === 'YEARLY') && anchor) base.byMonthDay = anchor.getUTCDate()
    if (freq === 'YEARLY' && anchor) base.byMonth = anchor.getUTCMonth() + 1
    emit(base)
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
      <Label className={`${labelClasses} block`} htmlFor={`${groupId}-preset`}>
        {label}
      </Label>

      <Select
        id={`${groupId}-preset`}
        value={isCustom ? CUSTOM : (preset?.id ?? 'none')}
        onChange={(e) => pickPreset(e.target.value)}
        disabled={disabled}
        aria-describedby={`${groupId}-summary`}
        options={[
          ...presets.map((p) => ({ value: p.id, label: p.label })),
          { value: CUSTOM, label: 'Custom…' },
        ]}
      />

      {isCustom && rule && (
        <div className="space-y-3 rounded-control border border-border bg-surface-elevated p-3">
          {/* ── Row 1: how often ── */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className={labelClasses} htmlFor={`${groupId}-interval`}>
                Repeat every
              </Label>
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
            </div>
            <div className="min-w-32 flex-1 space-y-1">
              <Label className={labelClasses} htmlFor={`${groupId}-freq`}>
                Unit
              </Label>
              <Select
                id={`${groupId}-freq`}
                value={rule.freq}
                disabled={disabled}
                onChange={(e) => pickFreq(e.target.value as RepeatFreq)}
                options={(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as RepeatFreq[]).map((f) => ({
                  value: f,
                  label: rule.interval === 1 ? UNIT_LABEL[f].one : UNIT_LABEL[f].many,
                }))}
              />
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
        </div>
      )}

      {/* ── Row 3: the end rule. Outside the custom panel, because "until the end of term" is a
          question a host answers on a plain weekly series just as often as on a custom one. ── */}
      {rule && (
        <div className="space-y-1.5 pt-1">
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
