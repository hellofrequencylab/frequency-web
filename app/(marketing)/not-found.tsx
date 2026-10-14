import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { NOT_FOUND_METADATA } from '@/lib/seo/not-found-metadata'
import { SITE_DESIGN } from '@/lib/theme/design'
import { SiteNotFound } from '@/components/frequency/site/shell/site-status'

// One robots directive in the head, never two (LIVE-214, ADR-1276): see the module.
export const metadata = NOT_FOUND_METADATA

export default function NotFound() {
  // Under Frequency (build-time) the website's not-found wears the kit's hero, inside the site shell
  // the (marketing) layout renders. A Frequency-only route (/stories, /features, /vision) answering
  // notFound() under DAWN never reaches this branch.
  if (SITE_DESIGN === 'frequency') return <SiteNotFound />
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <EmptyState
        variant="no-results"
        title="Page not found"
        description="This page doesn't exist, or it may have moved. Head back home."
        action={
          <Button asChild>
            <Link href="/">Back home</Link>
          </Button>
        }
      />
    </div>
  )
}
