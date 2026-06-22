'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { getEditablePageContent, savePageContent } from '@/lib/page-content-actions'
import { isError } from '@/lib/action-result'

// A minimal Subtitle (description-only) editor for the on-page Settings panel (ADR-359). It edits
// ONLY the page's header subtitle (the description), reusing the existing page-content get/save
// actions (lib/page-content-actions) — no new column, no migration. The page reads the saved value
// via resolvePageContent(route, fallback), so editing is purely additive: blank clears the override
// and the page falls back to its coded line.
//
// Used by the admin Settings trim (page-settings-module.tsx), which renders ONLY this + Layout on
// /admin routes. getEditablePageContent returns null for anyone below admin (and for a route not in
// CONTENT_EDIT_ROUTES), so the editor renders nothing for them; the save action re-checks.
export function SubtitleEditor() {
  const pathname = usePathname()
  const [description, setDescription] = useState('')
  const [editable, setEditable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    getEditablePageContent(pathname)
      .then((d) => {
        if (!active) return
        setEditable(!!d)
        setDescription(d?.description ?? '')
        setLoading(false)
      })
      .catch(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [pathname])

  if (loading) {
    return <div className="h-28 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  // Not an editable route, or the caller can't edit it.
  if (!editable) return null

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const r = await savePageContent(pathname, fd)
      if (isError(r)) setError(r.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <form onSubmit={submit} className="space-y-3">
        <label className="block space-y-1">
          <span className={labelClasses}>Subtitle</span>
          <textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            disabled={pending}
            className={`${fieldClasses} resize-none`}
            placeholder="The line shown under the page title"
          />
        </label>
        <p className="text-2xs text-subtle">Leave blank to use the page&rsquo;s built-in subtitle.</p>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          {saved && (
            <span className="flex items-center gap-1 text-xs font-medium text-primary-strong">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
