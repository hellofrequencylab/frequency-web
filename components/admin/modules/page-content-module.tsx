'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { usePathname } from 'next/navigation'
import { Check, Pencil } from 'lucide-react'
import { AdminModuleCard } from '@/components/admin/admin-module-card'
import { InlineCover } from '@/components/admin/inline/inline-cover'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import {
  getEditablePageContent,
  savePageContent,
  uploadPageHero,
  removePageHero,
  type EditablePageContent,
} from '@/lib/page-content-actions'
import { isError } from '@/lib/action-result'

// Edit a page's content in place from its Settings panel (ADR-180): the header
// title + description (which also drive the page's SEO metadata), plus an optional
// hero image and call-to-action (PX.1). Role-gated server-side:
// getEditablePageContent returns null for anyone below admin, so the editor
// renders nothing for them. Blank fields clear the override and the page falls
// back to its coded default.
export function PageContentModule() {
  const pathname = usePathname()
  const [data, setData] = useState<EditablePageContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    getEditablePageContent(pathname).then((d) => {
      if (active) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [pathname])

  if (loading) {
    return <div className="h-32 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

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
    <AdminModuleCard title="Page content" Icon={Pencil} desc="Edit this page's title, description, hero, and call-to-action.">
      <form onSubmit={submit} className="space-y-3">
        <div className="block space-y-1">
          <span className={labelClasses}>Headline (not editable)</span>
          <p className="rounded-lg border border-border bg-surface-elevated/50 px-3 py-2 text-sm text-muted">
            {data.title || 'Default headline'}
          </p>
          <input type="hidden" name="title" value={data.title} />
        </div>
        <label className="block space-y-1">
          <span className={labelClasses}>Description</span>
          <textarea
            name="description"
            defaultValue={data.description}
            rows={2}
            disabled={pending}
            className={`${fieldClasses} resize-none`}
            placeholder="Default description"
          />
        </label>
        <div className="block space-y-1">
          <span className={labelClasses}>Hero image</span>
          <InlineCover
            value={data.heroImage || null}
            alt="Page hero image"
            canEdit
            forceEdit
            upload={uploadPageHero.bind(null, pathname)}
            remove={removePageHero.bind(null, pathname)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className={labelClasses}>CTA label</span>
            <input
              name="cta_label"
              defaultValue={data.ctaLabel}
              disabled={pending}
              className={fieldClasses}
              placeholder="e.g. Join the next event"
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClasses}>CTA link</span>
            <input
              name="cta_href"
              defaultValue={data.ctaHref}
              disabled={pending}
              className={fieldClasses}
              placeholder="/events or https://…"
            />
          </label>
        </div>
        <p className="text-2xs text-subtle">
          Leave a field blank to use the page&rsquo;s built-in default. The CTA button shows only when
          both its label and link are set.
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
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
    </AdminModuleCard>
  )
}
