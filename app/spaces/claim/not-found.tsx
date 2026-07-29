import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

// The 404 a DEAD CLAIM LINK lands on. Without it, notFound() from the claim page fell all the way to
// the ROOT boundary, which is written for a signed-in member — so a business owner following an
// emailed link hit an app-shell 404 that assumed they had an account. Modelled on
// app/events/not-found.tsx, the sibling public claim surface.
//
// The copy names the real causes without confirming any of them for a stranger who guessed a token:
// "already claimed", "expired" and "never existed" all read the same from here, which is the point.
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <EmptyState
        variant="no-results"
        title="This claim link is no longer active"
        description="It may have already been used, or the page may have moved. If this is your business, search for it and use Report a bug to reach us."
        action={
          <Button asChild>
            <Link href="/spaces">Browse businesses</Link>
          </Button>
        }
      />
    </div>
  )
}
