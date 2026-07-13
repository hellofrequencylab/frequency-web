import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Building2, Zap } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { resolveSpaceClaimAny } from '@/lib/spaces/claim'
import { getSpaceById } from '@/lib/spaces/store'
import { ClaimSpaceButton } from './claim-button'

export const dynamic = 'force-dynamic'

// The claim landing the real business owner reaches from an operator's outreach. PUBLIC (outside the
// (main) shell, like /listings/claim/[token]) so a signed-out owner can see what they are claiming.
// Resolves the seeded, UNCLAIMED Space by its one-time token; 404 when the token is unknown, already
// used, or the Space was removed, so a guessed token learns nothing. Signed-out → a sign-in CTA that
// returns here; signed-in → one-tap claim (claimSpace transfers ownership + seats them as admin).

export default async function ClaimSpacePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const [claim, myProfileId] = await Promise.all([resolveSpaceClaimAny(token), getMyProfileId()])
  if (!claim) notFound()

  // Already claimed: send the real owner who re-opens their used link straight to their Space (they
  // asked why a second click 404s), and reveal nothing to anyone else.
  if (claim.claimed) {
    if (myProfileId && claim.ownerProfileId === myProfileId) redirect(`/spaces/${claim.slug}`)
    notFound()
  }

  const space = await getSpaceById(claim.spaceId)
  const cover = space?.coverImageUrl ?? null
  const logo = space?.brandLogoUrl ?? null
  const tagline = space?.tagline ?? null

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-16">
      <FocusTemplate
        width="narrow"
        divider={false}
        title="Claim your business"
        description="Frequency built this page for your business so people nearby could find you. If it's yours, claim it to make it your own."
      >
        <div className="w-full space-y-4">
          {/* The Space preview. */}
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" className="max-h-40 w-full object-cover" />
            )}
            <div className="flex items-center gap-3 p-4">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="h-12 w-12 shrink-0 rounded-xl border border-border object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                  <Building2 className="h-6 w-6" aria-hidden />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-text">{claim.name || 'Your business'}</p>
                {tagline && <p className="truncate text-sm text-muted">{tagline}</p>}
              </div>
            </div>
          </div>

          {/* What claiming does. */}
          <p className="flex items-start gap-2 text-sm text-muted">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            Claiming makes it yours: you can edit the page, post updates, take bookings, and run it from
            your own account. It takes one tap.
          </p>

          {myProfileId ? (
            <ClaimSpaceButton token={token} />
          ) : (
            <div className="space-y-2">
              <Link
                href={`/sign-in?next=/spaces/claim/${token}`}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                Sign in to claim it
              </Link>
              <p className="text-center text-xs text-subtle">New here? Signing in creates your account in a minute.</p>
            </div>
          )}
        </div>
      </FocusTemplate>
    </div>
  )
}
