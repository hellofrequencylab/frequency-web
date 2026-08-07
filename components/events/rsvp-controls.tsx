'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, Clock, Star, Minus, Plus, UserPlus, X } from 'lucide-react'
import { setRsvpStatus, setRsvpPlusOnes } from '@/app/(main)/events/actions'
import { setEventRsvpDepth } from '@/app/(main)/events/[slug]/social-actions'
import {
  loadGuestQuestionnaire,
  saveGuestAnswer,
  type GuestQuestionnaire,
} from '@/app/(main)/events/[slug]/manage/questionnaire-actions'
import type { EventQuestion } from '@/lib/events/questions'
import { IconButton } from '@/components/ui/icon-button'
import { Select } from '@/components/ui/select'
import { Input, Textarea } from '@/components/ui/field'

// Detail-page RSVP controls (event Detail template). Three warm states a member
// can move between — Going · Interested (maybe) · (Join waitlist when full) —
// plus a small "bringing guests" stepper once they're confirmed going.
//
// EVENTS-REWORK A1 depth (added): optional +1 NAMES (the host may require them),
// and "Request to join" for APPROVAL-REQUIRED events (invited guests skip the
// queue). Both ride the frozen rsvp-depth data layer via setEventRsvpDepth; the
// simple three-state toggle keeps using the existing lean actions so its capacity /
// email side-effects are untouched.
//
// Capacity-honest, never pushy (EVENTS-SYSTEM §4): the server decides full /
// waitlist and the page passes it in; this control never fetches. plus_ones is an
// informational headcount for the host — it does NOT consume seats. Self-authorized
// throughout: every action edits only the caller's own RSVP row.

const MAX_PLUS_ONES = 5

// Shown when the RSVP write did not land. Plain and actionable: it says what happened and what
// to do, without narrating how the member feels about it (docs/CONTENT-VOICE.md).
const RSVP_SAVE_ERROR = 'We could not save your RSVP. Check your connection and try again.'

type Status = 'going' | 'maybe' | 'waitlist' | 'not_going'

