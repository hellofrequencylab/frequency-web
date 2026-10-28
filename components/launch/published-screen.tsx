import Link from 'next/link'
import { FocusTemplate } from '@/components/templates'
import { Button } from '@/components/ui/button'
import type { PublishedView } from '@/lib/launch/published'

// THE PUBLISHED SCREEN (VLS-09): what the person sees right after a step makes its real thing. It says so, links to the
// page they made (the same tab, so the way back is the browser's), and offers the next step. Server-friendly, no hooks.
export function PublishedScreen({ view }: { view: Extract<PublishedView, { kind: 'done' }> }) {
  return (
    <FocusTemplate eyebrow="Be found" title={`Your ${view.label} is live`} description="It is up, in your own words. Look at it, or keep going." width="narrow">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {view.next ? (
            <Button asChild>
              <Link href={view.next.href}>Next: {view.next.label}</Link>
            </Button>
          ) : null}
          {view.liveHref ? (
            <Button asChild variant="secondary">
              <Link href={view.liveHref}>See what I made</Link>
            </Button>
          ) : null}
        </div>
        {view.next ? null : <p className="t2">That is every step. Anything optional you skipped stays in your profile menu.</p>}
      </div>
    </FocusTemplate>
  )
}
