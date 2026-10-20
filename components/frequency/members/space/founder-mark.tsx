import { Gem } from 'lucide-react'
import '@/app/themes/active/space-page'

// THE FOUNDING BUSINESS MARK, FREQUENCY (LIVE-1019). One of the first businesses on Frequency, drawn as the
// design's own pill: the pastel `--pa` fill with ink type, the way the member app marks its primary action,
// so it reads as Frequency's and not as a beige rank chip. It sits INSIDE the cover photo's top-left corner
// (the chrome's `coverBadge` slot), where a visitor sees it before the name; the old chip crowded the title.
// Status only: the locked founder rate never reaches a public page. Server component, no JS, no reads.
// The look is `.fq-founder` in app/themes/frequency/space-page.css.

export function FounderMark({ className }: { className?: string }) {
  return (
    <span
      className={className ? `fq-founder ${className}` : 'fq-founder'}
      title="Founding Business. One of the first businesses to join Frequency."
    >
      <Gem aria-hidden />
      Founding Business
    </span>
  )
}
