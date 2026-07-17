import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Sparkles, ArrowRight } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { listModeChoices } from '@/lib/spaces/modes'
import { CreateSpaceForm } from './create-space-form'

// CREATE A SPACE — the Focus compose surface (ENTITY-SPACES-BUILD Wave B, Epic 1.6; Space Modes M3,
// ADR-461/464). A centered, no-rail form. An authenticated member answers "what do you run?" (which maps
// to a Mode + Focus), then fills name / handle / brand name / visibility; the createSpace action stands
// up the Space, seeds the Mode preset (the starter pipeline), and redirects to the owner settings surface.
//
// The "what do you run?" CHOICES come straight from the Mode registry (listModeChoices, plan §3a), so the
// wizard auto-includes every operating model the registry offers (no hardcoded list here) and each choice
// resolves to a (type, variant) the profile shell + the console both render.

export const metadata = {
  title: 'Create a space',
  description: 'Stand up a space for your practice, business, or organization on Frequency.',
  // An authenticated compose surface, not a content page: keep it out of the index and answer
  // engines (it only redirects a signed-out crawler to /sign-in).
  robots: { index: false, follow: false },
}

export default async function NewSpacePage() {
  // Gate: only an authenticated member may create a space (the action re-checks server-side).
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const choices = listModeChoices()

  return (
    <FocusTemplate
      eyebrow="Spaces"
      title="Create a space"
      description="Set up a home for your practice, business, or organization. You can change everything later."
      back={{ href: '/spaces/directory', label: 'Spaces' }}
    >
      {/* Business quick-start front door: the simplest path (name + links + one line), lands you on a
          seeded page in under a minute. Kept above the full form so a business owner takes the fast lane. */}
      <Link
        href="/spaces/new/business"
        className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-primary-strong/40 bg-primary-bg/40 px-4 py-3 transition-colors hover:bg-primary-bg motion-reduce:transition-none"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-text">Running a business? Start here</span>
            <span className="block text-xs text-muted">Drop your name and links, get a ready-to-fill page in under a minute.</span>
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
      </Link>

      <CreateSpaceForm choices={choices} />
    </FocusTemplate>
  )
}
