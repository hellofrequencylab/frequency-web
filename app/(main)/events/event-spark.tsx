'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE EVENT SPARK (/events/new), composed from the Studio Spark kit (docs/STUDIO.md §0).
//
// The guided composer, rebuilt on the shared kit: `SparkShell` for every screen, `SparkDoors` for
// the first one, `SparkDropzone` for the flyer, `SparkSteer` for the dials, and `FieldControl` for
// every field on the review step. The field list is not written here at all: it comes from the
// EVENT manifest (lib/studio/entities/event.ts) through the kernel's `sparkFields()`.
//
// Two ways in, unchanged:
//   • QUESTIONS — a short stepped brief (what / when / where / details), or
//   • IMPORT    — paste the write-up (Eventbrite, a group thread, a website) AND/OR photograph the
//     flyer. The manifest declares `accepts: ['paste', 'image']`, so the shared drop zone carries
//     both; the photo is staged here and read by the EXISTING vision scan (app/(main)/events/scan),
//     which is untouched. Vera reads the text and the photo together into one event.
//
// Either way Vera drafts the event for review, then creating it runs through the SHARED
// saveDraft → draft editor → publish flow (the same one the poster scanner uses). Nothing persists
// until that create. The manual door hands off to the full EventForm, which also carries the
// Duplicate-event prefill (`initial` + `startInManual`). Degrades cleanly when Vera is off.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/field'
import { StudioField } from '@/components/studio/kit/studio-field'
import {
  FieldControl,
  SparkDoors,
  SparkDropzone,
  SparkOffers,
  SparkShell,
  SparkSteer,
  draftText,
  useQualityCheck,
} from '@/components/studio/spark'
import { EVENT_MANIFEST } from '@/lib/studio/entities/event'
import { sparkFields } from '@/lib/studio/kernel/review-kernel'
import { DEFAULT_SEED_MOOD, type SeedMood } from '@/lib/studio/kernel/moods'
import type { FieldDef } from '@/lib/studio/kernel/manifest'
import { createClient } from '@/lib/supabase/client'
import { prepareImageForUpload } from '@/lib/library/image-shrink'
import type { ExtractedEvent } from '@/lib/events/types'
import { sparkEventAction } from './create-actions'
import { saveDraft, scanPoster } from './scan/actions'
import { downscaleForScan } from './scan/image-tools'
import { safeUploadPreviewSrc } from '@/lib/safe-image-src'
import { EventForm, type EventFormInitial } from './new/event-form'

// The PRIVATE bucket the poster scanner uploads to (owner-scoped RLS, path `${uid}/...`).
// scanPoster + saveDraft both re-validate the path is the caller's, so the wizard reuses it.
const SCAN_BUCKET = 'network-contacts'

// ── What the manifest says an Event's Spark asks for ──────────────────────────────────────
//
// title · startsAt · location · isFree · priceCents, from one declaration. The DESCRIPTION is
// declared `placement: 'inline'` (it is content on the live page), so `sparkFields()` correctly
// leaves it out, but this review has always edited it and `saveDraft` persists it. It is added
// back here, by path, in reading order under the title, rather than by re-declaring a field.
const DESCRIPTION_FIELD = EVENT_MANIFEST.fields.find((f) => f.path === 'description')

const REVIEW_FIELDS: FieldDef[] = sparkFields(EVENT_MANIFEST).flatMap((f) =>
  f.path === 'title' && DESCRIPTION_FIELD ? [f, DESCRIPTION_FIELD] : [f],
)

/** The four questions, in order. Free-text answers Vera parses; deliberately NOT manifest fields
 *  ("this Friday 7pm" is a brief, `startsAt` is an instant). */
const QUESTIONS = [
  {
    key: 'what',
    label: 'What is the event',
    title: 'What is the event?',
    description: 'A sentence is plenty. Tell Vera what it is and she drafts the rest.',
    placeholder: 'e.g. A Sunday sound bath and tea circle for beginners.',
    long: true,
  },
  {
    key: 'when',
    label: 'When',
    title: 'When is it?',
    description: 'In your own words, like "this Friday 7pm" or "March 1 at noon".',
    placeholder: 'e.g. this Friday 7pm',
    long: false,
  },
  {
    key: 'where',
    label: 'Where',
    title: 'Where is it?',
    description: 'A venue and city, or online.',
    placeholder: 'e.g. Balboa Park, San Diego, or online',
    long: false,
  },
  {
    key: 'details',
    label: 'Details',
    title: 'Anything else?',
    description: 'Who it is for, the price, what to bring. Optional.',
    placeholder: "Who it's for, the price, what to bring…",
    long: true,
  },
] as const