export function RsvpControls({
  eventId,
  slug,
  status,
  plusOnes,
  isFull,
  requireNames = false,
  plusOneNames = [],
  requiresApproval = false,
  approvalStatus = 'none',
  allowGoing = true,
  initialNote = '',
  onGoingIntercept = null,
  onRecorded = null,
}: {
  eventId: string
  /** Needed for revalidation on the depth actions; optional for the lean toggle. */
  slug?: string
  /** The viewer's current RSVP status (null = no RSVP yet → 'not_going'). */
  status: Status | null
  /** Guests the viewer is bringing (only meaningful when going). */
  plusOnes: number
  /** Event is at capacity — a fresh "Going" joins the waitlist instead. */
  isFull: boolean
  /** Host requires the names of any +1s (A1). */
  requireNames?: boolean
  /** The viewer's saved +1 names (prefill). */
  plusOneNames?: string[]
  /** Event needs host approval to join (A1). Invited guests skip the queue. */
  requiresApproval?: boolean
  /** The viewer's approval state ('pending' shows the calm "request sent" line). */
  approvalStatus?: 'none' | 'pending' | 'approved'
  /** False on a TICKETED event for a viewer whose way in is a ticket (the unified RSVP box,
   *  ADR-826): the Going segment hides — buying/claiming the ticket IS "going" — while Maybe
   *  and Can't go stay answerable, and a guest can still change their answer any time. */
  allowGoing?: boolean
  /** The viewer's already-shared RSVP note (server-loaded). Non-empty → the note box starts
   *  COLLAPSED as "Shared with the group" instead of re-offering the composer every load. */
  initialNote?: string
  /** RSVP + payment flow (ADR-826): when set and the viewer is not already going, tapping
   *  Going calls this instead of recording — the parent slides its payment phase open and
   *  records the RSVP as part of completing it. Maybe / Can't go record normally. */
  onGoingIntercept?: (() => void) | null
  /** Notified after an answer records (Events block popup): a host surface that OWNS the
   *  `status` / `approvalStatus` props (a dialog holding them in state, not a page that
   *  revalidates) updates them from this so the control reflects the new answer. The event
   *  page never sets it — absent, behavior is exactly as before. */
  onRecorded?:
    | ((next: {
        status: Status
        approvalStatus?: 'none' | 'pending' | 'approved'
        plusOnes?: number
      }) => void)
    | null
}) {
  const [pending, startTransition] = useTransition()
  const [names, setNames] = useState<string[]>(plusOneNames)
  const [saveError, setSaveError] = useState<string | null>(null)
  const current: Status = status ?? 'not_going'
  const isGoing = current === 'going'
  const isMaybe = current === 'maybe'
  const isWaitlisted = current === 'waitlist'
  // "Can't go" is pressed only on an EXPLICIT not_going — never for a member who
  // hasn't answered yet (status null also reads as not_going for the toggle logic,
  // but we don't want the decline segment lit before they've chosen).
  const isNotGoing = status === 'not_going'
  const isPending = requiresApproval && approvalStatus === 'pending'

  // A1 questionnaire: once the guest has expressed any interest, surface the host's
  // questions and let them answer (saved per question via setAnswer). Self-loaded so
  // the host page doesn't need to thread questions through — the action returns an
  // empty set for events with no questionnaire, so this stays invisible otherwise.
  const hasResponded = isGoing || isMaybe || isWaitlisted || isPending
  const [questionnaire, setQuestionnaire] = useState<GuestQuestionnaire | null>(null)
  useEffect(() => {
    if (!hasResponded) return
    let active = true
    loadGuestQuestionnaire(eventId).then((q) => {
      if (active) setQuestionnaire(q)
    })
    return () => {
      active = false
    }
  }, [hasResponded, eventId])
  const questionnaireBlock =
    questionnaire && questionnaire.questions.length > 0 ? (
      <EventQuestionnaire
        eventId={eventId}
        slug={slug ?? ''}
        questions={questionnaire.questions}
        initialAnswers={questionnaire.answers}
      />
    ) : null

  const go = (intent: 'going' | 'maybe' | 'not_going') =>
    startTransition(async () => {
      const done = setRsvpStatus(eventId, intent, { slug })
      // Without a listener, keep the original fire-and-forget (the page revalidates itself).
      if (!onRecorded) return
      await done
      // A fresh Going on a full event lands on the waitlist server-side — report what recorded,
      // so a state-owning parent (the Events block popup) mirrors the server exactly.
      const recorded: Status =
        intent === 'going' && isFull && !isGoing && !isWaitlisted ? 'waitlist' : intent
      onRecorded({ status: recorded })
    })

  // Approval-required join → write a 'pending' RSVP through the depth layer.
  // The depth action reports whether the row actually saved; a failed write must not leave the
  // member looking at a confirmed state the host will never see.
  const requestToJoin = () =>
    startTransition(async () => {
      const res = await setEventRsvpDepth(eventId, slug ?? '', {
        status: 'going',
        approvalStatus: 'pending',
      })
      if (!res.ok) {
        setSaveError(RSVP_SAVE_ERROR)
        return
      }
      setSaveError(null)
      onRecorded?.({ status: 'going', approvalStatus: 'pending' })
    })

  const setGuests = (n: number) =>
    startTransition(async () => {
      const done = setRsvpPlusOnes(eventId, n)
      if (!onRecorded) return
      await done
      onRecorded({ status: 'going', plusOnes: Math.max(0, Math.min(MAX_PLUS_ONES, n)) })
    })

  // Save +1 names through the depth layer (keeps plus_ones in sync = names.length).
  const saveNames = (next: string[]) =>
    startTransition(async () => {
      const res = await setEventRsvpDepth(eventId, slug ?? '', {
        status: 'going',
        plusOneNames: next.filter((n) => n.trim().length > 0),
      })
      setSaveError(res.ok ? null : RSVP_SAVE_ERROR)
    })

  // The "Going" segment doubles as the waitlist CTA when the event is full and
  // the viewer isn't already confirmed/waitlisted — same intent, honest framing.
  const goingIsWaitlist = isFull && !isGoing && !isWaitlisted
  const goingLabel = isGoing
    ? 'Going'
    : isWaitlisted
      ? 'On waitlist'
      : goingIsWaitlist
        ? 'Join waitlist'
        : 'Going'
  const GoingIcon = isWaitlisted || goingIsWaitlist ? Clock : Check

  // Tapping the active segment again steps back out (toggle off) to 'not_going'. With an
  // intercept installed, a FRESH Going hands off to the parent's payment phase instead.
  const onGoing = () => {
    if (onGoingIntercept && !isGoing && !isWaitlisted) {
      onGoingIntercept()
      return
    }
    go(isGoing || isWaitlisted ? 'not_going' : 'going')
  }
  const onMaybe = () => go(isMaybe ? 'not_going' : 'maybe')
  // Can't go is an explicit decline; tapping it just records 'not_going' (idempotent).
  const onCantGo = () => go('not_going')

  // ── Approval-required, not yet in: a single "Request to join" button ──
  if (requiresApproval && !isGoing && !isWaitlisted && !isMaybe && !isPending) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={requestToJoin}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          <UserPlus className="h-4 w-4" />
          Request to join
        </button>
        <p className="text-2xs text-muted">The host approves who joins this one.</p>
      </div>
    )
  }

  if (isPending) {
    return (
      <div className="space-y-3">
        <div className="rounded-card border border-border bg-surface px-4 py-3">
          <p className="flex items-center gap-2 text-body-sm font-medium text-text">
            <Clock className="h-4 w-4 text-subtle" />
            Request sent. The host will confirm.
          </p>
        </div>
        {questionnaireBlock}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* A failed RSVP write says so here rather than silently leaving the control looking saved.
          role="alert" so it is announced the moment it appears. */}
      {saveError && (
        <p role="alert" className="text-body-sm text-danger">
          {saveError}
        </p>
      )}
      {/* Segmented RSVP control: three equal columns, each an icon stacked OVER its label so
          the longest word ("Can't go") never wraps and the three read as one tidy switch. */}
      <div
        role="group"
        aria-label="RSVP"
        className={`grid w-full max-w-sm gap-1 rounded-card border border-border bg-surface p-1 ${
          allowGoing ? 'grid-cols-3' : 'grid-cols-2'
        }`}
      >
        {allowGoing && (
          <button
            type="button"
            onClick={onGoing}
            disabled={pending}
            aria-pressed={isGoing || isWaitlisted}
            className={`flex flex-col items-center justify-center gap-1 rounded-control px-2 py-2.5 text-meta font-semibold transition-colors disabled:opacity-60 ${
              isGoing
                ? 'bg-success-bg text-success'
                : isWaitlisted
                  ? 'bg-surface-elevated text-muted'
                  : 'text-muted hover:bg-surface-elevated hover:text-text'
            }`}
          >
            <GoingIcon className="h-5 w-5" />
            <span className="text-center leading-tight">{goingLabel}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onMaybe}
          disabled={pending}
          aria-pressed={isMaybe}
          className={`flex flex-col items-center justify-center gap-1 rounded-control px-2 py-2.5 text-meta font-semibold transition-colors disabled:opacity-60 ${
            isMaybe
              ? 'bg-primary-bg text-primary-strong'
              : 'text-muted hover:bg-surface-elevated hover:text-text'
          }`}
        >
          <Star className="h-5 w-5" />
          <span className="text-center leading-tight">Maybe</span>
        </button>

        <button
          type="button"
          onClick={onCantGo}
          disabled={pending}
          aria-pressed={isNotGoing}
          className={`flex flex-col items-center justify-center gap-1 rounded-control px-2 py-2.5 text-meta font-semibold transition-colors disabled:opacity-60 ${
            isNotGoing
              ? 'bg-surface-elevated text-text'
              : 'text-muted hover:bg-surface-elevated hover:text-text'
          }`}
        >
          <X className="h-5 w-5" />
          <span className="text-center leading-tight">Can&rsquo;t go</span>
        </button>
      </div>

      {(isGoing || isWaitlisted) && (
        <p className="text-2xs text-muted">
          {isWaitlisted
            ? 'You’re on the waitlist. Tap Going to step out. We’ll let you in if a spot opens.'
            : 'Tap Going again to undo.'}
        </p>
      )}

      {/* Plus-ones: only a confirmed attendee can bring guests (informational
          headcount for the host; doesn't take seats). With names required, the
          stepper is replaced by a name list so the count tracks the names. */}
      {isGoing && requireNames ? (
        <PlusOneNames pending={pending} names={names} setNames={setNames} onSave={saveNames} />
      ) : isGoing ? (
        <div className="inline-flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2">
          <span className="text-body-sm font-medium text-muted">
            Bringing {plusOnes > 0 ? `+${plusOnes}` : 'no'} {plusOnes === 1 ? 'guest' : 'guests'}
          </span>
          <div className="inline-flex items-center gap-1">
            <IconButton
              variant="bordered"
              label="One fewer guest"
              onClick={() => setGuests(plusOnes - 1)}
              disabled={pending || plusOnes <= 0}
            >
              <Minus className="h-3.5 w-3.5" />
            </IconButton>
            <span className="w-6 text-center text-body-sm font-semibold tabular-nums text-text">
              {plusOnes}
            </span>
            <IconButton
              variant="bordered"
              label="One more guest"
              onClick={() => setGuests(plusOnes + 1)}
              disabled={pending || plusOnes >= MAX_PLUS_ONES}
            >
              <Plus className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>
      ) : null}

      {/* An optional note the member leaves when they RSVP — it rides along as the
          body of their "RSVP'd" entry in the event conversation. Only a confirmed
          attendee posts to the feed, so the note field shows only when going. */}
      {isGoing && <RsvpNote eventId={eventId} slug={slug} initialNote={initialNote} />}

      {questionnaireBlock}
    </div>
  )
}

