import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { PublishedView } from '@/lib/launch/published'

// THE PUBLISHED SCREEN (VLS-09): the body of what the person sees right after a step makes its real thing. It links to
// the page they made (the same tab, so the way back is the browser's) and offers the next step. The page around it is
// the FocusTemplate, composed in the route so the template gate sees it. Server-friendly, no hooks.
export function PublishedScreen({ view }: { view: Extract<PublishedView, { kind: 'done' }> }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {view.next ? (
          <Button asChild>
            <Link href={view.next.href}>Next: {view.next.label}</Link>
          </Button>
        ) : null}
        {view.liveHref ? (
          <Button asChild variant="secondary">
            <Link href={view.liveHref} target="_blank" rel="noopener">
              Open my Spotlight in a new tab
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}