/** The doors screen, the four questions, then review. */
const QUESTIONS_TOTAL = QUESTIONS.length + 2
/** The import path is two screens: drop it in, then review. */
const IMPORT_TOTAL = 2

/** The manifest's dials. The Event declares no locks, so nothing is narrowed here. */
const EVENT_STEER = EVENT_MANIFEST.steer ?? {}
const NO_LOCKS: readonly string[] = []

/** Which of the four answers a step is on. */
type AnswerKey = (typeof QUESTIONS)[number]['key']

/** A control's value comes back as a string or a list; every field here is scalar. */
const scalar = (v: string | string[]): string => (Array.isArray(v) ? v[0] ?? '' : v)

// ── The manifest ⇄ draft seam ─────────────────────────────────────────────────────────────
//
// The manifest's paths mirror the persisted event, and the screen holds an `ExtractedEvent`. Two
// of them need a unit change on the way through: a `datetime` control speaks wall-clock local
// time while the draft holds an ISO instant, and a `price` control speaks money while the draft
// holds cents. Both are pure and total.

/** An ISO instant → the `YYYY-MM-DDTHH:mm` a datetime-local input needs, in the viewer's zone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The same trip back: a datetime-local value is parsed as LOCAL time, stored as an instant. */
function fromLocalInput(value: string): string {
  if (!value.trim()) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

function readField(draft: ExtractedEvent, path: string): string {
  switch (path) {
    case 'title':
      return draft.title
    case 'description':
      return draft.description
    case 'startsAt':
      return toLocalInput(draft.startsAt)
    case 'location':
      return draft.location
    case 'isFree':
      return draft.isFree ? 'true' : 'false'
    case 'priceCents':
      return draft.priceCents != null ? String(draft.priceCents / 100) : ''
    default:
      return ''
  }
}

function writeField(draft: ExtractedEvent, path: string, next: string): ExtractedEvent {
  switch (path) {
    case 'title':
      return { ...draft, title: next }
    case 'description':
      return { ...draft, description: next }
    case 'startsAt':
      return { ...draft, startsAt: fromLocalInput(next) }
    case 'location':
      return { ...draft, location: next }
    // Free wins over a price, the same rule the server's own coercer applies, so the two can
    // never disagree about a $20 event marked free.
    case 'isFree':
      return next === 'true' ? { ...draft, isFree: true, priceCents: null } : { ...draft, isFree: false }
    case 'priceCents': {
      const dollars = Number(next)
      const cents = next.trim() && Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : null
      return { ...draft, priceCents: cents }
    }
    default:
      return draft
  }
}

/** One declared field, labeled. `toggle` prints its own label inside a `<label>`, so it is never
 *  wrapped in a second one. */
function Row({ def, value, onChange }: { def: FieldDef; value: string; onChange: (next: string) => void }) {
  const control = <FieldControl def={def} value={value} onChange={(v) => onChange(scalar(v))} />
  if (def.kind === 'toggle') return control
  return <StudioField label={def.label}>{control}</StudioField>
}

type Group = { id: string; name: string; kind?: 'circle' | 'space' }
/** A Journey the manual form may link the event to. Passed straight through — the Spark's wizard
 *  path does not ask about Journeys, so this only reaches EventForm. */
type JourneyOption = { id: string; title: string }

/** Where the flow is. The import path skips the four questions, exactly as it always did. */
type Stage = 'doors' | 'questions' | 'review'

export function EventSpark({
  groups,
  journeys,
  defaultGroupId,
  initial,
  startInManual,
  home,
}: {
  groups: Group[]
  journeys?: JourneyOption[]
  defaultGroupId?: string
  /** Prefill for the manual form (used by Duplicate event — a cloned draft). */
  initial?: Partial<EventFormInitial>
  /** Skip Vera's wizard and open the manual form straight away (Duplicate event). */
  startInManual?: boolean
  /** The viewer's saved home, to default the venue autocomplete's location bias. */
  home?: { lat: number; lng: number } | null
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'wizard' | 'manual'>(startInManual ? 'manual' : 'wizard')
  const [stage, setStage] = useState<Stage>('doors')
  const [q, setQ] = useState(0)
  /** True when the draft came from pasted or photographed material rather than the questions. */
  const [imported, setImported] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [answers, setAnswers] = useState<Record<AnswerKey, string>>({ what: '', when: '', where: '', details: '' })
  /** Source material from the shared drop zone (the pasted write-up). */
  const [flyer, setFlyer] = useState('')

  // A flyer/poster photo staged through the kit's drop zone. Uploaded + read TOGETHER with any
  // pasted text when they draft. The kept upload becomes the draft's cover (posterPath).
  const [staged, setStaged] = useState<File | null>(null)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [posterPath, setPosterPath] = useState<string | null>(null)
  // LATEST-PICK guard: prepareImageForUpload can take seconds (heic2any + wasm), so a user can
  // pick again or hit Remove while an earlier conversion is in flight. Stale completions drop.
  const pickEpoch = useRef(0)

  // Vera's drafted event. The review step edits the manifest's declared fields on it; everything
  // else (lineup, tickets, links, sponsors) carries through to the draft editor untouched.
  const [draft, setDraft] = useState<ExtractedEvent | null>(null)

  // The steer dials. Captured on review so they never add a question to the flow.
  const [mood, setMood] = useState<SeedMood>(DEFAULT_SEED_MOOD)
  const [directions, setDirections] = useState('')

  // ── The pre-publish read (ADR-993 / ADR-995) ──
  //
  // ADVICE, never a gate: nothing is stored and "Create event" never waits on it.
  //
  // NO COVER OFFER HERE, deliberately. This Spark already has a first-class cover path (photograph
  // the flyer on screen one and it becomes the draft's cover), and an event DRAFT carries its cover
  // as a private storage path inside the author's own folder (lib/events/details-media.ts,
  // `isOwnedStoragePath`), not as a URL. A generated cover is a public Loom URL, so it cannot ride
  // there without changing what an event draft's cover IS. The Loom picker in the draft editor is
  // the right place for that, and it is the next screen.
  const qualityState = useQualityCheck({
    entity: EVENT_MANIFEST.entity,
    read: () =>
      draftText([
        ['Title', draft?.title],
        ['Description', draft?.description],
        ['When', draft?.startsAt],
        ['Where', draft?.location],
        ['Price', draft?.isFree ? 'Free' : draft?.priceCents != null ? `${draft.priceCents / 100} dollars` : null],
      ]),
  })

  if (mode === 'manual')
    return (
      <EventForm
        groups={groups}
        journeys={journeys}
        defaultGroupId={defaultGroupId}
        initial={initial}
        home={home}
      />
    )

  /** Whether there is material to draft FROM, which is what picks the import path. */
  const hasSource = flyer.trim().length > 0 || staged !== null

  const applyDraft = (d: ExtractedEvent) => {
    setDraft(d)
    setStage('review')
  }

  const aiOffMessage = (reason: string, fallback: string) =>
    reason === 'ai_unavailable' ? 'Vera is off right now. Use "Fill it in myself" below.' : fallback

  const generate = () => {
    setError(null)
    start(async () => {
      // IMPORT path with a staged photo → read the image AND the pasted text together (the smart
      // uploader). Upload the downscaled photo, then one combined extraction.
      if (staged) {
        try {
          const supabase = createClient()
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) {
            setError('Sign in to read a photo.')
            return
          }
          const small = await downscaleForScan(staged)
          const path = `${user.id}/${crypto.randomUUID()}.jpg`
          const { error: upErr } = await supabase.storage
            .from(SCAN_BUCKET)
            .upload(path, small, { contentType: 'image/jpeg' })
          if (upErr) {
            setError('Could not upload that photo. Try again.')
            return
          }
          const res = await scanPoster([path], flyer.trim() || undefined)
          if (!res.ok) {
            setError(aiOffMessage(res.reason, 'Could not read that. Try a clearer photo, or paste the text too.'))
            return
          }
          setPosterPath(res.posterPath)
          applyDraft(res.extraction)
        } catch {
          setError('Could not read that. Try again.')
        }
        return
      }

      // Text-only: the import path with just pasted text, or the questions path.
      const res = await sparkEventAction(answers, flyer.trim() || undefined)
      if (!res.ok) {
        setError(aiOffMessage(res.reason, 'Sign in to draft an event.'))
        return
      }
      applyDraft(res.draft)
    })
  }

  const stagePhoto = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('That is not an image. Upload a photo of the flyer or poster.')
      return
    }
    setError(null)
    const epoch = ++pickEpoch.current
    // Prep in the browser first (the shared seam): an iPhone HEIC is converted to JPEG so the staged
    // thumbnail renders and the scan downscale can decode it (neither works on a raw HEIC outside
    // Safari). An unconvertible HEIC gets an inline message instead of a broken scan.
    const prepared = await prepareImageForUpload(file)
    // A newer pick (or Remove) superseded this one while it converted — drop it.
    if (epoch !== pickEpoch.current) return
    if ('error' in prepared) {
      setError(prepared.error)
      return
    }
    setStaged(prepared.file)
    // Functional swap so the PREVIOUS thumb is revoked even if this closure's thumbUrl is stale.
    setThumbUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(prepared.file)
    })
  }

  const removePhoto = () => {
    pickEpoch.current++ // invalidate any conversion still in flight
    if (thumbUrl) URL.revokeObjectURL(thumbUrl)
    setStaged(null)
    setThumbUrl(null)
  }

  /** The kit's drop zone owns a LIST of images; the scan reads one flyer, so the newest pick wins
   *  and an emptied list means Remove. */
  const onImages = (next: File[]) => {
    const picked = next.length ? next[next.length - 1] : null
    if (!picked) {
      removePhoto()
      return
    }
    if (picked === staged) return
    void stagePhoto(picked)
  }

  const create = () => {
    if (!draft?.title.trim()) return
    setError(null)
    start(async () => {
      const res = await saveDraft({
        title: draft.title.trim(),
        description: draft.description,
        startsAt: draft.startsAt || null,
        endsAt: draft.endsAt || null,
        location: draft.location,
        isFree: draft.isFree,
        priceCents: draft.priceCents,
        organizerName: draft.organizerName,
        organizerContact: draft.organizerContact,
        domain: draft.domain,
        details: draft.details,
        // The uploaded flyer photo (if any) becomes the draft's cover.
        posterPath,
        // Keep the space Calendar console's attribution through the WIZARD path too (the manual
        // form already carries it): a draft opened from a space's "New event" stays that space's
        // event, hosted by the space. Server re-validates the caller helps run it.
        spaceId: groups.find((g) => g.id === defaultGroupId)?.kind === 'space' ? defaultGroupId ?? null : null,
      })
      if ('id' in res) router.push(`/events/drafts/${res.id}`)
      else setError(res.error)
    })
  }

  // Same allowlist the other upload previews use; a rejected URL renders no thumb rather
  // than an <img> with an empty src.
  const thumbSrc = safeUploadPreviewSrc(thumbUrl)

  // ── 1. The doors ──────────────────────────────────────────────────────────────────────
  if (stage === 'doors') {
    const draftFromSource = () => {
      setImported(true)
      generate()
    }
    return (
      <SparkShell
        eyebrow="New event"
        title="Start an event"
        // The invitation lives HERE now, not in a window wrapper (ADR-1099/ADR-1101 follow-up).
        // `EventEditorWindow` used to carry it as a brandmark header band, and that band came
        // attached to a SECOND StudioWindow — two focus traps, two scroll locks. The words are
        // worth keeping; the overlay they arrived in was not. This is where every other Spark
        // puts its framing, so the copy is now composed rather than wrapped.
        description="Share an Event with the community. Tell Vera about it, drop in what you already have, or fill in the form yourself."
        step={1}
        totalSteps={hasSource ? IMPORT_TOTAL : QUESTIONS_TOTAL}
        stepLabel="Start"
        error={error}
        // The primary action only exists once there is something to draft FROM. Until then the
        // doors are the whole screen.
        {...(hasSource
          ? { onNext: draftFromSource, nextLabel: 'Draft with Vera', busy: pending }
          : {})}
      >
        <SparkDoors
          entityLabel="Event"
          onVera={() => {
            if (hasSource) {
              draftFromSource()
              return
            }
            setImported(false)
            setQ(0)
            setStage('questions')
          }}
          veraLabel={hasSource ? 'Draft it from what you dropped in' : 'Answer a few questions'}
          veraHint={
            hasSource
              ? 'Vera reads the write-up and the photo together and lays out the whole event.'
              : 'Four short answers and Vera drafts the whole event for you to edit.'
          }
          onManual={() => setMode('manual')}
          manualLabel="Fill it in myself"
          manualHint="Go straight to the full form and fill it in your own way."
          disabled={pending}
        >
          {/* The manifest declares `accepts: ['paste', 'image']`: the write-up and the flyer
              photo. The photo is staged here; the EXISTING vision scan reads it on draft. */}
          <SparkDropzone
            accepts={EVENT_MANIFEST.accepts ?? []}
            sourceText={flyer}
            onSourceText={setFlyer}
            images={staged ? [staged] : []}
            onImages={onImages}
            disabled={pending}
          />
          {thumbSrc && (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbSrc} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover" />
              <span className="min-w-0 flex-1 text-2xs text-muted">
                Photo attached. Vera reads it with the text and keeps it as the cover.
              </span>
            </div>
          )}
        </SparkDoors>
      </SparkShell>
    )
  }

  // ── 2. The brief ──────────────────────────────────────────────────────────────────────
  if (stage === 'questions') {
    const question = QUESTIONS[q]
    const last = q === QUESTIONS.length - 1
    const value = answers[question.key]
    const setValue = (next: string) => setAnswers((prev) => ({ ...prev, [question.key]: next }))

    return (
      <SparkShell
        eyebrow="New event"
        title={question.title}
        description={question.description}
        step={q + 2}
        totalSteps={QUESTIONS_TOTAL}
        stepLabel={question.label}
        onBack={() => (q === 0 ? setStage('doors') : setQ((s) => s - 1))}
        onNext={() => (last ? generate() : setQ((s) => s + 1))}
        nextLabel={last ? 'Draft with Vera' : 'Continue'}
        // Only the first answer is required; Vera fills the gaps.
        nextDisabled={q === 0 && !answers.what.trim()}
        busy={pending}
        error={error}
        exits={[{ label: 'Fill it in myself', onSelect: () => setMode('manual') }]}
      >
        {question.long ? (
          <Textarea
            autoFocus
            aria-label={question.label}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={question.key === 'what' ? 3 : 4}
            placeholder={question.placeholder}
          />
        ) : (
          <Input
            autoFocus
            aria-label={question.label}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={question.placeholder}
          />
        )}
      </SparkShell>
    )
  }

  // ── 3. Review ─────────────────────────────────────────────────────────────────────────
  const total = imported ? IMPORT_TOTAL : QUESTIONS_TOTAL
  return (
    <SparkShell
      eyebrow="New event"
      title="Here is your event"
      description="Vera's draft. Fix anything that looks off, then create it. The cover, lineup, tickets, and links carry into the editor next."
      step={total}
      totalSteps={total}
      stepLabel="Review"
      onBack={() => {
        if (imported) {
          setStage('doors')
          return
        }
        setQ(QUESTIONS.length - 1)
        setStage('questions')
      }}
      onNext={create}
      nextLabel="Create event"
      nextDisabled={!draft?.title.trim()}
      busy={pending}
      error={error}
    >
      {draft && (
        <div className="space-y-3">
          {REVIEW_FIELDS
            // A price box on a free event is a question with no answer.
            .filter((def) => def.path !== 'priceCents' || !draft.isFree)
            .map((def) => (
              <Row
                key={def.path}
                def={def}
                value={readField(draft, def.path)}
                onChange={(next) => setDraft(writeField(draft, def.path, next))}
              />
            ))}

          {detailCount(draft) > 0 && (
            <p className="flex items-start gap-2 text-2xs leading-relaxed text-muted">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
              {detailSummary(draft)} You will fine-tune all of it (and the links) in the editor next.
            </p>
          )}

          {/* Optional and skippable: a read before it goes out. */}
          <SparkOffers quality={qualityState.check} disabled={pending} />

          <SparkSteer
            steer={EVENT_STEER}
            mood={mood}
            onMood={setMood}
            directions={directions}
            onDirections={setDirections}
            locked={NO_LOCKS}
            onLocked={() => undefined}
            disabled={pending}
          />
        </div>
      )}
    </SparkShell>
  )
}

/** How many rich details Vera harvested (lineup, schedule, tickets, links, sponsors), so the
 *  review can reassure the user nothing was dropped before the editor. */
function detailCount(d: ExtractedEvent): number {
  const x = d.details
  return (
    (x.lineup?.length ?? 0) +
    (x.schedule?.length ?? 0) +
    (x.tickets?.length ?? 0) +
    (x.links?.length ?? 0) +
    (x.sponsors?.length ?? 0)
  )
}

function detailSummary(d: ExtractedEvent): string {
  const x = d.details
  const bits: string[] = []
  const add = (n: number | undefined, one: string, many: string) => {
    if (n && n > 0) bits.push(`${n} ${n === 1 ? one : many}`)
  }
  add(x.lineup?.length, 'act', 'acts')
  add(x.schedule?.length, 'time', 'times')
  add(x.tickets?.length, 'ticket tier', 'ticket tiers')
  add(x.links?.length, 'link', 'links')
  add(x.sponsors?.length, 'sponsor', 'sponsors')
  return `Vera also captured ${bits.join(', ')}.`
}
