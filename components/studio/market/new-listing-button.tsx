import Link from 'next/link'
import { Plus } from 'lucide-react'

// The "Post a listing" entry point on the Classifieds board (ADR-148).
//
// It used to BE the whole creation surface: a Studio window that collected every field at once and
// took photos as URLs typed into a textarea, one per line. Since ADR-986 the creation flow is the
// Listing SPARK at /classifieds/new, which derives its fields from LISTING_MANIFEST and puts photos
// on the Loom. So this is now what its name says: a button that opens it.
//
// A LINK, not a modal launcher, on purpose. A Spark is a staged flow that runs inside the app shell
// and is deep-linkable, which is the Studio contract (docs/STUDIO.md §1): a member can be sent
// straight to /classifieds/new, and a half-finished post is not trapped behind a backdrop click.

export function NewListingButton({ className }: { className?: string }) {
  return (
    <Link
      href="/classifieds/new"
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover'
      }
    >
      <Plus className="h-4 w-4" aria-hidden /> Post a listing
    </Link>
  )
}
