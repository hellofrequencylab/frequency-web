'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/field'
import { SITE_URL } from '@/lib/site'
import { saveHomeSeo } from './actions'

// Title + meta description for '/', with a search-result preview so the owner sees
// what they're shipping. Blank fields fall back to the coded copy.

const LABEL = 'mb-1 block text-meta font-semibold text-subtle'

export function HomeSeoForm({
  initial,
  fallback,
}: {
  /** Current overrides ('' = none set; the coded copy is live). */
  initial: { title: string; description: string }
  /** The coded strings that apply when a field is blank. */
  fallback: { title: string; description: string }
}) {
  const router = useRouter()
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const dirty = title !== initial.title || description !== initial.description

  function save() {
    if (pending) return
    setError(null)
    start(async () => {
      const fd = new FormData()
      fd.set('title', title)
      fd.set('description', description)
      const r = await saveHomeSeo(fd)
      if (!r.ok) { setError(r.error ?? 'Could not save.'); return }
      setSaved(true)
      router.refresh()
    })
  }

  const effectiveTitle = title.trim() || fallback.title
  const effectiveDescription = description.trim() || fallback.description

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-card border border-border bg-surface p-5 lift-1">
        <div>
          <label className={LABEL} htmlFor="home-seo-title">
            Title <span className="ml-1.5 font-normal text-subtle/70">· blank = the coded title</span>
          </label>
          <Input
            id="home-seo-title"
            value={title}
            maxLength={200}
            placeholder={fallback.title}
            onChange={(e) => { setTitle(e.target.value); setSaved(false) }}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="home-seo-description">
            Meta description <span className="ml-1.5 font-normal text-subtle/70">· blank = the coded description</span>
          </label>
          <Textarea
            id="home-seo-description"
            className="resize-y"
            rows={3}
            value={description}
            maxLength={600}
            placeholder={fallback.description}
            onChange={(e) => { setDescription(e.target.value); setSaved(false) }}
          />
        </div>
        <div className="flex items-center justify-end gap-3 pt-1">
          {error && <span className="text-meta font-medium text-danger">{error}</span>}
          {dirty && !error && <span className="text-meta font-medium text-warning">Unsaved changes</span>}
          {saved && !dirty && (
            <span className="inline-flex items-center gap-1 text-meta font-semibold text-success">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-control bg-primary px-5 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* How it reads in a search result */}
      <div className="rounded-card border border-border bg-surface p-5 lift-1">
        <p className="mb-3 text-meta font-semibold uppercase tracking-wide text-subtle">Search preview</p>
        <p className="truncate text-body font-semibold text-broadcast">{effectiveTitle}</p>
        <p className="mt-0.5 text-meta text-success">{SITE_URL.replace(/^https?:\/\//, '')}</p>
        <p className="mt-1 line-clamp-2 text-body-sm leading-relaxed text-muted">{effectiveDescription}</p>
      </div>
    </div>
  )
}