// Optional "say something to the group" note attached to a Going RSVP (item: leave a
// comment when you RSVP). Saving calls the same setRsvpStatus('going') with the note
// as `message`, which upserts the member's single activity-feed entry — idempotent, no
// spam. Left untouched, it never fires, so a plain RSVP keeps any earlier note.
// Once shared, the whole box COLLAPSES to the single "Shared with the group" line
// (owner spec) with a quiet Edit to reopen it.
function RsvpNote({
  eventId,
  slug,
  initialNote = '',
}: {
  eventId: string
  slug?: string
  /** An already-shared note (server-loaded): starts the box collapsed, and Edit prefills it. */
  initialNote?: string
}) {
  const [note, setNote] = useState(initialNote)
  const [saved, setSaved] = useState(initialNote.trim().length > 0)
  const [pending, startTransition] = useTransition()

  const save = () =>
    startTransition(async () => {
      await setRsvpStatus(eventId, 'going', { slug, message: note })
      setSaved(true)
    })

  if (saved && !pending) {
    return (
      <p className="flex items-center gap-2 text-2xs text-success">
        <Check className="h-3 w-3" aria-hidden />
        Shared with the group
        <button
          type="button"
          onClick={() => setSaved(false)}
          className="font-medium text-subtle underline underline-offset-2 transition-colors hover:text-text"
        >
          Edit
        </button>
      </p>
    )
  }

  return (
    <div className="space-y-2 rounded-card border border-border bg-surface p-3">
      <label htmlFor={`rsvp-note-${eventId}`} className="block text-meta font-medium text-muted">
        Say something to the group (optional)
      </label>
      <Textarea
        id={`rsvp-note-${eventId}`}
        value={note}
        onChange={(e) => {
          setNote(e.target.value)
          setSaved(false)
        }}
        rows={2}
        placeholder="Bringing snacks, running a little late, can’t wait…"
        disabled={pending}
        className="resize-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !note.trim()}
          className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-meta font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          {pending ? 'Saving…' : 'Add note'}
        </button>
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-2xs text-success">
            <Check className="h-3 w-3" />
            Shared with the group
          </span>
        )}
      </div>
    </div>
  )
}

