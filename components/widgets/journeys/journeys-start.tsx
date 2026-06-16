import Link from 'next/link'
import { Sparkles, Compass, ArrowRight } from 'lucide-react'
import { NewJourneyButton } from '@/components/studio/journey/new-journey-button'

// Journeys layout module (ADR-270/294): the two ways in — build your own, or follow the
// season's official Quest. Static (no per-viewer read), so it never blocks.
export async function JourneysStart() {
  return (
    <section className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
      {/* Launch CTA — opens the Studio window in place. */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-gradient-to-br from-primary-bg/50 to-signal-bg/40 p-5 shadow-sm">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-base font-bold text-text">
            <Sparkles className="h-4 w-4 text-primary-strong" /> Start a journey
          </h2>
          <p className="mt-1 text-sm text-muted">
            From a single daily practice to a full course. Give it a face, add your practices, and share how you show up.
          </p>
        </div>
        <div>
          <NewJourneyButton />
        </div>
      </div>

      {/* This season's Quest — the official, free track that lives in My Quest. */}
      <Link
        href="/crew"
        className="group flex flex-col justify-between gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-primary"
      >
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-base font-bold text-text">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
              <Compass className="h-4 w-4" />
            </span>
            This season&apos;s Quest
          </h2>
          <p className="mt-1 text-sm text-muted">
            The season&apos;s official Journeys: guided tracks of practices, free to start, with rewards as you go.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary-strong">
          Open My Quest
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    </section>
  )
}
