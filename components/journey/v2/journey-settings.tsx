'use client'

// Journeys v2 — the author Settings panel (ADR-252, JOURNEYS.md §11). The single home for a
// Journey's identity, delivery, rewards, and publishing — the half of authoring that isn't the
// structure tree. Sits above <JourneyEditor> on /journeys/[slug]/edit and reuses the existing
// owner-checked plan actions (so the season Studio builder can retire). Autosaves: text on blur,
// toggles/selects on change; never blocks the editor.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Lock, Link2, Award, CalendarClock, Gem, PartyPopper, Trophy, Sparkles, RefreshCw, Video, MapPin, Users, Clock } from 'lucide-react'
import { IconAccentFace, AccentPicker, IconGrid } from '@/components/studio/kit/studio-identity'
import { ImageUpload } from '@/components/ui/image-upload'
import { DEFAULT_ACCENT } from '@/lib/studio/accents'
import { isError } from '@/lib/action-result'
import { saveJourneyMeta, setJourneyRewards, setJourneyVisibility, setJourneyDelivery, submitJourneyForReview, setJourneyAttributes, setJourneyMeeting, uploadJourneyCover } from '@/app/(main)/journeys/actions'
import { normalizeJourneyMeeting } from '@/lib/journey-plans'
import type { PlanStatus, PlanVisibility, StoredVeraReview, JourneyMeeting, JourneyTouchpoint } from '@/lib/journey-plans'
import { Toggle } from '@/components/admin/toggle'
import { JourneyEventLink } from './journey-event-link'

const DIFFICULTIES = ['gentle', 'standard', 'deep'] as const
// Meeting formats (ADR-302): how a Circle gathers around the Journey. Icon + label per option.
const MEETING_FORMATS = [
  ['virtual', Video, 'Virtual'],
  ['in_person', MapPin, 'In person'],
  ['hybrid', Users, 'Hybrid'],
] as const

/** A blank touchpoint (all fields null) — the starting shape for the Weekend Gathering before the
 *  author fills anything in. The action re-normalizes on save. */
const emptyTouchpoint = (): JourneyTouchpoint => ({
  format: null,
  schedule: null,
  timezone: null,
  location: null,
  link: null,
  notes: null,
  eventId: null,
})

export interface JourneySettingsProps {
  planId: string
  initialTitle: string
  initialSummary: string | null
  initialIntro: string | null
  initialEmoji: string | null
  initialAccent: string | null
  initialVisibility: PlanVisibility
  initialStatus: PlanStatus
  initialCompletionGems: number
  initialCertificateEnabled: boolean
  initialDripIntervalDays: number
  initialCoverImage: string | null
  /** Vera's last rank-eligibility review, if this Journey has been published/reviewed. */
  initialReview: StoredVeraReview | null
  // Discovery + delivery attributes (ADR-302).
  initialDifficulty?: string | null
  initialCategory?: string | null
  initialTags?: string[]
  initialDailyMinutes?: number | null
  initialEnrollCap?: number | null
  /** Meeting + format details (ADR-302): how a Circle gathers around the Journey. Defaults to a
   *  normalized empty meeting (all null). */
  initialMeeting?: JourneyMeeting
  /** Hide the title, subtitle, and cover controls — the single-page editor (ADR-301) owns those in
   *  the page header, so the sidebar shows only the rest of the settings. */
  hideIdentity?: boolean
}

