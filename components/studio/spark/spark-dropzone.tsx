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
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState, useTransition } from 'react'
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
  disabled,
}: SparkDropzoneProps) {
  const docRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const takesDoc = accepts.includes('document')
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
              disabled={disabled || pending}
              className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-meta font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FileText className="h-3.5 w-3.5" aria-hidden />}
              {pending ? 'Reading…' : 'Upload a document'}
            </button>
            <input
              ref={docRef}
              type="file"
              aria-label="Upload a document"
              accept={DOC_TYPES}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) readDocument(file)
                e.target.value = '' // let the same file be picked again after a failure
              }}
            />
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

      {error && <p className="mt-2 text-meta text-warning">{error}</p>}
    </div>
  )
}
