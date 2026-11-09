import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { NOT_FOUND_METADATA } from '@/lib/seo/not-found-metadata'

// A page that is not on a Space's website, on the website's own domain (LIVE-SITE-NOT-FOUND). It used to fall
// through to the root not-found, which wears Frequency's platform header (Feed, Discover, Pricing) on someone
// else's domain, against ADR-1723: a visitor on a website is never sent back to the main site. This one has no
// platform chrome and one way out, the site's own home page. It reads no request data, so the pages stay static.
export const metadata = NOT_FOUND_METADATA

export default function SiteNotFound() {
  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-display-h2 font-bold text-text mb-3">This page isn&apos;t here.</h1>
        <p className="text-body-sm text-muted leading-relaxed mb-8">
          It may have moved, or the link&apos;s broken. Start from the front door.
        </p>
        <Button asChild>
          <Link href="/">Back home</Link>
        </Button>
      </div>
    </main>
  )
}
