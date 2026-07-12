'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIEDS & HOUSING SEEDER — the REVIEW BOARD client (Wave 1).
//
// Renders the review model field by field, KIND-driven by the draft. Each row shows its
// provenance badge (✅ from the paste / ⚠️ inferred / ✨ AI copy from the ledger), the value,
// the cited snippet, and an inline editor matched to the field type (text / textarea / number /
// yes-no / select / amenities). Every edit goes through the gated updateListingDraft action;
// the board holds only the optimistic model + transient UI state. A photo strip stages images,
// and Publish hands off to publishListingIntakeAction, then surfaces the claim link the operator
// sends to the original poster.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Loader2, Check, X, Pencil, Send, CheckCircle2, Copy, ImagePlus, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Banner, StatusChip } from '@/components/admin/status'
import { cn } from '@/lib/utils'
import { AMENITIES } from '@/lib/listings/types'
import type { ListingSeedKind } from '@/lib/listing-seeder/types'
import type { SimilarSeededListing } from '@/lib/listing-seeder/dedupe'
import {
  updateListingDraft,
  publishListingIntakeAction,
  uploadListingImages,
  removeListingImage,
  setPrimaryListingImage,
  checkListingDuplicatesAction,
  type ListingDraftPatch,
} from '../actions'
import {
  PROVENANCE_GLYPH,
  PROVENANCE_LABEL,
  type ListingReviewField,
  type ListingReviewModel,
  type ProvenanceKind,
} from '../review-model'

const PROVENANCE_TONE: Record<ProvenanceKind, 'success' | 'warning' | 'info'> = {
  fact: 'success',
  inferred: 'warning',
  generated: 'info',
}

const THROWN = 'That did not go through. Try again in a moment.'
const MAX_UPLOAD_BYTES = 9 * 1024 * 1024

export function ReviewBoard({
  intakeId,
  kind,
  status,
  initialModel,
  initialImages,
  appliedListingId,
}: {
  intakeId: string
  kind: ListingSeedKind
  status: 'review' | 'applied'
  initialModel: ListingReviewModel
  initialImages: string[]
  appliedListingId: string | null
}) {
  const router = useRouter()
  const [model, setModel] = useState<ListingReviewModel>(initialModel)
  const [images, setImages] = useState<string[]>(initialImages)
  const [published, setPublished] = useState<boolean>(status === 'applied')
  const [claimUrl, setClaimUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [publishing, startPublish] = useTransition()
  const [duplicates, setDuplicates] = useState<SimilarSeededListing[]>([])

  // Soft dedupe: on load (while still unpublished) check for a similar seeded listing and surface a
  // warning banner. Advisory only — it never blocks Publish. Fail-safe: any error leaves it empty.
  useEffect(() => {
    if (published) return
    let active = true
    checkListingDuplicatesAction(intakeId)
      .then((hits) => {
        if (active) setDuplicates(hits)
      })
      .catch(() => {
        if (active) setDuplicates([])
      })
    return () => {
      active = false
    }
  }, [intakeId, published])

  const s = model.summary

  function onFieldUpdate(next: ListingReviewModel) {
    setModel(next)
  }

  function publish() {
    setError(null)
    startPublish(async () => {
      try {
        const res = await publishListingIntakeAction(intakeId)
        if (!res.ok) {
          setError(res.error)
          return
        }
        setPublished(true)
        setClaimUrl(res.claimUrl)
        router.refresh()
      } catch {
        setError(THROWN)
      }
    })
  }

  function copyClaim() {
    if (!claimUrl) return
    const full = typeof window !== 'undefined' ? new URL(claimUrl, window.location.origin).toString() : claimUrl
    navigator.clipboard?.writeText(full).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      },
      () => {},
    )
  }

  return (
    <div className="space-y-6">
      {/* Roll-up + publish */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusChip tone="success" size="sm">✅ {s.facts} from the paste</StatusChip>
          <StatusChip tone="warning" size="sm">⚠️ {s.inferred} inferred</StatusChip>
          <StatusChip tone="info" size="sm">✨ {s.generated} AI copy</StatusChip>
          {s.empty > 0 && <span className="text-xs text-muted">{s.empty} field{s.empty === 1 ? '' : 's'} still empty</span>}
        </div>
        {!published && (
          <Button onClick={publish} disabled={publishing || !model.title || model.title === 'Untitled listing'}>
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {publishing ? 'Publishing…' : 'Publish listing'}
          </Button>
        )}
      </div>

      {!published && duplicates.length > 0 && (
        <Banner tone="warning" title="A similar seeded listing may already exist">
          <span>
            Check before you publish so you do not double-seed:
          </span>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {duplicates.map((d) => (
              <li key={d.id}>
                {d.title}
                <span className="text-muted"> · {d.claimed ? 'already claimed' : 'still unclaimed'}</span>
              </li>
            ))}
          </ul>
        </Banner>
      )}

      {error && (
        <Banner tone="critical" title="Could not publish the listing">
          {error}
        </Banner>
      )}

      {/* Published: the claim link the operator sends the poster */}
      {published && (
        <div className="rounded-2xl border border-success/30 bg-success-bg p-4" role="status">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Published, held by Frequency
          </p>
          <p className="mt-1 text-sm text-muted">
            The listing is live under the Frequency account. Send the poster the claim link so they can sign up
            and take ownership.
          </p>
          {claimUrl ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-2.5 py-1.5 text-2xs text-text">
                {claimUrl}
              </code>
              <Button size="sm" variant="secondary" onClick={copyClaim}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-2xs text-muted">
              No claim link was issued. The listing is still live under the Frequency account.
            </p>
          )}
        </div>
      )}

      {/* Photos */}
      <PhotoStrip intakeId={intakeId} images={images} setImages={setImages} />

      {/* Sections */}
      {model.sections.map((section) => (
        <section key={section.key} className="space-y-2">
          <div>
            <h3 className="text-base font-bold text-text">{section.title}</h3>
            <p className="mt-0.5 text-sm text-muted">{section.desc}</p>
          </div>
          <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {section.fields.map((f) => (
              <FieldRow key={f.path} intakeId={intakeId} field={f} onUpdate={onFieldUpdate} />
            ))}
          </div>
        </section>
      ))}

      <p className="text-2xs text-subtle">
        Seeding a {kind === 'housing' ? 'housing' : 'classifieds'} listing.
        {appliedListingId ? ' Already published.' : ''}
      </p>
    </div>
  )
}