// The host's questionnaire, shown to a guest who has RSVP'd (EVENTS-REWORK A1).
// Each answer saves on blur (text/number) or change (choice/yes-no) via setAnswer,
// so partial answers persist. Six types: short/long text, pick one (dropdown),
// pick several (multi-select), yes or no, and number. Self-authorized server-side.
function EventQuestionnaire({
  eventId,
  slug,
  questions,
  initialAnswers,
}: {
  eventId: string
  slug: string
  questions: EventQuestion[]
  initialAnswers: Record<string, string>
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers)
  const [saving, setSaving] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  const save = (questionId: string, value: string) => {
    setSaving(questionId)
    saveGuestAnswer(eventId, slug, questionId, value).finally(() => {
      setSaving((s) => (s === questionId ? null : s))
      setSavedId(questionId)
    })
  }

  const setLocal = (questionId: string, value: string) =>
    setAnswers((a) => ({ ...a, [questionId]: value }))

  return (
    <div className="space-y-4 rounded-card border border-border bg-surface p-4">
      <p className="text-body-sm font-semibold text-text">A few questions from the host</p>
      {questions.map((q) => {
        const value = answers[q.id] ?? ''
        const labelId = `q-${q.id}`
        return (
          <div key={q.id} className="space-y-1.5">
            <label htmlFor={labelId} className="block text-body-sm font-medium text-text">
              {q.prompt}
              {q.required && <span className="ml-1 text-meta text-danger">required</span>}
            </label>

            {q.type === 'long_text' ? (
              <Textarea
                id={labelId}
                value={value}
                onChange={(e) => setLocal(q.id, e.target.value)}
                onBlur={(e) => save(q.id, e.target.value)}
                rows={3}
              />
            ) : q.type === 'number' ? (
              <Input
                id={labelId}
                type="number"
                value={value}
                onChange={(e) => setLocal(q.id, e.target.value)}
                onBlur={(e) => save(q.id, e.target.value)}
              />
            ) : q.type === 'boolean' ? (
              <div className="inline-flex items-center gap-1 rounded-card border border-border bg-surface p-1">
                {(['yes', 'no'] as const).map((opt) => {
                  const selected = value === opt
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setLocal(q.id, opt)
                        save(q.id, opt)
                      }}
                      aria-pressed={selected}
                      className={`rounded-control px-3 py-1.5 text-body-sm font-semibold capitalize transition-colors ${
                        selected
                          ? 'bg-primary-bg text-primary-strong'
                          : 'text-muted hover:bg-surface-elevated hover:text-text'
                      }`}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
            ) : q.type === 'dropdown' ? (
              <Select
                id={labelId}
                value={value}
                onChange={(e) => {
                  setLocal(q.id, e.target.value)
                  save(q.id, e.target.value)
                }}
                emptyLabel="Choose one"
                options={q.options}
              />
            ) : q.type === 'multi_select' ? (
              <MultiSelectAnswer
                options={q.options}
                value={value}
                onChange={(next) => {
                  setLocal(q.id, next)
                  save(q.id, next)
                }}
              />
            ) : (
              <Input
                id={labelId}
                type="text"
                value={value}
                onChange={(e) => setLocal(q.id, e.target.value)}
                onBlur={(e) => save(q.id, e.target.value)}
              />
            )}

            {saving === q.id ? (
              <p className="text-2xs text-muted">Saving…</p>
            ) : savedId === q.id ? (
              <p className="inline-flex items-center gap-1 text-2xs text-success">
                <Check className="h-3 w-3" />
                Saved
              </p>
            ) : null}
          </div>
        )
      })}
      <p className="text-2xs text-muted">Only the host sees your answers.</p>
    </div>
  )
}

// Multi-select answer stored as a comma-joined string (the answer column is text).
function MultiSelectAnswer({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string
  onChange: (next: string) => void
}) {
  const selected = value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []
  const toggle = (opt: string) => {
    const next = selected.includes(opt)
      ? selected.filter((s) => s !== opt)
      : [...selected, opt]
    onChange(next.join(', '))
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = selected.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            aria-pressed={on}
            className={`rounded-pill px-3 py-1 text-body-sm font-medium transition-colors ${
              on
                ? 'bg-primary-bg text-primary-strong'
                : 'border border-border text-muted hover:bg-surface-elevated hover:text-text'
            }`}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

// +1 names editor (shown when the host requires names). The +1 count IS the number
// of non-empty names, so the host always knows who is coming. Capped at MAX_PLUS_ONES.
function PlusOneNames({
  pending,
  names,
  setNames,
  onSave,
}: {
  pending: boolean
  names: string[]
  setNames: (n: string[]) => void
  onSave: (n: string[]) => void
}) {
  // Stable per-row ids so the inputs key on identity, not array index — removing a guest
  // mid-list then reuses the correct DOM node/caret instead of shifting values up a row.
  // Kept in lockstep with `names` (both only mutate through the handlers below). Keys are
  // React-internal (never serialized to the DOM), so the SSR/client id difference is harmless.
  const [ids, setIds] = useState<string[]>(() => names.map(() => crypto.randomUUID()))

  const update = (i: number, value: string) => {
    const next = [...names]
    next[i] = value
    setNames(next)
  }
  const remove = (i: number) => {
    const next = names.filter((_, idx) => idx !== i)
    setNames(next)
    setIds(ids.filter((_, idx) => idx !== i))
    onSave(next)
  }
  const add = () => {
    if (names.length >= MAX_PLUS_ONES) return
    setNames([...names, ''])
    setIds([...ids, crypto.randomUUID()])
  }

  return (
    <div className="space-y-2 rounded-card border border-border bg-surface p-3">
      <p className="text-meta font-medium text-muted">Who are you bringing? The host needs names.</p>
      {names.map((name, i) => (
        <div key={ids[i] ?? i} className="flex items-center gap-2">
          <Input
            type="text"
            value={name}
            onChange={(e) => update(i, e.target.value)}
            onBlur={() => onSave(names)}
            placeholder={`Guest ${i + 1}`}
            aria-label={`Guest ${i + 1}`}
            disabled={pending}
            className="min-w-0 flex-1 py-1.5"
          />
          <IconButton
            label="Remove guest"
            tone="danger"
            onClick={() => remove(i)}
            disabled={pending}
            className="shrink-0"
          >
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      ))}
      {names.length < MAX_PLUS_ONES && (
        <button
          type="button"
          onClick={add}
          disabled={pending}
          className="inline-flex items-center gap-1 text-meta font-medium text-primary-strong hover:underline disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Add a guest
        </button>
      )}
    </div>
  )
}
