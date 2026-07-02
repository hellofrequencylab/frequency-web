import Link from 'next/link'
import { LayoutTemplate } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'

// THE FULL PAGE EDITOR entry (the Manage "Page" panel's deep-edit button). It NAVIGATES to the
// standalone /spaces/[slug]/edit-page?page=<slug> route — a real, server-rendered full-page Puck
// editor — rather than opening the editor as an in-place lazy overlay. A fresh navigation always
// fetches the CURRENT chunk hashes, so it can never hit a stale-chunk load failure after a deploy
// (the failure that made the old in-place overlay 404 on click). The /edit-page route is the proven
// owner surface: it escapes the profile chrome, ships the editor runtime only there, and re-gates
// canEditProfile server-side. The panel still owns the compact quick-edit (layout / cover / accent /
// block order + show-hide); this button is just the reliable door to the full editor.
//
// `variant`: 'primary' is the standalone door; 'quiet' is the DEMOTED look for the Advanced foot of the
// minimal customize rail (secondary button), since Space editing is minimal-first now.
export function SpaceFullEditorButton({
  slug,
  pageSlug = 'home',
  variant = 'primary',
}: {
  slug: string
  pageSlug?: string
  variant?: 'primary' | 'quiet'
}) {
  return (
    <Link
      href={`/spaces/${slug}/edit-page?page=${encodeURIComponent(pageSlug)}`}
      className={buttonClasses(variant === 'quiet' ? 'secondary' : 'primary', variant === 'quiet' ? 'sm' : 'md')}
    >
      <LayoutTemplate className="h-4 w-4" aria-hidden />
      {variant === 'quiet' ? 'Full page builder' : 'Full page editor'}
    </Link>
  )
}
