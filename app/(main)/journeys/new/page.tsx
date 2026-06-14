import { redirect } from 'next/navigation'
import { Sparkles, FileEdit } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { JOURNEY_TEMPLATES } from '@/lib/journeys/templates'
import { createJourneyFromTemplateAction } from '../create-actions'

// Journeys v2 — create a journey (ADR-252, J4). Start from a proven template (kills the
// blank-page problem — JOURNEYS.md §10) or a blank canvas. Server-rendered forms post the
// bound create action, which instantiates the structure and drops the author into the player.
export const dynamic = 'force-dynamic'

export default async function NewJourneyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-text">Create a journey</h1>
      <p className="mt-1 text-sm text-muted">
        Start from a proven structure or a blank canvas. You can change everything once it’s created.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {JOURNEY_TEMPLATES.map((t) => (
          <form key={t.id} action={createJourneyFromTemplateAction.bind(null, t.id)}>
            <button
              type="submit"
              className="group flex h-full w-full flex-col rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40 hover:bg-surface-elevated"
            >
              <span className="text-lg">{t.emoji}</span>
              <span className="mt-1 font-semibold text-text">{t.name}</span>
              <span className="mt-1 text-xs leading-relaxed text-muted">{t.description}</span>
              <span className="mt-3 inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-primary-strong">
                <Sparkles className="h-3.5 w-3.5" /> {t.phases.length} phases · use this
              </span>
            </button>
          </form>
        ))}

        <form action={createJourneyFromTemplateAction.bind(null, null)}>
          <button
            type="submit"
            className="flex h-full w-full flex-col items-start justify-center rounded-2xl border border-dashed border-border bg-surface p-4 text-left transition-colors hover:border-primary/40 hover:bg-surface-elevated"
          >
            <FileEdit className="h-5 w-5 text-subtle" />
            <span className="mt-1 font-semibold text-text">Blank journey</span>
            <span className="mt-1 text-xs leading-relaxed text-muted">Start from scratch and build it phase by phase.</span>
          </button>
        </form>
      </div>
    </div>
  )
}
