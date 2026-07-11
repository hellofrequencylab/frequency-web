import Link from 'next/link'
import { CalendarPlus } from 'lucide-react'
import { resolveHostPrompt } from '@/lib/growth/host-prompts'
import { canCreate } from '@/lib/core/load-capabilities'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { HostPromptCardShell } from '@/components/feed/host-prompt-card-shell'

// The Lone-Wolf -> Local-Host host prompt on the feed (Beta P2 "Wolf-to-host prompts").
// A Server Component the feed streams behind <Suspense> so it never blocks the stream.
// It asks lib/growth/host-prompts which prompt (if any) this member has earned, then
// renders the calm dismissible card with the two 2-tap create CTAs:
//   • Start a Circle -> the /circles/new builder (NewCircleCompose, Crew-gated).
//   • Host an Event  -> the /events surface where the New Event composer lives.
// Renders NOTHING when the flag is off, the member has not earned a prompt, or the
// prompt has been dismissed / capped — so it is fully inert until turned on.
export async function HostPromptCard({ viewerProfileId }: { viewerProfileId: string }) {
  const prompt = await resolveHostPrompt(viewerProfileId)
  if (!prompt) return null

  // Same gate the founder-bootstrap card uses: real Crew (or a steward) may start a
  // Circle; everyone else gets the upgrade popup instead of the builder link.
  const canStartCircle = await canCreate('circle.create')

  return (
    <HostPromptCardShell kind={prompt.kind} title={prompt.title} body={prompt.body}>
      <NewCircleCompose
        buttonLabel="Start a Circle"
        canCreate={canStartCircle}
        buttonClass="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
      />
      <Link
        href="/events"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
      >
        <CalendarPlus className="h-4 w-4 text-subtle" /> Host an Event
      </Link>
    </HostPromptCardShell>
  )
}
