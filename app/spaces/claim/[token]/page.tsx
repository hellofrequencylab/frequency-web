import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Building2, Zap } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { resolveSpaceClaimAny } from '@/lib/spaces/claim'
import { getSpaceById } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { toProfileContext } from '@/lib/spaces/profile-modules'
import { parseEntityLayout } from '@/lib/entity-blocks/layout'
import { resolveAccentVars } from '@/lib/spaces/accent'
import { defaultAccentForType } from '@/lib/spaces/profile-config'
import { parseSpaceTheme } from '@/lib/theme/space-themes'
import { AccentScope } from '@/components/spaces/accent-scope'
import { SpaceProfileModules } from '@/components/widgets/space-profile/space-profile-modules'
import { ClaimSpaceButton } from './claim-button'

export const dynamic = 'force-dynamic'

// The claim landing the real business owner reaches from an operator's outreach. PUBLIC (outside the
// (main) shell) so a signed-out owner can see what they are claiming. It now shows the REAL, FULL public
// page Frequency built for them (the same block body the live profile renders) so they see exactly what
// they are getting, with a big always-visible "Claim this business" bar. Resolves the seeded, UNCLAIMED
// Space by its one-time token; 404 when the token is unknown, already used, or the Space was removed, so
// a guessed token learns nothing. Signed-out -> a sign-in CTA that returns here; signed-in -> one-tap claim.

export default async function ClaimSpacePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const [claim, myProfileId] = await Promise.all([resolveSpaceClaimAny(token), getMyProfileId()])
  if (!claim) notFound()

  // Already claimed: send the real owner who re-opens their used link straight to their Space, and reveal
  // nothing to anyone else.
  if (claim.claimed) {
    if (myProfileId && claim.ownerProfileId === myProfileId) redirect(`/spaces/${claim.slug}`)
    notFound()
  }

  // Resolve the FULL Space by id (admin read — bypasses the active-only RLS AND the visibility gate, so an
  // unlisted seeded Space still renders here, unlike getVisibleSpaceBySlug). Stamp it active so the
  // self-fetching dynamic profile blocks read THIS tenant's rows.
  const space = await getSpaceById(claim.spaceId)
  if (!space) notFound()
  setActiveSpace(space)

  const name = space.brandName || space.name || claim.name || 'Your business'
  const cover = space.coverImageUrl ?? null
  const logo = space.brandLogoUrl ?? null
  const tagline = space.tagline ?? null

  // The public grid: read the operator's saved arrangement (preferences.profileLayout) and resolve it the
  // SAME way the live visitor page does (parseEntityLayout -> resolveRows), fail-safe to the kind starter.
  const prefs = space.preferences
  const rawLayout =
    prefs && typeof prefs === 'object' && !Array.isArray(prefs)
      ? (prefs as Record<string, unknown>).profileLayout
      : null
  const grid = parseEntityLayout(rawLayout) ?? {}

  // Match the real profile's accent + typography so the preview reads as the actual page, not a generic one.
  const accentVars = resolveAccentVars(space.brandAccent, defaultAccentForType(space.type))
  const spaceTheme = parseSpaceTheme(space.preferences)

  return (
    <AccentScope vars={accentVars} theme={spaceTheme}>
      {/* Generous bottom padding so the fixed claim bar never overlaps the last block. The bar is a
          single row at sm+ but stacks (message + big button + helper line) on mobile, so it needs more. */}
      <div className="min-h-screen bg-canvas pb-48 sm:pb-28">
        {/* Claim ribbon — sets the context above the page it introduces. Its inner content aligns to the
            same column as the page below it. */}
        <div className="border-b border-primary/20 bg-primary-bg/40">
          <div className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-2.5 text-sm text-primary-strong sm:px-6 lg:px-8">
            <Zap className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Frequency built this page so people nearby could find you. If it is yours, claim it to make it your own.
            </span>
          </div>
        </div>

        {/* ONE content column, matching the business space page's boundaries: the cover, hero, and body all
            sit inside the same max-width + shell padding, and the cover uses the SAME contained, rounded
            16:6 treatment as DetailTemplate (not a full-bleed banner). */}
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <header>
            {cover ? (
              <div className="relative aspect-[16/6] w-full overflow-hidden rounded-2xl bg-surface-elevated">
                {/* eslint-disable-next-line @next/next/no-img-element -- operator asset URL, not a build asset */}
                <img src={cover} alt="" className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="flex aspect-[16/6] w-full items-center justify-center rounded-2xl bg-gradient-to-br from-primary-bg via-surface-elevated to-signal-bg text-primary-strong">
                <Building2 className="h-8 w-8 opacity-60" aria-hidden />
              </div>
            )}
            <div className="-mt-10 flex items-end gap-4 px-1">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- operator asset URL
                <img
                  src={logo}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-2xl border-4 border-canvas bg-surface object-cover shadow-sm"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-4 border-canvas bg-primary-bg text-primary-strong shadow-sm">
                  <Building2 className="h-8 w-8" aria-hidden />
                </div>
              )}
              <div className="min-w-0 pb-1">
                <h1 className="truncate text-2xl font-bold text-text sm:text-3xl">{name}</h1>
                {tagline && <p className="truncate text-sm text-muted">{tagline}</p>}
              </div>
            </div>
          </header>

          {/* The REAL public profile body — byte-for-byte the visitor render, minus the shell chrome. */}
          <main className="py-8">
            <SpaceProfileModules space={toProfileContext(space)} grid={grid} />
          </main>
        </div>
      </div>

      {/* The always-visible claim bar — the big button rides along the whole page. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-pop backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="text-sm text-text">
            <span className="font-semibold">Is this your business?</span> Claim it to edit the page, post
            updates, take bookings, and run it from your own account. It takes one tap.
          </p>
          <div className="shrink-0 sm:w-64">
            {myProfileId ? (
              <ClaimSpaceButton token={token} size="lg" />
            ) : (
              <div className="space-y-1.5">
                <Link
                  href={`/sign-in?next=/spaces/claim/${token}`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-base font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
                >
                  <Zap className="h-5 w-5" aria-hidden /> Claim this business
                </Link>
                <p className="text-center text-xs text-subtle">Signing in creates your account in a minute.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AccentScope>
  )
}
