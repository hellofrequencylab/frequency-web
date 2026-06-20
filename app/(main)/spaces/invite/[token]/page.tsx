import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Mail, AlertCircle } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { getCachedUser } from '@/lib/auth'
import { acceptInvite } from '@/lib/spaces/invites'
import { isError } from '@/lib/action-result'

// ACCEPT A SPACE INVITE — the tokened landing the invitee opens (/spaces/invite/<token>). A centered,
// no-rail Focus surface (registered 'none' for /spaces/invite in page-chrome.ts). It accepts the
// invite for the SIGNED-IN user and redirects into the Space; a signed-out visitor gets a sign-in
// prompt that returns here, and an invalid / expired / used token shows an honest message.
//
// FLOW:
//   not signed in -> a sign-in prompt linking to /sign-in?next=/spaces/invite/<token> (returns here)
//   signed in     -> acceptInvite seats them and redirect()s to /spaces/<slug>
//   bad token     -> a plain "this link is not valid / expired" card
//
// acceptInvite is the authority (token + not-expired + pending; seats via addSpaceMember). This page
// is the thin shell around it. COPY passes CONTENT-VOICE: plain, no narrated feelings, no em/en dashes.

export const metadata = {
  title: 'Join a space',
}

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // A signed-out visitor cannot be seated. Send them to sign in and return to this exact link.
  const user = await getCachedUser()
  if (!user) {
    const next = `/spaces/invite/${encodeURIComponent(token)}`
    return (
      <FocusTemplate
        title="You have an invite"
        description="Sign in to join the team. We will bring you right back to this invite."
        width="narrow"
      >
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className={buttonClasses()}>
          <Mail className="h-4 w-4" aria-hidden /> Sign in to join
        </Link>
      </FocusTemplate>
    )
  }

  // Signed in: accept (seat) then redirect into the Space. NOTE: redirect() throws to unwind, so it
  // must run OUTSIDE the try/catch acceptInvite already wraps — here it is a plain call after the
  // result check, so no catch swallows the redirect.
  const result = await acceptInvite(token)
  if (!isError(result)) {
    redirect(`/spaces/${result.data.spaceSlug}`)
  }

  // A bad / expired / already-used token: an honest message, no existence leak about the Space.
  return (
    <FocusTemplate
      title="This invite is not available"
      description={result.error}
      width="narrow"
    >
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-subtle" aria-hidden />
        <p>
          Ask whoever invited you to send a fresh invite link. Each link can be used once and expires
          after fourteen days.
        </p>
      </div>
      <div className="mt-5">
        <Link href="/spaces" className={buttonClasses('secondary')}>
          Browse spaces
        </Link>
      </div>
    </FocusTemplate>
  )
}
