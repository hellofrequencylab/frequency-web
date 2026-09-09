import Link from 'next/link'
import { Sparkles } from 'lucide-react'

// The circle-creation popup has been retired (Starter Circles). Every "start a
// circle" entry point now routes to the full-page builder at /circles/new — the
// Journey-editor-style wizard (start from a template / upload an outline / answer
// a few questions with Vera / start from scratch).
//
// 🔴 STARTING A CIRCLE IS FREE (LIVE-220). This used to wrap the link in the crew
// upgrade gate (reason "create-circle"), so a free member met the upgrade popup on
// the most important act in the product. The model is "people join free ·
// businesses host free · you pay when you start charging", and `circle.create` is
// already granted to every signed-in member in lib/core/capabilities.ts under FIRST
// ONE FREE (ADR-908) — the quantity cap lives at publish (the `circle_host` meter),
// never on the door. Do not reintroduce a gate here; same call as ADR-913 made for
// New Event. Sign-in is still required — call sites render this only when signed in.
//
// This stays a DROP-IN component so the existing mount sites (circles, channels,
// admin/circles) are untouched: same name, same props. The legacy hub / interest
// / channel props are accepted for source compatibility but no longer used — a
// Circle now binds to a Pillar, chosen inside the builder, not to a Channel at
// creation time. Safe to inline this link and drop the props in a later cleanup.
export function NewCircleCompose({
  buttonLabel = 'New Circle',
  buttonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors whitespace-nowrap',
}: {
  hubs?: { id: string; name: string }[]
  interests?: { id: string; name: string }[]
  topicalChannelId?: string
  topicalChannelName?: string
  buttonLabel?: string
  buttonClass?: string
  /** @deprecated Accepted for source compatibility only — starting a Circle is free
   *  (LIVE-220), so this no longer changes what renders. Drop it at the call sites. */
  canCreate?: boolean
}) {
  return (
    <Link href="/circles/new" className={buttonClass}>
      <Sparkles className="h-4 w-4" /> {buttonLabel}
    </Link>
  )
}
