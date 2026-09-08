'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { usePathname } from 'next/navigation'
import { Check, Globe, Pencil } from 'lucide-react'
import { AdminModuleCard } from '@/components/admin/admin-module-card'
import { InlineCover } from '@/components/admin/inline/inline-cover'
import { Button } from '@/components/ui/button'
import { Textarea, Input, labelClasses } from '@/components/ui/field'
import { SITE_SCOPE } from '@/lib/layout/editable-content'
import {
  getEditablePageContent,
  savePageContent,
  setPageHeroUrl,
  removePageHero,
  type EditablePageContent,
} from '@/lib/page-content-actions'
import { isError } from '@/lib/action-result'

// Edit a page's content in place from its Settings panel (ADR-180): the header
// title + description (which also drive the page's SEO metadata), the intro copy
// under the header (ADR-1284), plus an optional hero image and call-to-action
// (PX.1). Role-gated server-side: getEditablePageContent returns null for anyone
// below admin, so the editor renders nothing for them. Blank fields clear the
// override and the page falls back to the next rung of the copy cascade, then to
// its coded default.
//
// THE SAME FORM EDITS THE SITE ROW (PROG-P6 (b)). Pass `route={SITE_SCOPE}` and it
// edits the reserved '*' row every page inherits from (lib/layout/content-cascade.ts).
// Identity never inherits, so the site form has no title or description: what it
// offers is exactly the set of fields the cascade will carry down, and nothing that
// would be stored and never read. `/admin/page-layout/copy` is the one place that
// renders it that way; every other caller takes the current pathname.
export function PageContentModule({ route: routeProp }: { route?: string } = {}) {
  const pathname = usePathname()
  const route = routeProp ?? pathname
  const site = route === SITE_SCOPE
  const [data, setData] = useState<EditablePageContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    getEditablePageContent(route).then((d) => {
      if (active) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [route])

  if (loading) {
    return <div className="h-32 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const r = await savePageContent(route, fd)
      if (isError(r)) setError(r.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  return (
    <AdminModuleCard
      title={site ? 'Site defaults' : 'Page content'}
      Icon={site ? Globe : Pencil}
      desc={
        site
          ? 'The intro copy, hero, and call-to-action every page starts from. A section or a page that sets its own wins.'
          : "Edit this page's title, description, intro copy, hero, and call-to-action."
      }
    >
      <form onSubmit={submit} className="space-y-3">
        {!site && (
          <>
            <div className="block space-y-1">
              <span className={labelClasses}>Headline (not editable)</span>
              <p className="rounded-control border border-border bg-surface-elevated/50 px-3 py-2 text-body-sm text-muted">
                {data.title || 'Default headline'}
              </p>
              <input type="hidden" name="title" value={data.title} />
            </div>
            <label className="block space-y-1">
              <span className={labelClasses}>Description</span>
              <Textarea
                name="description"
                defaultValue={data.description}
                rows={2}
                disabled={pending} className="resize-none"
                placeholder="Default description"
              />
            </label>
          </>
        )}
        <label className="block space-y-1">
          <span className={labelClasses}>Intro copy</span>
          <Textarea
            name="body"
            defaultValue={data.body}
            rows={4}
            disabled={pending}
            placeholder={site ? 'A paragraph every page shows under its header unless it has its own.' : 'A paragraph under the header. Leave a blank line between paragraphs.'}
          />
        </label>
        <div className="block space-y-1">
          <span className={labelClasses}>Hero image</span>
          <InlineCover
            value={data.heroImage || null}
            alt={site ? 'Site default hero image' : 'Page hero image'}
            canEdit
            forceEdit
            setUrl={setPageHeroUrl.bind(null, route)}
            remove={removePageHero.bind(null, route)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className={labelClasses}>CTA label</span>
            <Input
              name="cta_label"
              defaultValue={data.ctaLabel}
              disabled={pending}
              placeholder="e.g. Join the next event"
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClasses}>CTA link</span>
            <Input
              name="cta_href"
              defaultValue={data.ctaHref}
              disabled={pending}
              placeholder="/events or https://…"
            />
          </label>
        </div>
        <p className="text-2xs text-muted">
          {site
            ? 'Leave a field blank and pages fall back to their built-in copy. The CTA button shows only when both its label and link are set.'
            : 'Leave a field blank to use what the section or the site sets, then the page’s built-in default. The CTA button shows only when both its label and link are set.'}
        </p>
        {error && <p className="text-body-sm text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          {saved && (
            <span className="flex items-center gap-1 text-meta font-medium text-primary-strong">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </AdminModuleCard>
  )
}
