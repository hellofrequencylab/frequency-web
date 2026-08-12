'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE COMMERCE SPARK (docs/STUDIO.md §0, ADR-986).
//
// The guided creation flow the three commerce entities run: Product (/market/sell), Classifieds
// listing (/classifieds/new), and a Space's bookable Service. It is NOT a fourth wizard: it composes
// the Spark kit (components/studio/spark/*) and renders whatever the entity's MANIFEST declares, so
// the only thing an entity supplies here is its own copy, its options, and its server action.
//
// WHY ONE DRIVER FOR THREE ENTITIES: the survey's finding was that every wizard on the platform grew
// its own shell, its own field CSS, and its own review screen. Building three commerce wizards that
// happen to look alike would repeat exactly that mistake one layer down. The three differ in five
// things (the gate, the loaded options, the Loom scope, the create action, and where they land), so
// those five are props and everything else is derived:
//
//   step 1  the two doors + the shared drop zone      (SparkDoors + SparkDropzone)
//   step 2  the manifest's spark fields               (sparkFields -> FieldControl, one per KIND)
//   step 3  the review board + the steering dials     (SparkReview + SparkSteer)
//
// IMAGES ARE THE POINT. Every one of these manifests declares an `images` field, which FieldControl
// renders as the Loom picker (ADR-987). A photo dropped on screen one is uploaded into the author's
// Loom and appended to that same field, so "drop a photo, it is attached" holds on all three, and
// nothing here is a bespoke uploader.
//
// The draft is kept in the ENTITY'S OWN SHAPE (the manifest paths mirror the insert payload), so the
// create action receives what it already takes. The one conversion is money: a `price` field reads
// and writes DOLLARS at the control while the draft holds the minor units its `priceCents` path
// names. See the report notes at `toControl` / `fromControl`.
//
// Voice canon: plain, no em dashes (docs/CONTENT-VOICE.md).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  FieldControl,
  SparkDoors,
  SparkDropzone,
  SparkReview,
  SparkShell,
  SparkSteer,
  StudioField,
  fieldModelText,
  useCoverOffer,
  useQualityCheck,
  type FieldOptions,
} from '@/components/studio/spark'
import { prepareImageForUpload, SERVER_MAX_BYTES } from '@/lib/library/image-shrink'
import { uploadLoomImage } from '@/lib/loom/picker-actions'
import { buildFieldModel, sparkFields } from '@/lib/studio/kernel/review-kernel'
import { DEFAULT_SEED_MOOD, type SeedMood } from '@/lib/studio/kernel/moods'
import type { ProvenanceLedger } from '@/lib/studio/kernel/ledger'
import type { EntityManifest, FieldDef, FieldKind } from '@/lib/studio/kernel/manifest'

/** A draft in the entity's own shape. The manifest's paths address into it. */
export type SparkDraft = Record<string, unknown>

/** The two fields Vera is allowed to write on these manifests (`veraDrafts` is true only here). */
export interface SparkCopy {
  title: string
  description: string
}

export interface CommerceSparkProps {
  /** The entity's declaration. Every field on screen comes from this. */
  manifest: EntityManifest
  /** The thing being made, shown as the eyebrow on every step. */
  eyebrow: string
  doors: {
    title: string
    description: ReactNode
    veraLabel?: string
    veraHint?: string
    manualLabel?: string
    manualHint?: string
    /** Rendered under the doors. The upgrade path, a house rule, anything that belongs on screen one. */
    aside?: ReactNode
  }
  details: { title: string; description: ReactNode }
  review: { title: string; description: ReactNode; createLabel: string; note?: ReactNode }
  /** The starting values (defaults the entity's writer would apply anyway, made visible). */
  initialDraft: SparkDraft
  /** Rows for any field declaring `optionsFrom`, keyed by that name. */
  loaded?: FieldOptions
  /**
   * Ghost text per field path. A placeholder is an EXAMPLE tuned to the asking surface ("e.g.
   * Hand-thrown ceramic mug" is right on /market/sell and wrong on the peer board), which is why the
   * kit takes it as a prop rather than the manifest declaring it.
   */
  placeholders?: Record<string, string>
  /**
   * Which Loom the image fields open in. Pass a Space id inside a Space, so a pick files into that
   * Space's library and is reusable there. Omit it for a member listing their own thing: the picker
   * then opens their own Loom plus every Space they operate.
   */
  scopeKey?: string
  /** Ask Vera for the copy. Everything staged so far is handed over; only `title` + `description` come back. */
  onDraftCopy: (input: {
    draft: SparkDraft
    sourceText: string
    mood: SeedMood
    directions: string
  }) => Promise<SparkCopy>
  /** Persist it. Returns a plain reason on failure; on success the server action navigates. */
  onCreate: (draft: SparkDraft) => Promise<string | null>
  /** The way out, on every step. */
  cancel: { label: string; href: string }
}

