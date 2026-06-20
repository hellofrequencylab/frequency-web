'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ImagePlus, Loader2, ExternalLink, Eye, ArrowRight } from 'lucide-react'
import type { SequenceSplash } from '@/lib/onboarding/beta-sequences'
import { saveSequenceSplash, uploadSplashImage } from './actions'

const input =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-broadcast'
const label = 'block text-xs font-semibold text-subtle mb-1'

const FIELDS: { key: keyof SequenceSplash; label: string; hint?: string; area?: boolean }[] = [
  { key: 'eyebrow', label: 'Eyebrow', hint: 'Small kicker above the headline' },
  { key: 'headline', label: 'Headline' },
  { key: 'body', label: 'Body', area: true },
  { key: 'cta', label: 'CTA label' },
  { key: 'statement', label: 'Statement', hint: 'Wrap the accent word in *asterisks*' },
  { key: 'imageAlt', label: 'Image alt' },
]

// Render *accent* spans the way the splash does, so the preview is faithful.
function withAccents(text: string): ReactNode {
  return text.split(/(\*[^*]+\*)/g).map((part, i) =>
    part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
      <em key={i} className="font-bold not-italic text-primary-strong">{part.slice(1, -1)}</em>
    ) : (
      part
    ),
  )
}

export function SequenceSplashForm({ slug, splash }: { slug: string; splash: SequenceSplash }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)
  const [values, setValues] = useState<SequenceSplash>(splash)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const dirty = !saved && JSON.stringify(values) !== JSON.stringify(splash)

  // Save-before-exit: warn on a full navigation / tab close with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  function set<K extends keyof SequenceSplash>(key: K, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }))
    setSaved(false)
  }

  function save() {
    if (pending) return
    start(async () => {
      const r = await saveSequenceSplash(slug, values)
      if (r.ok) {
        setSaved(true)
        router.refresh()
      }
    })
  }

  function onPickImage(file: File | null | undefined) {
    if (!file) return
    setUploadError(null)
    setUploading(true)
    const fd = new FormData()
    fd.set('file', file)
    void uploadSplashImage(fd).then((r) => {
      setUploading(false)
      if ('error' in r) { setUploadError(r.error); return }
      set('image', r.url)
    })
  }

  const liveHref = `/beta/${slug}`

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* ── Editor ─────────────────────────────────────────── */}
      <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className={label}>
              {f.label}
              {f.hint && <span className="ml-1.5 font-normal text-subtle/70">({f.hint})</span>}
            </label>
            {f.area ? (
              <textarea className={`${input} resize-y`} rows={3} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input className={input} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </div>
        ))}

        {/* Hero image — paste a path/URL or upload a file. */}
        <div>
          <label className={label}>
            Hero image <span className="ml-1.5 font-normal text-subtle/70">(upload, or paste a public/ path or URL)</span>
          </label>
          <div className="flex items-center gap-2">
            <input className={input} value={values.image} onChange={(e) => set('image', e.target.value)} placeholder="/images/site/…" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0])} />
          </div>
          {uploadError && <p className="mt-1 text-xs text-danger">{uploadError}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          {dirty && <span className="text-xs font-medium text-warning">Unsaved changes</span>}
          {saved && <span className="inline-flex items-center gap-1 text-xs font-semibold text-success"><Check className="h-3.5 w-3.5" /> Saved &amp; published</span>}
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
          >
            {pending ? 'Saving…' : 'Save & publish'}
          </button>
        </div>
      </div>

      {/* ── Live preview ───────────────────────────────────── */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-subtle">
            <Eye className="h-3.5 w-3.5" /> Live preview {dirty && <span className="font-normal text-warning">· unpublished edits</span>}
          </p>
          <a href={liveHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong hover:underline">
            <ExternalLink className="h-3 w-3" /> View live page
          </a>
        </div>
        <SplashPreview values={values} />
      </div>
    </div>
  )
}

// A faithful-enough render of the splash for the editor preview (mirrors the public
// splash layout: hero image, eyebrow, headline, body, accent statement, CTA).
function SplashPreview({ values }: { values: SequenceSplash }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      {values.image ? (
        <div className="relative h-44 w-full bg-surface-elevated">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={values.image} alt={values.imageAlt || ''} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="h-44 w-full bg-gradient-to-br from-primary via-signal to-signal-strong opacity-80" />
      )}
      <div className="p-6 text-center">
        {values.eyebrow && (
          <p className="text-3xs font-semibold uppercase tracking-widest text-primary-strong">{values.eyebrow}</p>
        )}
        {values.headline && (
          <p className="mt-2 text-balance text-2xl font-bold leading-tight text-text">{values.headline}</p>
        )}
        {values.body && (
          <p className="mx-auto mt-2 max-w-lg whitespace-pre-line text-pretty text-sm leading-relaxed text-muted">{values.body}</p>
        )}
        {values.statement && (
          <p className="mx-auto mt-3 max-w-lg text-sm font-semibold text-text">{withAccents(values.statement)}</p>
        )}
        {values.cta && (
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary">
            {values.cta} <ArrowRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </div>
  )
}
