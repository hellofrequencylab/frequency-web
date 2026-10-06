'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Loader2 } from 'lucide-react'
import { Button, buttonClasses } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { setWebsitePublished } from '@/app/(main)/spaces/[slug]/manage/layout/actions'

// Publish / View / Unpublish for a Space's website (LIVE-741), on the Profile & Settings Website card.
// The server action re-gates the editor role; this client is feedback only. "View website" opens the
// address the card shows (`siteUrl`, worked out on the server: the free `<slug>.frequencylocal.com`
// subdomain, or the Space's own domain once it serves), a different origin, so a plain link.

export function WebsitePublishControls({
  slug,
  published,
  siteUrl,
}: {
  slug: string
  published: boolean
  /** The website's live address, with the scheme. */
  siteUrl: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function setPublished(next: boolean) {
    setError(null)
    start(async () => {
      const result = await setWebsitePublished(slug, next)
      if (isError(result)) return setError(result.error)
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {published ? (
          <>
            <a href={siteUrl} target="_blank" rel="noopener" className={buttonClasses('primary', 'md')}>
              <Globe className="h-4 w-4" aria-hidden />
              View website
            </a>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => setPublished(false)}>
              Unpublish
            </Button>
          </>
        ) : (
          <Button type="button" variant="primary" disabled={pending} onClick={() => setPublished(true)}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Globe className="h-4 w-4" aria-hidden />}
            Publish website
          </Button>
        )}
      </div>
      {error && <p className="text-body-sm text-danger">{error}</p>}
    </div>
  )
}
