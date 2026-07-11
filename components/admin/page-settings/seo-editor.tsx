'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { ImageUpload } from '@/components/ui/image-upload'
import { ImageFocalPicker } from '@/components/ui/image-focal-picker'
import { DEFAULT_OBJECT_POSITION } from '@/lib/images/focal-point'
import { isError } from '@/lib/action-result'
import { getPageSeoForEditor, savePageSeo } from '@/lib/page-settings/actions'
import type { SeoPane } from '@/lib/page-settings/seo'

// The live SEO editor for the on-page Settings panel (ADR-268). It backs TWO sections of the
// settings spine, selected by `pane`:
//   - 'basics' → the page's IDENTITY: title, subtitle, header image (the top of the hierarchy).
//   - 'meta'   → SEO & META: the search description and the social share image (lower down).
// Both load the same per-route row; each SAVES only the fields its pane owns (the action merges
// over the shared row, so one pane never clobbers the other). The save re-checks staff +
// validates server-side; applied by the (main) layout's generateMetadata on the next request.
//
// NOTE on Subtitle: there is no stored per-page subtitle field yet (it would need its own
// column + downstream consumption). The Basics pane reserves its place in the hierarchy; until
// the field exists the page's own data (e.g. an entity's tagline) carries the subtitle.
export function SeoEditor({ spaceId, pane = 'meta' }: { spaceId?: string; pane?: SeoPane }) {
  const pathname = usePathname()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [ogImage, setOgImage] = useState('')
  const [headerImage, setHeaderImage] = useState('')
  const [headerFocal, setHeaderFocal] = useState(DEFAULT_OBJECT_POSITION)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    getPageSeoForEditor(pathname, spaceId)
      .then((d) => {
        if (!active) return
        setTitle(d.seo_title ?? '')
        setDescription(d.seo_description ?? '')
        setOgImage(d.og_image_url ?? '')
        setHeaderImage(d.header_image_url ?? '')
        setHeaderFocal(d.header_image_focal ?? DEFAULT_OBJECT_POSITION)
        setLoading(false)
      })
      .catch(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [pathname, spaceId])

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      // Each pane saves only the fields it owns; the action merges them over the shared row.
      const r = await savePageSeo(pathname, { title, description, ogImage, headerImage, headerFocal }, spaceId, pane)
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

  const isBasics = pane === 'basics'

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="space-y-3">
        {isBasics ? (
          <>
            <label className="block space-y-1">
              <span className={labelClasses}>Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={pending}
                className={fieldClasses}
                placeholder="The page name shown at the top, in the tab, and in search"
              />
            </label>
            {/* The WIDE banner shown at the top of the page. */}
            <ImageUpload
              label="Header image"
              hint="Wide banner shown on the page. Use 1600×500 (16:5). The whole image scales to the screen and is never cropped, so keep important text or faces inside a wide frame."
              value={headerImage || null}
              onChange={(v) => setHeaderImage(v ?? '')}
              folder="page-headers"
              disabled={pending}
            />
            {/* Focal point — only meaningful once there IS a header image to reposition. */}
            {headerImage && (
              <ImageFocalPicker
                imageUrl={headerImage}
                value={headerFocal}
                onChange={setHeaderFocal}
                label="Header focus"
                hint="Drag to choose which part of the banner stays in frame where it is cropped. Vertical matters most. Save to apply."
                disabled={pending}
              />
            )}
          </>
        ) : (
          <>
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
            {/* The COMPACT social-share image used for link previews. */}
            <ImageUpload
              label="Share image"
              hint="Link-preview image for social and messaging. Use 1200×630 (1.91:1), the standard Open Graph size."
              value={ogImage || null}
              onChange={(v) => setOgImage(v ?? '')}
              folder="page-shares"
              disabled={pending}
            />
          </>
        )}
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
