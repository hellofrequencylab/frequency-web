'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE SHARED DROP ZONE (docs/STUDIO.md, ADR-597).
//
// One upload control, on screen one, for every entity. What it accepts is DECLARED by the
// manifest (`accepts: ['url' | 'document' | 'image' | 'paste']`), so an entity turns a capability
// on with a data change instead of building an uploader.
//
// The survey found this scattered four ways: Journey and Circle took documents (PDF/Word/text),
// the Event Spark took a flyer photo but only on its import branch, and Practice had the upload
// ICON on screen one with no file input behind it. Meanwhile the Business Seeder, the surface with
// the most source material of all, had no upload on its start form at all: photos could only be
// attached later, at review.
//
// Documents are parsed here (shared server action). IMAGES are deliberately handed BACK to the
// caller rather than parsed: reading a flyer is vision OCR, which is per-entity, budgeted, and
// already implemented for events. The drop zone stages the file; the entity decides what seeing it
// means.
//
// ── MANY DOCUMENTS AT ONCE (`onDocuments`) ──────────────────────────────────────────────────────
// One document at a time is the default and reads through the shared action. An entity whose whole
// promise is "bring the lot" — the Journey, with an outline plus every handout — passes
// `onDocuments` and gets a MULTIPLE input, handing the files back unparsed the way images already
// are, because reading a stack is a per-entity budgeted call (extractOverviewFilesAction), not a
// shared one. This seam exists because the Journey had built its own second uploader beside this
// zone: two buttons, two labels, two file inputs, one job. The capability belongs here.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState, useTransition, type ReactNode } from 'react'
import { FileText, ImagePlus, Loader2, Upload, X } from 'lucide-react'
import { Textarea } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { extractSourceTextAction } from '@/lib/studio/spark-actions'
import type { SparkAccepts } from '@/lib/studio/kernel/manifest'

const DOC_TYPES = '.pdf,.doc,.docx,.txt,.md,application/pdf,text/plain,text/markdown'
const IMAGE_TYPES = 'image/*'

export interface SparkDropzoneProps {
  /** From the manifest. Declares which affordances appear. */
  accepts: readonly SparkAccepts[]
  /** The accumulated source text (parsed documents + anything pasted). Controlled. */
  sourceText: string
  onSourceText: (next: string) => void
  /** Images the author staged. The entity decides what to do with them (vision, cover, gallery). */
  images?: File[]
  onImages?: (next: File[]) => void
  /** Take MANY documents and hand them back unparsed. Turns the doc input `multiple`. See the header. */
  onDocuments?: (files: File[]) => void
  /** The doc button's words. Defaults to the single-file phrasing; say what you actually take. */
  docLabel?: string
  /** The caller is reading files right now (only meaningful with `onDocuments`). */
  docBusy?: boolean
  /** Sits beside the doc button — a scope note, an InfoTip, whatever the entity owes the reader. */
  docHint?: ReactNode
  /** Rendered under the controls. Used for an honest "could not read these" list. */
  docNote?: ReactNode
  disabled?: boolean
}

/**
 * The drop zone. Renders only the affordances the manifest declares, so an entity that takes no
 * uploads simply renders nothing rather than an empty box.
 */
export function SparkDropzone({
  accepts,
  sourceText,
  onSourceText,
  images = [],
  onImages,
  onDocuments,
  docLabel,
  docBusy = false,
  docHint,
  docNote,
  disabled,
}: SparkDropzoneProps) {
  const docRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const takesDoc = accepts.includes('document')
  // With `onDocuments` the caller owns both the reading and the busy state, so the zone's own
  // transition is not what to spin on.
  const docReading = onDocuments ? docBusy : pending
  const takesImage = accepts.includes('image')
  const takesPaste = accepts.includes('paste') || accepts.includes('url')
  if (!takesDoc && !takesImage && !takesPaste) return null

  const readDocument = (file: File) => {
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    start(async () => {
      const res = await extractSourceTextAction(fd)
      if (isError(res)) {
        setError(res.error)
        return
      }
      // APPEND rather than replace: an author often has several sources (an outline plus a price
      // list). Replacing would silently destroy the first one.
      onSourceText(sourceText.trim() ? `${sourceText}\n\n${res.data.text}` : res.data.text)
    })
  }

  return (
    <div className="rounded-card border border-dashed border-border-strong bg-surface/50 p-4">
      <p className="flex items-center gap-1.5 text-meta font-semibold text-text">
        <Upload className="h-3.5 w-3.5 text-primary-strong" aria-hidden />
        Already have it written?
      </p>
      <p className="mt-1 text-2xs leading-snug text-muted">
        Drop in what you have and Vera builds from it. This works whichever way you start.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {takesDoc && (
          <>
            <button
              type="button"
              onClick={() => docRef.current?.click()}
              disabled={disabled || docReading}
              className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-meta font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
            >
              {docReading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FileText className="h-3.5 w-3.5" aria-hidden />}
              {docReading ? 'Reading…' : (docLabel ?? 'Upload a document')}
            </button>
            <input
              ref={docRef}
              type="file"
              multiple={!!onDocuments}
              aria-label={docLabel ?? 'Upload a document'}
              accept={DOC_TYPES}
              className="sr-only"
              onChange={(e) => {
                const picked = e.target.files ? Array.from(e.target.files) : []
                if (picked.length) {
                  if (onDocuments) onDocuments(picked)
                  else readDocument(picked[0])
                }
                e.target.value = '' // let the same file be picked again after a failure
              }}
            />
            {docHint}
          </>
        )}

        {takesImage && onImages && (
          <>
            <button
              type="button"
              onClick={() => imageRef.current?.click()}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-meta font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
            >
              <ImagePlus className="h-3.5 w-3.5" aria-hidden />
              Add photos
            </button>
            <input
              ref={imageRef}
              type="file"
              aria-label="Add photos"
              accept={IMAGE_TYPES}
              multiple
              className="sr-only"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? [])
                if (picked.length) onImages([...images, ...picked])
                e.target.value = ''
              }}
            />
          </>
        )}
      </div>

      {images.length > 0 && onImages && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {images.map((file, i) => (
            <li key={`${file.name}-${i}`}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onImages(images.filter((_, j) => j !== i))}
                className="inline-flex max-w-48 items-center gap-1 rounded-pill border border-border bg-surface px-2.5 py-1 text-2xs text-muted transition-colors hover:text-text disabled:opacity-50"
              >
                <span className="truncate">{file.name}</span>
                <X className="h-3 w-3 shrink-0" aria-hidden />
                <span className="sr-only">Remove {file.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {takesPaste && (
        <div className="mt-3">
          <label htmlFor="spark-source" className="mb-1 block text-2xs font-medium uppercase tracking-wide text-muted">
            Or paste it
          </label>
          <Textarea
            id="spark-source"
            rows={3}
            className="min-h-16 resize-y"
            placeholder="Paste an outline, a write-up, a link, or anything you already wrote."
            value={sourceText}
            onChange={(e) => onSourceText(e.target.value)}
            disabled={disabled}
          />
        </div>
      )}

      {docNote}
      {error && <p className="mt-2 text-meta text-warning">{error}</p>}
    </div>
  )
}