// ── One field row ────────────────────────────────────────────────────────────────────

function FieldRow({
  intakeId,
  field,
  onUpdate,
}: {
  intakeId: string
  field: ListingReviewField
  onUpdate: (m: ListingReviewModel) => void
}) {
  const [editing, setEditing] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Editor draft state, typed per input.
  const [text, setText] = useState(typeof field.raw === 'string' ? field.raw : '')
  const [num, setNum] = useState(typeof field.raw === 'number' ? String(field.raw) : '')
  const [bool, setBool] = useState<'yes' | 'no' | 'unset'>(field.raw === true ? 'yes' : field.raw === false ? 'no' : 'unset')
  const [amenities, setAmenities] = useState<string[]>(Array.isArray(field.raw) ? field.raw : [])

  function beginEdit() {
    setText(typeof field.raw === 'string' ? field.raw : '')
    setNum(typeof field.raw === 'number' ? String(field.raw) : '')
    setBool(field.raw === true ? 'yes' : field.raw === false ? 'no' : 'unset')
    setAmenities(Array.isArray(field.raw) ? field.raw : [])
    setEditing(true)
  }

  function patchValue(): ListingDraftPatch[string] {
    if (field.input === 'number') {
      const t = num.trim()
      if (t === '') return null
      const n = Number(t)
      return Number.isFinite(n) ? n : null
    }
    if (field.input === 'bool') return bool === 'yes' ? true : bool === 'no' ? false : null
    if (field.input === 'amenities') return amenities
    return text.trim()
  }

  function save() {
    setRowError(null)
    startTransition(async () => {
      try {
        const res = await updateListingDraft(intakeId, { [field.path]: patchValue() })
        if (!res.ok) {
          setRowError(res.error)
          return
        }
        setEditing(false)
        onUpdate(res.model)
      } catch {
        setRowError(THROWN)
      }
    })
  }

  const badgeTone = field.provenanceKind ? PROVENANCE_TONE[field.provenanceKind] : 'neutral'

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {field.provenanceKind ? (
              <StatusChip tone={badgeTone} size="sm">
                {PROVENANCE_GLYPH[field.provenanceKind]} {PROVENANCE_LABEL[field.provenanceKind]}
              </StatusChip>
            ) : (
              <StatusChip tone="neutral" size="sm">Not set</StatusChip>
            )}
            <span className="text-xs font-semibold text-text">{field.label}</span>
          </div>

          {editing ? (
            <div className="mt-2">
              <FieldEditor
                field={field}
                text={text}
                setText={setText}
                num={num}
                setNum={setNum}
                bool={bool}
                setBool={setBool}
                amenities={amenities}
                setAmenities={setAmenities}
              />
            </div>
          ) : (
            <p className={cn('mt-1 whitespace-pre-wrap break-words text-sm', field.display ? 'text-text' : 'italic text-subtle')}>
              {field.display || 'Not set'}
            </p>
          )}

          {field.snippet && !editing && (
            <p className="mt-1.5 rounded-lg border border-border bg-surface-elevated p-2 text-2xs text-muted">
              <span className="font-semibold text-subtle">From the paste: </span>“{field.snippet}”
            </p>
          )}

          {rowError && <p className="mt-1 text-2xs text-danger">{rowError}</p>}
        </div>

        {/* Controls */}
        <div className="flex shrink-0 items-center gap-1">
          {editing ? (
            <>
              <Button size="sm" variant="secondary" onClick={save} disabled={pending}>
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={beginEdit} disabled={pending}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── The per-type editor ──────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-border-strong focus:outline-none'

function FieldEditor({
  field,
  text,
  setText,
  num,
  setNum,
  bool,
  setBool,
  amenities,
  setAmenities,
}: {
  field: ListingReviewField
  text: string
  setText: (v: string) => void
  num: string
  setNum: (v: string) => void
  bool: 'yes' | 'no' | 'unset'
  setBool: (v: 'yes' | 'no' | 'unset') => void
  amenities: string[]
  setAmenities: (v: string[]) => void
}) {
  if (field.input === 'textarea') {
    return <textarea className={cn(inputCls, 'min-h-24 resize-y')} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
  }
  if (field.input === 'number') {
    return <input type="number" inputMode="decimal" className={inputCls} value={num} onChange={(e) => setNum(e.target.value)} autoFocus />
  }
  if (field.input === 'select') {
    return (
      <select className={inputCls} value={text} onChange={(e) => setText(e.target.value)} autoFocus>
        <option value="">Not set</option>
        {(field.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )
  }
  if (field.input === 'bool') {
    return (
      <select className={inputCls} value={bool} onChange={(e) => setBool(e.target.value as 'yes' | 'no' | 'unset')} autoFocus>
        <option value="unset">Not set</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    )
  }
  if (field.input === 'amenities') {
    const toggle = (slug: string) =>
      setAmenities(amenities.includes(slug) ? amenities.filter((a) => a !== slug) : [...amenities, slug])
    return (
      <div className="flex flex-wrap gap-1.5">
        {AMENITIES.map((a) => {
          const on = amenities.includes(a.slug)
          return (
            <button
              key={a.slug}
              type="button"
              onClick={() => toggle(a.slug)}
              aria-pressed={on}
              className={cn(
                'rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors',
                on ? 'border-primary bg-primary-bg text-primary-strong' : 'border-border bg-surface text-muted hover:border-border-strong',
              )}
            >
              {a.label}
            </button>
          )
        })}
      </div>
    )
  }
  return <input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
}

// ── The photo strip ──────────────────────────────────────────────────────────────────

function PhotoStrip({
  intakeId,
  images,
  setImages,
}: {
  intakeId: string
  images: string[]
  setImages: (v: string[]) => void
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, startBusy] = useTransition()

  function addFiles(files: File[]) {
    setError(null)
    const okFiles = files.filter((f) => f.type.startsWith('image/') && f.size <= MAX_UPLOAD_BYTES)
    if (okFiles.length === 0) {
      setError('Pick image files under 9 MB.')
      return
    }
    startBusy(async () => {
      const form = new FormData()
      for (const f of okFiles) form.append('files', f)
      try {
        const res = await uploadListingImages(intakeId, form)
        if (!res.ok) setError(res.error)
        else setImages(res.images)
      } catch {
        setError(THROWN)
      }
      router.refresh()
    })
  }

  function remove(url: string) {
    setError(null)
    startBusy(async () => {
      try {
        const res = await removeListingImage(intakeId, url)
        if (!res.ok) setError(res.error)
        else setImages(res.images)
      } catch {
        setError(THROWN)
      }
    })
  }

  function makePrimary(url: string) {
    setError(null)
    startBusy(async () => {
      try {
        const res = await setPrimaryListingImage(intakeId, url)
        if (!res.ok) setError(res.error)
        else setImages(res.images)
      } catch {
        setError(THROWN)
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-text">
        <ImagePlus className="h-4 w-4 text-primary-strong" aria-hidden />
        Photos
        {images.length > 0 && <span className="font-normal text-muted">· {images.length}</span>}
      </div>
      <p className="mt-0.5 text-xs text-muted">The first photo is the primary. Add, remove, or set any photo as the primary.</p>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {images.map((url, i) => (
          <div key={url} className="group relative aspect-square overflow-hidden rounded-xl border border-border">
            <Image src={url} alt="" width={240} height={240} unoptimized className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-2xs font-semibold text-white">
                <Star className="h-3 w-3 fill-current" aria-hidden /> Primary
              </span>
            )}
            <button
              type="button"
              onClick={() => remove(url)}
              disabled={busy}
              aria-label="Remove photo"
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-black/80 focus:opacity-100 group-hover:opacity-100 disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {i !== 0 && (
              <button
                type="button"
                onClick={() => makePrimary(url)}
                disabled={busy}
                aria-label="Make primary"
                className="absolute inset-x-1.5 bottom-1.5 inline-flex items-center justify-center gap-1 rounded-full bg-black/60 px-2 py-1 text-2xs font-semibold text-white opacity-0 transition-opacity hover:bg-black/80 focus:opacity-100 group-hover:opacity-100 disabled:opacity-60"
              >
                <Star className="h-3 w-3" /> Primary
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-2xs text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ImagePlus className="h-5 w-5" aria-hidden />}
          {busy ? 'Working…' : 'Add'}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) addFiles(files)
          e.target.value = ''
        }}
      />

      {error && <p className="mt-2 text-2xs text-danger">{error}</p>}
    </div>
  )
}
