'use client'

import { useTransition } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { createSpacePracticeAction } from '@/app/(main)/spaces/[slug]/practices/actions'

// "Create a practice" for a Space's own manager. Client twin of the studio NewPracticeButton:
// it calls the Space-scoped create action (which stamps the practice to this Space, births it
// as a private draft, and redirects into the full editor). Managing the Space is the only gate,
// so there is no Crew popup here — a free member running the Space can build for their members.
export function NewSpacePracticeButton({ slug }: { slug: string }) {
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => createSpacePracticeAction(slug))}
      className={buttonClasses('primary', 'md')}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      Create a practice
    </button>
  )
}