export function JourneySettings(props: JourneySettingsProps) {
  const router = useRouter()
  const [, start] = useTransition()
  const save = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn()
      router.refresh()
    })

  const [icon, setIcon] = useState(props.initialEmoji ?? 'compass')
  const [accent, setAccent] = useState(props.initialAccent ?? DEFAULT_ACCENT)
  const [iconOpen, setIconOpen] = useState(false)

  const [coverImage, setCoverImage] = useState<string | null>(props.initialCoverImage)
  const [gems, setGems] = useState(props.initialCompletionGems)
  const [difficulty, setDifficulty] = useState<string>(props.initialDifficulty ?? '')
  const [category, setCategory] = useState(props.initialCategory ?? '')
  const [tags, setTags] = useState((props.initialTags ?? []).join(', '))
  const [dailyMinutes, setDailyMinutes] = useState(props.initialDailyMinutes ?? 0)
  const [enrollCap, setEnrollCap] = useState(props.initialEnrollCap ?? 0)
  const attrs = (patch: Parameters<typeof setJourneyAttributes>[1]) => save(() => setJourneyAttributes(props.planId, patch))

  // Two touchpoints, one record (ADR-302). The FLAT fields are the mid-week Circle Meetup; the
  // nested `gathering` is the weekend Gathering. Held as one normalized object; every change/blur
  // autosaves the whole meeting through setJourneyMeeting (the action re-normalizes, so partial
  // edits are safe).
  const [meeting, setMeeting] = useState<JourneyMeeting>(() => normalizeJourneyMeeting(props.initialMeeting))
  const saveMeeting = (next: JourneyMeeting) => save(() => setJourneyMeeting(props.planId, next))

  // Circle Meetup edits the flat touchpoint fields in place.
  const patchMeeting = (patch: Partial<JourneyTouchpoint>) => { setMeeting((m) => ({ ...m, ...patch })) }
  const commitMeeting = (patch: Partial<JourneyTouchpoint>) => { const next = { ...meeting, ...patch }; setMeeting(next); saveMeeting(next) }

  // Weekend Gathering edits the nested `gathering` touchpoint. Editing any field for the first time
  // lifts `gathering` from null into a fresh touchpoint; an empty (all-null) gathering is left as a
  // record (the action re-normalizes), which keeps the form's controlled inputs simple.
  const gathering = meeting.gathering
  const patchGathering = (patch: Partial<JourneyTouchpoint>) => {
    setMeeting((m) => ({ ...m, gathering: { ...emptyTouchpoint(), ...m.gathering, ...patch } }))
  }
  const commitGathering = (patch: Partial<JourneyTouchpoint>) => {
    const next = { ...meeting, gathering: { ...emptyTouchpoint(), ...meeting.gathering, ...patch } }
    setMeeting(next)
    saveMeeting(next)
  }
  const [certificate, setCertificate] = useState(props.initialCertificateEnabled)
  const [drip, setDrip] = useState(props.initialDripIntervalDays)

  const [visibility, setVisibility] = useState<PlanVisibility>(props.initialVisibility)
  const [status, setStatus] = useState<PlanStatus>(props.initialStatus)
  const [celebrate, setCelebrate] = useState<null | 'live' | 'review'>(null)

  // Vera's rank-eligibility gate: the verdict + coaching, refreshed on publish/resubmit.
  const [review, setReview] = useState<StoredVeraReview | null>(props.initialReview)
  const [reviewing, setReviewing] = useState(false)

  const meta = (patch: Parameters<typeof saveJourneyMeta>[1]) => save(() => saveJourneyMeta(props.planId, patch))

  const changeVisibility = (v: PlanVisibility) => {
    const prev = visibility
    setVisibility(v)
    if (v === 'public') setReviewing(true)
    start(async () => {
      const res = await setJourneyVisibility(props.planId, v)
      if (isError(res)) {
        setVisibility(prev)
      } else {
        setStatus(res.data.status)
        if (v === 'public') {
          const live = res.data.status === 'approved'
          setCelebrate(live ? 'live' : 'review')
          setTimeout(() => setCelebrate(null), 3500)
          setReview(res.data.review)
        }
      }
      setReviewing(false)
      router.refresh()
    })
  }

  // Re-run Vera's rank gate after editing a published Journey (resubmit). Re-reviewing keeps a
  // stale approval from surviving a material change.
  const resubmitForReview = () => {
    setReviewing(true)
    start(async () => {
      const res = await submitJourneyForReview(props.planId)
      if (!isError(res)) setReview(res.data.review)
      setReviewing(false)
      router.refresh()
    })
  }

  return (
    <section className="space-y-6">
      {celebrate === 'live' && (
        <div className="flex items-center gap-2 rounded-xl border border-success/50 bg-success-bg px-4 py-3 text-sm font-medium text-success">
          <PartyPopper className="h-5 w-5 shrink-0" /> Live in the community library. Anyone can adopt it now.
        </div>
      )}
      {celebrate === 'review' && (
        <div className="flex items-center gap-2 rounded-xl border border-warning/50 bg-warning-bg px-4 py-3 text-sm font-medium text-warning">
          <PartyPopper className="h-5 w-5 shrink-0" /> Submitted. A Guide reviews it, then it goes live in the library.
        </div>
      )}

      {/* Identity — icon, accent, title, subtitle. Hidden in the single-page editor (ADR-301),
          which renders the icon/accent picker beside the title in the page header instead (so the
          accent dots are never loose in the sidebar). */}
      {!props.hideIdentity && (
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <IconAccentFace icon={icon} accent={accent} size="md" onClick={() => setIconOpen((v) => !v)} />
            {iconOpen && (
              <div className="absolute left-0 top-[3.25rem] z-10 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface p-3 shadow-xl">
                <IconGrid value={icon} size="sm" onPick={(k) => { setIcon(k); setIconOpen(false); meta({ emoji: k }) }} />
              </div>
            )}
            <div className="mt-2 flex justify-center">
              <AccentPicker accent={accent} onChange={(a) => { setAccent(a); meta({ accent: a }) }} />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <input
              defaultValue={props.initialTitle}
              onBlur={(e) => meta({ title: e.target.value })}
              maxLength={120}
              placeholder="Name your Journey"
              className="w-full bg-transparent text-xl font-bold text-text outline-none placeholder:text-subtle"
            />
            <input
              defaultValue={props.initialSummary ?? ''}
              onBlur={(e) => meta({ summary: e.target.value })}
              maxLength={280}
              placeholder="One line on what this is and who it's for"
              className="mt-1 w-full bg-transparent text-sm text-muted outline-none placeholder:text-subtle"
            />
          </div>
        </div>
      )}

      {/* The story/intro write-up moved out of Settings to sit above the curriculum (ADR-302). */}

      {/* Cover image — the banner shown on the Journey's discovery page + cards. Hidden when the
          single-page editor (ADR-301) renders the cover upload in the page header instead. */}
      {!props.hideIdentity && (
        <ImageUpload
          label="Cover image"
          value={coverImage}
          onChange={(url) => {
            setCoverImage(url)
            meta({ coverImage: url })
          }}
          folder="journey-covers"
          uploadFn={(file) => {
            const fd = new FormData()
            fd.append('file', file)
            return uploadJourneyCover(props.planId, fd)
          }}
          hint="Shown on the Journey's discovery page and cards."
        />
      )}

      {/* Delivery + rewards */}
      <div className="space-y-2.5">
        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Delivery and rewards</p>
        <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
            <Gem className="h-3.5 w-3.5" /> Completion Gems
          </span>
          <input
            type="number"
            min={0}
            max={100}
            value={gems}
            onChange={(e) => setGems(Number(e.target.value))}
            onBlur={() => save(() => setJourneyRewards(props.planId, gems))}
            className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
            <CalendarClock className="h-3.5 w-3.5" /> Phase drip (days)
          </span>
          <input
            type="number"
            min={1}
            max={30}
            value={drip}
            onChange={(e) => setDrip(Number(e.target.value))}
            onBlur={() => save(() => setJourneyDelivery(props.planId, { dripIntervalDays: drip }))}
            className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
          />
        </label>
        </div>
        {/* Certificate — a proper on/off switch (the shared settings Toggle), in its own clear row
            so the control isn't cramped beside the number inputs. */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-canvas px-3 py-2.5">
          <span className="flex min-w-0 flex-col">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-text">
              <Award className="h-4 w-4 text-rank-gold" aria-hidden /> Certificate
            </span>
            <span className="text-2xs text-subtle">A printable certificate when someone finishes.</span>
          </span>
          <Toggle
            checked={certificate}
            ariaLabel="Completion certificate"
            onChange={(next) => {
              setCertificate(next)
              save(() => setJourneyDelivery(props.planId, { certificateEnabled: next }))
            }}
          />
        </div>
      </div>

      {/* Publish / visibility */}
      <div className="space-y-2.5">
        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Who can see it</p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
        {([
          ['private', Lock, 'Just me'],
          ['unlisted', Link2, 'Anyone with the link'],
          ['public', Globe, 'Community library'],
        ] as const).map(([v, Icon, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => changeVisibility(v)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
              visibility === v ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-surface-elevated'
            }`}
          >
            <Icon className="h-3 w-3" /> {label}
          </button>
        ))}
        {visibility === 'public' && status === 'pending' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2.5 py-1 text-warning">In review</span>
        )}
        </div>
      </div>

      {/* Discovery + delivery attributes (ADR-302) */}
      <div className="space-y-2.5">
        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">More</p>

        <div>
          <span className="mb-1 block text-2xs font-medium text-subtle">Difficulty</span>
          <div className="flex flex-wrap gap-1.5">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => { const next = difficulty === d ? '' : d; setDifficulty(next); attrs({ difficulty: next || null }) }}
                aria-pressed={difficulty === d}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${difficulty === d ? 'border-primary/40 bg-primary-bg text-primary-strong' : 'border-border bg-canvas text-muted hover:text-text'}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-subtle">Category</span>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            onBlur={() => attrs({ category: category || null })}
            placeholder="e.g. Rest and recovery"
            className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-subtle">Tags (comma-separated)</span>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            onBlur={() => attrs({ tags: tags.split(',').map((t) => t.trim()).filter(Boolean) })}
            placeholder="e.g. sleep, calm, screens"
            className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-medium text-subtle">Minutes a day</span>
            <input
              type="number"
              min={0}
              max={600}
              value={dailyMinutes || ''}
              onChange={(e) => setDailyMinutes(Number(e.target.value))}
              onBlur={() => attrs({ dailyMinutes: dailyMinutes || null })}
              placeholder="optional"
              className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-medium text-subtle">Max people</span>
            <input
              type="number"
              min={0}
              value={enrollCap || ''}
              onChange={(e) => setEnrollCap(Number(e.target.value))}
              onBlur={() => attrs({ enrollCap: enrollCap || null })}
              placeholder="no limit"
              className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
            />
            <span className="text-2xs text-subtle">A Run of about 8 to 12 keeps real accountability.</span>
          </label>
        </div>
      </div>

      {/* Two touchpoints (ADR-302) — how a Circle gathers around the Journey. The Circle Meetup is the
          mid-week check-in; the Weekend Gathering is the weekend social event whose purpose the group
          chooses. Both share the same controls and persist through one setJourneyMeeting call (the
          flat fields for the Meetup, the nested `gathering` for the Gathering). */}
      <div className="space-y-5">
        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">How the Circle gathers</p>

        {/* Circle Meetup — the mid-week touchpoint, on the flat fields. */}
        <TouchpointForm
          planId={props.planId}
          title="Circle Meetup"
          hint="The mid-week check-in where the Circle keeps the Journey on track."
          touchpoint={meeting}
          onPatch={patchMeeting}
          onCommit={commitMeeting}
        />

        {/* Weekend Gathering — the weekend touchpoint, on the nested `gathering`. Same controls. */}
        <TouchpointForm
          planId={props.planId}
          title="Weekend Gathering"
          hint="The weekend social event. The group chooses what it is for: a meal, a walk, a project, or just time together."
          touchpoint={gathering}
          onPatch={patchGathering}
          onCommit={commitGathering}
        />
      </div>

      {/* Vera's rank gate — coaching for the author. Publishing is open; this is only about
          whether finishing this Journey can count toward season rank. Shown once it's public. */}
      {visibility === 'public' && (review || reviewing) && (
        <VeraRankPanel review={review} reviewing={reviewing} onResubmit={resubmitForReview} />
      )}
    </section>
  )
}

/** One touchpoint's form (ADR-302) — the same set of controls for the Circle Meetup and the Weekend
 *  Gathering: format, schedule + timezone, the format-fitted location/join-link, a linked event, and
 *  notes. `touchpoint` may be null (a Gathering that hasn't been started); a blank touchpoint renders
 *  with empty fields. All tokens only; no hex, no hardcoded sizes. */
function TouchpointForm({
  planId,
  title,
  hint,
  touchpoint,
  onPatch,
  onCommit,
}: {
  planId: string
  title: string
  hint: string
  touchpoint: JourneyTouchpoint | null
  /** Update local state without saving (text-field onChange). */
  onPatch: (patch: Partial<JourneyTouchpoint>) => void
  /** Update local state and autosave (toggles, blur). */
  onCommit: (patch: Partial<JourneyTouchpoint>) => void
}) {
  const t = touchpoint
  const format = t?.format ?? null
  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-canvas/40 p-3">
      <div>
        <p className="text-sm font-semibold text-text">{title}</p>
        <p className="mt-0.5 text-2xs text-subtle">{hint}</p>
      </div>

      <div>
        <span className="mb-1 block text-2xs font-medium text-subtle">Format</span>
        <div className="flex flex-wrap gap-1.5">
          {MEETING_FORMATS.map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onCommit({ format: format === value ? null : value })}
              aria-pressed={format === value}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${format === value ? 'border-primary/40 bg-primary-bg text-primary-strong' : 'border-border bg-canvas text-muted hover:text-text'}`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
        {format && (
          <p className="mt-1.5 text-2xs text-subtle">
            {format === 'virtual' && 'People join online. Add a join link below.'}
            {format === 'in_person' && 'People meet in person. Add a location below.'}
            {format === 'hybrid' && 'Some join online, some in person. Add both a location and a join link.'}
          </p>
        )}
      </div>

      {/* Schedule + its timezone, side by side so "when" reads as one thing. */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-subtle">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Schedule
          </span>
          <input
            value={t?.schedule ?? ''}
            onChange={(e) => onPatch({ schedule: e.target.value })}
            onBlur={(e) => onCommit({ schedule: e.target.value })}
            maxLength={120}
            placeholder="e.g. Sundays 7pm"
            className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 sm:w-28">
          <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-subtle">
            <Clock className="h-3.5 w-3.5" aria-hidden /> Timezone
          </span>
          <input
            value={t?.timezone ?? ''}
            onChange={(e) => onPatch({ timezone: e.target.value })}
            onBlur={(e) => onCommit({ timezone: e.target.value })}
            maxLength={40}
            placeholder="e.g. ET"
            className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
          />
        </label>
      </div>

      {(format === 'in_person' || format === 'hybrid') && (
        <label className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-subtle">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> Location
          </span>
          <input
            value={t?.location ?? ''}
            onChange={(e) => onPatch({ location: e.target.value })}
            onBlur={(e) => onCommit({ location: e.target.value })}
            maxLength={200}
            placeholder="e.g. The community hall, 14 Main St"
            className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
          />
        </label>
      )}

      {(format === 'virtual' || format === 'hybrid') && (
        <label className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-subtle">
            <Video className="h-3.5 w-3.5" aria-hidden /> Join link
          </span>
          <input
            type="url"
            value={t?.link ?? ''}
            onChange={(e) => onPatch({ link: e.target.value })}
            onBlur={(e) => onCommit({ link: e.target.value })}
            maxLength={500}
            placeholder="https://"
            className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
          />
        </label>
      )}

      {/* Link or create an event this touchpoint ties to (stores eventId via setJourneyMeeting). */}
      <JourneyEventLink
        planId={planId}
        eventId={t?.eventId ?? null}
        onChange={(eventId) => onCommit({ eventId })}
      />

      <label className="flex flex-col gap-1">
        <span className="text-2xs font-medium text-subtle">Notes</span>
        <textarea
          value={t?.notes ?? ''}
          onChange={(e) => onPatch({ notes: e.target.value })}
          onBlur={(e) => onCommit({ notes: e.target.value })}
          maxLength={500}
          rows={2}
          placeholder="Any other details people should know before they join"
          className="resize-none rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
        />
      </label>
    </div>
  )
}

/** Vera's rank-eligibility verdict + coaching. Three faces: approved (in the ranked library),
 *  rejected (notes to fix, with a resubmit), and pending (Vera couldn't reach a verdict — try
 *  again). All tokens only; no hex, no hardcoded sizes. */
function VeraRankPanel({
  review,
  reviewing,
  onResubmit,
}: {
  review: StoredVeraReview | null
  reviewing: boolean
  onResubmit: () => void
}) {
  if (reviewing && !review) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-canvas px-4 py-3 text-sm text-muted">
        <Sparkles className="h-4 w-4 shrink-0 animate-pulse text-primary-strong" aria-hidden /> Vera is reading your
        Journey to see if it can count toward rank.
      </div>
    )
  }
  if (!review) return null

  const approved = review.status === 'approved'
  const pending = review.status === 'pending'

  const tone = approved
    ? { border: 'border-success/50', bg: 'bg-success-bg', text: 'text-success', Icon: Trophy }
    : pending
      ? { border: 'border-border', bg: 'bg-canvas', text: 'text-muted', Icon: Sparkles }
      : { border: 'border-warning/50', bg: 'bg-warning-bg', text: 'text-warning', Icon: Sparkles }

  const headline = approved
    ? 'Vera added this to the ranked library. Finishing it now counts toward rank.'
    : pending
      ? "Vera couldn't reach a verdict this time, so it isn't counting toward rank yet."
      : "Vera's notes before this can count toward rank:"

  return (
    <div className={`space-y-3 rounded-xl border ${tone.border} ${tone.bg} px-4 py-3`}>
      <p className={`flex items-start gap-2 text-sm font-medium ${tone.text}`}>
        <tone.Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {headline}
      </p>
      {review.feedback.length > 0 && (
        <ul className="space-y-1.5 text-sm text-text">
          {review.feedback.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="select-none text-subtle">·</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
      {!approved && (
        <button
          type="button"
          onClick={onResubmit}
          disabled={reviewing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${reviewing ? 'animate-spin' : ''}`} aria-hidden />
          {reviewing ? 'Vera is reviewing' : 'Revise and submit for review'}
        </button>
      )}
    </div>
  )
}