// ── Reading and writing a dotted path on the draft ───────────────────────────────────────

/** Walk a dotted path ('metadata.service.priceModel'). Undefined at any dead end. PURE. */
function readAt(draft: SparkDraft, path: string): unknown {
  let cur: unknown = draft
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

/** Set a dotted path, cloning every level it passes through. Never mutates the input. PURE. */
function writeAt(draft: SparkDraft, path: string, value: unknown): SparkDraft {
  const [head, ...rest] = path.split('.')
  if (rest.length === 0) return { ...draft, [head]: value }
  const child = draft[head]
  const base = child && typeof child === 'object' && !Array.isArray(child) ? (child as SparkDraft) : {}
  return { ...draft, [head]: writeAt(base, rest.join('.'), value) }
}

// ── The control <-> draft conversion, by field KIND (never by entity) ─────────────────────

/** Kinds whose control value is a list. */
const LIST_KINDS: readonly FieldKind[] = ['images', 'tags', 'daterange']

/**
 * The draft value as the control wants it.
 *
 * MONEY: a `price` field is declared on a `priceCents` path (minor units, mirroring the commerce
 * insert payload), while a human types dollars. The kernel's `price` kind carries no unit, so the
 * surface has to know. Converted here, in one place, rather than in three wizards.
 */
function toControl(def: FieldDef, draft: SparkDraft): string | string[] {
  const raw = readAt(draft, def.path)
  if (LIST_KINDS.includes(def.kind)) return Array.isArray(raw) ? raw.map((v) => String(v)) : []
  if (def.kind === 'toggle') return raw === true ? 'true' : 'false'
  if (def.kind === 'price') return typeof raw === 'number' && Number.isFinite(raw) ? String(raw / 100) : ''
  if (raw === null || raw === undefined) return ''
  return String(raw)
}

/** The control's value as the draft wants it. Inverse of `toControl`. PURE. */
function fromControl(def: FieldDef, next: string | string[]): unknown {
  if (LIST_KINDS.includes(def.kind)) return Array.isArray(next) ? next : next ? [next] : []
  const text = Array.isArray(next) ? next.join(', ') : next
  if (def.kind === 'toggle') return text === 'true'
  if (def.kind === 'price') {
    const dollars = Number(text)
    return text.trim() && Number.isFinite(dollars) ? Math.round(dollars * 100) : null
  }
  if (def.kind === 'number' || def.kind === 'duration') {
    const n = Number(text)
    return text.trim() && Number.isFinite(n) ? Math.round(n) : null
  }
  return text
}

/**
 * Kinds the REVIEW BOARD may safely write back. The board edits the RENDERED string (which for a
 * field with a `read` override is a composed value, e.g. "2 photos"), so a kind whose value does not
 * round-trip through one text box is left to the fields step instead of being silently corrupted.
 * See the note in the PR: `FieldState.editable` is hardcoded true in the kernel, so a surface cannot
 * declare a row read-only.
 */
const BOARD_EDITABLE: readonly FieldKind[] = [
  'text', 'longtext', 'slug', 'select', 'icon', 'color', 'url', 'email', 'phone', 'address', 'hours',
  'price', 'rating', 'number', 'duration', 'date', 'datetime', 'cadence', 'place',
]

/** A per-KIND hint, so a control says what unit it wants without any entity restating it. */
const KIND_HINT: Partial<Record<FieldKind, string>> = {
  price: 'In US dollars.',
  duration: 'In minutes.',
  images: 'Pick from your Loom, or upload a new photo. The first one is the cover.',
}

// ── The flow ─────────────────────────────────────────────────────────────────────────────

type Stage = 'doors' | 'details' | 'review'
const STAGE_STEP: Record<Stage, number> = { doors: 1, details: 2, review: 3 }
const STAGE_LABEL: Record<Stage, string> = { doors: 'How to start', details: 'The details', review: 'Review' }
const TOTAL_STEPS = 3

export function CommerceSpark({
  manifest,
  eyebrow,
  doors,
  details,
  review,
  initialDraft,
  loaded,
  placeholders,
  scopeKey,
  onDraftCopy,
  onCreate,
  cancel,
}: CommerceSparkProps) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('doors')
  const [draft, setDraft] = useState<SparkDraft>(initialDraft)
  const [sourceText, setSourceText] = useState('')
  const [staged, setStaged] = useState<File[]>([])
  const [mood, setMood] = useState<SeedMood>(DEFAULT_SEED_MOOD)
  const [directions, setDirections] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Whether the author has typed anything on the fields step. The "still needed" line waits for it,
  // so an untouched form is not scolded in warning colour the moment it opens.
  const [touched, setTouched] = useState(false)
  const [pending, start] = useTransition()
  /**
   * Where each drafted value came from (kernel/ledger.ts). Empty until something is drafted rather
   * than typed: today the only writer is a cover Vera draws, whose provenance is what lights the
   * board's existing "Made by Vera" badge with no new render code.
   */
  const [ledger, setLedger] = useState<ProvenanceLedger>({})

  // Everything on screen 2 comes from the manifest: `placement: 'spark'`, plus anything required.
  const fields = useMemo(() => sparkFields(manifest), [manifest])
  const required = useMemo(() => fields.filter((f) => f.required), [fields])
  const imagesField = useMemo(() => manifest.fields.find((f) => f.kind === 'images'), [manifest])
  const byPath = useMemo(() => new Map<string, FieldDef>(manifest.fields.map((f) => [f.path, f])), [manifest])
  const model = useMemo(() => buildFieldModel(manifest, draft, ledger), [manifest, draft, ledger])

  const missing = required.filter((f) => {
    const v = toControl(f, draft)
    return Array.isArray(v) ? v.length === 0 : !v.trim()
  })

  const setField = (def: FieldDef, next: string | string[]) => {
    setTouched(true)
    setDraft((d) => writeAt(d, def.path, fromControl(def, next)))
  }

  /**
   * Push the photos the author dropped on screen one into their Loom and append the URLs to the
   * manifest's `images` field. This is the whole reason the drop zone hands images BACK rather than
   * parsing them: what a photo MEANS is the entity's business, and for a commerce listing it means
   * "this is one of the pictures".
   */
  const absorbStaged = async (current: SparkDraft): Promise<SparkDraft> => {
    if (!imagesField || staged.length === 0) return current
    const existing = toControl(imagesField, current) as string[]
    const added: string[] = []
    for (const raw of staged) {
      const prepared = await prepareImageForUpload(raw)
      if ('error' in prepared) {
        setError(prepared.error)
        continue
      }
      if (prepared.file.size > SERVER_MAX_BYTES) {
        setError(`${raw.name} is too big to upload. Try a smaller photo.`)
        continue
      }
      const fd = new FormData()
      fd.append('file', prepared.file)
      try {
        // The member's own Loom unless a Space scope was passed, matching the picker the field opens.
        const res = await uploadLoomImage(scopeKey ?? 'mine', fd)
        if ('error' in res) {
          setError(res.error)
          continue
        }
        added.push(res.url)
      } catch {
        setError('That photo would not upload. You can still pick one from the Loom.')
      }
    }
    setStaged([])
    return added.length ? writeAt(current, imagesField.path, [...existing, ...added]) : current
  }

  /**
   * Write Vera's copy onto the declared paths. Only the two fields these manifests mark
   * `veraDrafts: true` are ever written, and only when the manifest actually declares them, so a
   * photo, a price, or a status can never be replaced by a draft.
   */
  const applyCopy = (base: SparkDraft, copy: SparkCopy): SparkDraft => {
    let next = base
    for (const [path, value] of [['title', copy.title], ['description', copy.description]] as const) {
      if (!value || !byPath.has(path)) continue
      next = writeAt(next, path, value)
    }
    return next
  }

  const enterDetails = (withVera: boolean) =>
    start(async () => {
      setError(null)
      let next = await absorbStaged(draft)
      if (withVera) {
        const copy = await onDraftCopy({ draft: next, sourceText, mood, directions })
        next = applyCopy(next, copy)
      }
      setDraft(next)
      setStage('details')
    })

  const redraw = () =>
    start(async () => {
      setError(null)
      const copy = await onDraftCopy({ draft, sourceText, mood, directions })
      setDraft((d) => applyCopy(d, copy))
    })

  const create = () =>
    start(async () => {
      setError(null)
      const reason = await onCreate(draft)
      if (reason) setError(reason)
    })

  // ── The two review-step offers (ADR-993 / ADR-995) ──
  //
  // Both are OFFERS and neither can block the create button below. The cover is only ever offered
  // when the MANIFEST declares an image field Vera may fill (`veraDrafts !== false`), which is why
  // the three commerce entities do not see it today: a product photo, a listing's photos, and a
  // service's photos must show the real thing. Declare a fillable image field on one of them and
  // the offer appears here with no change to this file.

  const coverState = useCoverOffer({
    entity: manifest.entity,
    manifest,
    draft,
    subject: {
      title: String(readAt(draft, 'title') ?? ''),
      summary: String(readAt(draft, 'description') ?? ''),
      mood,
      directions,
    },
    scopeKey,
    // The generated image is already a real asset in the author's Loom (ADR-987). All that happens
    // here is putting its URL on the declared path and recording WHERE it came from.
    onApply: (cover, offer) => {
      setDraft((d) => {
        const current = readAt(d, cover.path)
        const list = Array.isArray(current) ? current.map((v) => String(v)) : []
        return writeAt(d, cover.path, offer.multiple ? [...list, cover.url] : cover.url)
      })
      setLedger((l) => ({ ...l, [cover.path]: [cover.provenance] }))
    },
    onRemove: (cover) => {
      setDraft((d) => {
        const current = readAt(d, cover.path)
        if (Array.isArray(current)) return writeAt(d, cover.path, current.filter((v) => v !== cover.url))
        return writeAt(d, cover.path, '')
      })
      setLedger((l) => {
        const next = { ...l }
        delete next[cover.path]
        return next
      })
    },
  })

  // The verdict is ADVICE. It is not stored, it is not sent with the create, and it never disables
  // the create button.
  const qualityState = useQualityCheck({ entity: manifest.entity, read: () => fieldModelText(model) })

  const exits = [{ label: cancel.label, onSelect: () => router.push(cancel.href) }]

  if (stage === 'doors') {
    return (
      <SparkShell
        eyebrow={eyebrow}
        title={doors.title}
        description={doors.description}
        step={STAGE_STEP.doors}
        totalSteps={TOTAL_STEPS}
        stepLabel={STAGE_LABEL.doors}
        error={error}
        exits={exits}
      >
        <SparkDoors
          entityLabel={manifest.label}
          onVera={() => enterDetails(true)}
          onManual={() => enterDetails(false)}
          veraLabel={doors.veraLabel}
          veraHint={doors.veraHint}
          manualLabel={doors.manualLabel}
          manualHint={doors.manualHint}
          disabled={pending}
        >
          <SparkDropzone
            accepts={manifest.accepts ?? []}
            sourceText={sourceText}
            onSourceText={setSourceText}
            images={staged}
            onImages={setStaged}
            disabled={pending}
          />
        </SparkDoors>

        {pending && (
          <p className="mt-4 text-meta text-muted" role="status">
            Getting things ready…
          </p>
        )}
        {doors.aside && <div className="mt-6">{doors.aside}</div>}
      </SparkShell>
    )
  }

  if (stage === 'details') {
    return (
      <SparkShell
        eyebrow={eyebrow}
        title={details.title}
        description={details.description}
        step={STAGE_STEP.details}
        totalSteps={TOTAL_STEPS}
        stepLabel={STAGE_LABEL.details}
        onBack={() => setStage('doors')}
        onNext={() => setStage('review')}
        nextLabel="Review it"
        nextDisabled={missing.length > 0}
        busy={pending}
        error={error ?? (touched && missing.length > 0 ? `Still needed: ${missing.map((f) => f.label).join(', ')}.` : null)}
        exits={exits}
      >
        <div className="space-y-5">
          {fields.map((def) => (
            <SparkFieldRow
              key={def.path}
              def={def}
              value={toControl(def, draft)}
              onChange={(next) => setField(def, next)}
              loaded={loaded}
              placeholder={placeholders?.[def.path]}
              scopeKey={scopeKey}
              disabled={pending}
            />
          ))}
        </div>
      </SparkShell>
    )
  }

  return (
    <SparkShell
      eyebrow={eyebrow}
      title={review.title}
      description={review.description}
      step={STAGE_STEP.review}
      totalSteps={TOTAL_STEPS}
      stepLabel={STAGE_LABEL.review}
      onBack={() => setStage('details')}
      onNext={create}
      nextLabel={review.createLabel}
      busy={pending}
      error={error}
      exits={exits}
    >
      <SparkReview
        model={model}
        cover={coverState.offer}
        quality={qualityState.check}
        disabled={pending}
        onEdit={(path, value) => {
          const def = byPath.get(path)
          // A row the board cannot round-trip (a photo list, a tag list, a toggle) is edited on the
          // fields step, which owns the real control for that kind.
          if (!def || !BOARD_EDITABLE.includes(def.kind)) return
          setDraft((d) => writeAt(d, def.path, fromControl(def, value)))
        }}
      />

      {manifest.steer && (
        <div className="mt-5">
          <SparkSteer
            steer={manifest.steer}
            mood={mood}
            onMood={setMood}
            directions={directions}
            onDirections={setDirections}
            // No lock pins on a CREATE flow: there is no saved draft to protect, and the redraw only
            // ever touches the two fields Vera drafts.
            onRedraw={redraw}
            redrawLabel="Write it again with Vera"
            busy={pending}
          />
        </div>
      )}

      {review.note && <p className="mt-4 text-2xs leading-relaxed text-muted">{review.note}</p>}
    </SparkShell>
  )
}

/**
 * One declared field, labeled. The label grammar comes from the kit (`StudioField`) and the control
 * from the field kit (`FieldControl`), so nothing here decides how a field of any kind looks. A
 * `toggle` supplies its own label, so it is not wrapped twice.
 */
function SparkFieldRow({
  def,
  value,
  onChange,
  loaded,
  placeholder,
  scopeKey,
  disabled,
}: {
  def: FieldDef
  value: string | string[]
  onChange: (next: string | string[]) => void
  loaded?: FieldOptions
  placeholder?: string
  scopeKey?: string
  disabled?: boolean
}) {
  const control = (
    <FieldControl
      def={def}
      value={value}
      onChange={onChange}
      loaded={loaded}
      placeholder={placeholder}
      scopeKey={scopeKey}
      disabled={disabled}
      hint={KIND_HINT[def.kind]}
    />
  )

  if (def.kind === 'toggle') return control

  return (
    <StudioField
      label={
        <span>
          {def.label}
          {!def.required && <span className="ml-1 font-normal normal-case text-subtle">(optional)</span>}
        </span>
      }
    >
      {control}
    </StudioField>
  )
}
