import Link from 'next/link'
import { Plus } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'

// "New journey" for a SPACE manager. Opens the SAME guided builder as the personal /journeys/new
// (Vera's Spark wizard, templates, upload-your-course, or a blank build), reached with `?space=<slug>`
// so the new Journey is stamped to this Space and drops the author into the identical editor (owner
// directive: space Journeys must have the exact same create + edit capability as personal ones). The
// old bare-title dialog is retired. The spark page re-gates on managing the Space server-side.
export function NewSpaceJourneyButton({ slug }: { slug: string }) {
  return (
    <Link href={`/journeys/new?space=${encodeURIComponent(slug)}`} className={buttonClasses('primary', 'md')}>
      <Plus className="h-4 w-4" /> New journey
    </Link>
  )
}
