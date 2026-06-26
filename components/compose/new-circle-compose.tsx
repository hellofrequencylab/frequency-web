import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { CrewGateButton } from '@/components/crew/upgrade-lightbox'

// The circle-creation popup has been retired (Starter Circles). Every "start a
// circle" entry point now routes to the full-page builder at /circles/new — the
// Journey-editor-style wizard (start from a template / upload an outline / answer
// a few questions with Vera / start from scratch).
//
// This stays a DROP-IN component so the existing mount sites (circles, channels,
// admin/circles) are untouched: same name, same props. The legacy hub / interest
// / channel props are accepted for source compatibility but no longer used — a
// Circle now binds to a Pillar, chosen inside the builder, not to a Channel at
// creation time. Safe to inline this link and drop the props in a later cleanup.
export function NewCircleCompose({
  buttonLabel = 'New Circle',
  buttonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors whitespace-nowrap',
  canCreate = true,
}: {
  hubs?: { id: string; name: string }[]
  interests?: { id: string; name: string }[]
  topicalChannelId?: string
  topicalChannelName?: string
  buttonLabel?: string
  buttonClass?: string
  /** Real Crew (or a steward/staff) may start a circle; everyone else gets the
   *  free-beta upgrade popup instead of the builder link (ADR-414). */
  canCreate?: boolean
}) {
  return (
    <CrewGateButton isCrew={canCreate} label={buttonLabel} reason="create-circle" buttonClassName={buttonClass}>
      <Link href="/circles/new" className={buttonClass}>
        <Sparkles className="h-4 w-4" /> {buttonLabel}
      </Link>
    </CrewGateButton>
  )
}
