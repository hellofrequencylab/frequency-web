'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { getPageSeoForEditor, savePageSeo } from '@/lib/page-settings/actions'

// The live SEO editor for the on-page "Page" settings panel (ADR-268). Loads the current
// route's saved SEO on open (staff-gated server action) and saves title / description /
// share-image back to the per-route store. The save re-checks staff + validates server-side;
// applied by the (main) layout's generateMetadata on the next request.
export function SeoEditor() {
  const pathname = usePathname()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [ogImage, setOgImage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    getPageSeoForEditor(pathname)
      .then((d) => {
        if (!active) return
        setTitle(d.seo_title ?? '')
        setDescription(d.seo_description ?? '')
        setOgImage(d.og_image_url ?? '')
        setLoading(false)
      })
      .catch(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [pathname])

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const r = await savePageSeo(pathname, { title, description, ogImage })
      if (isError(r)) setError(r.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  if (loading) {
    return <div className="h-44 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className={labelClasses}>Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={pending}
            className={fieldClasses}
            placeholder="Browser tab + search title"
          />
        </label>
        <label className="block space-y-1">
          <span className={labelClasses}>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            disabled={pending}
            className={`${fieldClasses} resize-none`}
            placeholder="Search and link-preview description"
          />
        </label>
        <label className="block space-y-1">
          <span className={labelClasses}>Share image URL</span>
          <input
            value={ogImage}
            onChange={(e) => setOgImage(e.target.value)}
            disabled={pending}
            className={fieldClasses}
            placeholder="https://… or /path.png"
          />
        </label>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          {saved && (
            <span className="flex items-center gap-1 text-xs font-medium text-primary-strong">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
