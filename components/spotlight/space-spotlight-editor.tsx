'use client'

import { useCallback, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { ExternalLink, QrCode } from 'lucide-react'
import { EntityLayoutProvider, type SaveLayout } from '@/components/entity-blocks/profile-layout-context'
import { EntityPageBuilder, type BuilderRailData } from '@/components/entity-blocks/profile-page-builder'
import { Switch } from '@/components/ui/switch'
import { UpgradeMoment, type UpgradeMomentSetup } from '@/components/pricing/upgrade-moment'
import { SPACE_SPOTLIGHT_BLOCK_IDS } from '@/lib/spaces/spotlight'
import {
  saveSpaceSpotlightLayout,
  setSpaceSpotlightPublished,
} from '@/app/(main)/spaces/[slug]/manage/spotlight/actions'

// THE SPACE SPOTLIGHT EDITOR (LIVE-851). The SAME builder the member Spotlight, the Space page and the email
// studio use (EntityPageBuilder over the shared EntityLayoutProvider), mounted here with the Space kind, the
// Spotlight palette and one column, and an injected save that writes only `preferences.spotlight`. Beside it,
// the server-built `preview` (a LiveProfileGrid in the Space's accent, see the console page) renders INSIDE
// this provider, so a reorder or a text edit repaints it at once. The publish switch puts the page on the
// network.
//
// The preview carries no Space slug, so it never turns on the Space page's inline editors or its publish
// bar: block text is edited in the rail, like the member Spotlight. Voice canon: no em dashes.

export function SpaceSpotlightEditor({
  slug,
  seed,
  preview,
  initialPublished,
  readOnly,
  upgrade,
}: {
  slug: string
  /** The builder seed: the Spotlight layout plus the Space's locked blocks and picker data. Null when the
   *  viewer cannot edit (a staff previewer), which renders the builder as nothing (fail-safe). */
  seed: BuilderRailData | null
  /** The live preview, server-built: it must render inside this provider to follow the edits. */
  preview: ReactNode
  initialPublished: boolean
  readOnly: boolean
  /** Present when the Space's plan cannot take payments: product, Journey, event and membership cards are
   *  then held back (LIVE-854), and this note offers the upgrade where the owner is choosing cards. */
  upgrade?: UpgradeMomentSetup
}) {
  const save = useCallback<SaveLayout>((payload) => saveSpaceSpotlightLayout(slug, payload), [slug])
  const loadRailData = useCallback(async () => seed, [seed])
  const [published, setPublished] = useState(initialPublished)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [showUpgrade, setShowUpgrade] = useState(false)

  const onPublish = (next: boolean) => {
    setPublished(next)
    setError(null)
    startTransition(async () => {
      const res = await setSpaceSpotlightPublished(slug, next)
      if (res.error) {
        setPublished(!next)
        setError(res.error)
      }
    })
  }

  const href = `/spaces/${slug}/spotlight`

  return (
    <EntityLayoutProvider kind="space" save={save}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <section className="space-y-2 rounded-card border border-border bg-surface p-4" aria-label="Publish">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p id="spotlight-live" className="text-body-sm font-bold text-text">
                  {published ? 'Your Spotlight is live' : 'Your Spotlight is hidden'}
                </p>
                <p className="text-meta text-muted">
                  {published ? 'Anyone with the link can see it.' : 'Turn it on when you are ready to share it.'}
                </p>
              </div>
              <Switch
                checked={published}
                onCheckedChange={onPublish}
                pending={pending}
                disabled={readOnly}
                aria-labelledby="spotlight-live"
              />
            </div>
            {published && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Link
                  href={href}
                  target="_blank"
                  className="inline-flex items-center gap-1 text-meta font-medium text-primary-strong hover:underline"
                >
                  frequencylocal.com{href} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Link>
                {/* QR & Share (LIVE-853): the Space's QR studio with a code for this page filled in. */}
                <Link
                  href={`/spaces/${slug}/settings/qr?title=Spotlight&target=${encodeURIComponent(href)}`}
                  className="inline-flex items-center gap-1 text-meta font-medium text-primary-strong hover:underline"
                >
                  <QrCode className="h-3.5 w-3.5" aria-hidden /> Make a QR code
                </Link>
              </div>
            )}
            {error && (
              <p className="text-meta font-medium text-danger" role="alert">
                {error}
              </p>
            )}
          </section>

          {upgrade && !readOnly && (
            <section className="space-y-2 rounded-card border border-border bg-surface p-4" aria-label="Selling cards">
              <p className="text-body-sm text-text">
                Product, Journey, event and membership cards come with Business. Book, Contact and Links are free.
              </p>
              {showUpgrade ? (
                <UpgradeMoment
                  surface="product"
                  target={upgrade.target}
                  offer={upgrade.offer}
                  onKeepFree={() => setShowUpgrade(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowUpgrade(true)}
                  className="text-meta font-medium text-primary-strong hover:underline"
                >
                  See what Business adds
                </button>
              )}
            </section>
          )}

          {seed && (
            <EntityPageBuilder
              pageId={slug}
              kind="space"
              loadRailData={loadRailData}
              seed={seed}
              paletteBlockIds={SPACE_SPOTLIGHT_BLOCK_IDS}
              maxColumns={1}
            />
          )}
        </div>

        <section aria-label="Preview" className="min-w-0">
          <p className="eyebrow mb-2 text-muted">Preview</p>
          {preview}
        </section>
      </div>
    </EntityLayoutProvider>
  )
}
