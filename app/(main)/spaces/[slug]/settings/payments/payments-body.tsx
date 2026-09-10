import { Suspense } from 'react'
import { Check, Minus } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { getConnectStatus, payoutsLive } from '@/lib/billing/connect'
import { resolvedNetworkRate } from '@/lib/billing/fees'
import { networkTakeRateBpsForPlan } from '@/lib/billing/pricing-keys'
import { isNetworkConnected } from '@/lib/pricing/network-world'
import { PAYOUT_CHANNEL_WORDS, type PayoutChannel } from '@/lib/billing/payout-prompt'
import { SpacePayoutSetupPrompt } from '@/components/billing/payout-setup-prompt'
import type { Space } from '@/lib/spaces/types'

// GET PAID (LIVE-294) — the chrome-free body, so the standalone page frames it and a `?panel=`
// workspace could mount the same thing later without a second copy.
//
// WHY THIS PAGE EXISTS. There was no per-space answer to "can I take money right now". Setup lived in
// a prompt that returns null once satisfied (LIVE-290 gave it a ready state, but a banner is still not
// a home), the take rate lived in lib/billing/fees.ts and surfaced nowhere an operator looks, and the
// five money paths reported their readiness only at the moment a buyer was already stuck.
//
// 🔴 IT DOES NOT HAND-WRITE A SIXTH PROMPT. Band 1 renders the SHARED card with whenReady="status".
// Four hand-written payout panels is what LIVE-233 consolidated away; adding a fifth here, on the page
// whose whole subject is payouts, would be the same mistake with better intentions.
//
// SELF-GATES server-side (canManage || staffViewing) so it is safe to mount anywhere; the page adds
// its own notFound() so a null here never renders a bare 200.

/** The five money paths, each with what has to be true for it to take money TODAY.
 *  🔴 There is no single "is this channel live" resolver in the tree: every path enforces its own
 *  conditions at its own seam (space-membership-checkout, booking, commerce/checkout, donation
 *  checkout, ticket-eligibility). Rather than become a sixth place that GUESSES at money rules, this
 *  reads the two facts every one of those seams re-derives — the platform switch and the owner's
 *  mirrored Stripe flags — plus the per-space feature gate, and says only what those three prove. */
const PATHS: { channel: PayoutChannel; fn: Parameters<typeof spaceFunctionAccess>[1] }[] = [
  { channel: 'memberships', fn: 'memberships' },
  { channel: 'bookings', fn: 'availability' },
  { channel: 'orders', fn: 'shop' },
  { channel: 'donations', fn: 'donations' },
  // `tickets` retired as a function key and resolves to `events` (LIVE-226), so the gate is events'.
  { channel: 'tickets', fn: 'events' },
]

export async function PaymentsBody({ slug }: { slug: string }) {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) return null

  const brandName = space.brandName ?? space.name

  return (
    <>
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      {/* BAND 1 — where the money lands. The shared card, opted into its ready state. */}
      <section className="mb-10">
        <Suspense fallback={<BandSkeleton />}>
          <SpacePayoutSetupPrompt
            space={space}
            viewerProfileId={viewerProfileId}
            channels={PATHS.map((p) => p.channel)}
            whenReady="status"
          />
        </Suspense>
      </section>

      {/* BAND 2 — which paths can take money today. */}
      <section className="mb-10">
        <SectionHeader title="Your money paths" />
        <p className="-mt-2 mb-4 text-body-sm text-muted">
          Five ways this space can take money. Each one needs its own setup, and all five need a payout account.
        </p>
        <Suspense fallback={<BandSkeleton />}>
          <PathsBand space={space} viewerProfileId={viewerProfileId} staffViewing={staffViewing} />
        </Suspense>
      </section>

      {/* BAND 3 — the rate actually in effect. */}
      <section className="mb-10">
        <SectionHeader title="Your rate" />
        <Suspense fallback={<BandSkeleton />}>
          <RateBand space={space} />
        </Suspense>
      </section>

      {/* BAND 4 — pure copy over facts already resolved, so no boundary of its own. */}
      <section>
        <SectionHeader title="What you receive, and what you pay" />
        <div className="rounded-card border border-border bg-surface p-5 text-body-sm leading-relaxed text-muted">
          <p className="mb-3">
            You <strong className="text-text">receive</strong> every sale, membership, booking deposit,
            donation and ticket, minus the rate above and Stripe&rsquo;s processing fee. Stripe sends it to
            your bank on its own schedule.
          </p>
          <p>
            You <strong className="text-text">pay</strong> Frequency for your plan. That is a separate
            charge and it is the only one.{' '}
            <a className="font-semibold text-primary-strong underline" href={`/spaces/${slug}/settings/billing`}>
              Your plan
            </a>
          </p>
        </div>
      </section>
    </>
  )
}

/** BAND 2. Reads the platform switch + the OWNER's Stripe flags once and threads them, rather than
 *  letting each row re-derive the same two facts (five redundant flag reads on one render). */
async function PathsBand({
  space,
  viewerProfileId,
  staffViewing,
}: {
  space: Space
  viewerProfileId: string | null
  staffViewing: boolean
}) {
  const ownerId = space.ownerProfileId ?? null
  const [live, owner, caps] = await Promise.all([
    payoutsLive(),
    ownerId ? getConnectStatus(ownerId) : Promise.resolve(null),
    getSpaceCapabilities(space, viewerProfileId),
  ])
  const payoutsReady = Boolean(owner?.ready)

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
      {PATHS.map(({ channel, fn }) => {
        const on = staffViewing || spaceFunctionAccess(space, fn, caps.role)
        // The three states this page can prove. Anything finer (is a paid tier defined, is the shop
        // published) belongs to that tool's own settings surface, which is one click away.
        const state = !live
          ? 'not_live'
          : !on
            ? 'turned_off'
            : payoutsReady
              ? 'live'
              : 'needs_payouts'
        const word = PAYOUT_CHANNEL_WORDS[channel].noun
        return (
          <li key={channel} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-body-sm font-semibold capitalize text-text">{word}</span>
            <span className="flex items-center gap-1.5 text-body-sm text-muted">
              {state === 'live' ? (
                <>
                  <Check className="h-4 w-4 text-primary-strong" aria-hidden />
                  Live
                </>
              ) : (
                <>
                  <Minus className="h-4 w-4 text-subtle" aria-hidden />
                  {state === 'needs_payouts'
                    ? 'Ready once payouts are on'
                    : state === 'turned_off'
                      ? 'Turned off in your settings'
                      : 'Waiting on payments going live'}
                </>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** BAND 3. 🔴 TWO NUMBERS, NEVER ONE. 0% on the space's own audience is a hard promise on every plan
 *  (lib/billing/fees.ts), and the network bps applies only when Frequency found the buyer. A space
 *  that is not network-connected takes no network sales at all, so its honest answer is 0% on
 *  everything — printing its plan's rung there would be wrong.
 *
 *  The beta price grant is deliberately absent: it moves which catalog PRICE a plan checkout resolves
 *  and touches no take rate (lib/billing/space-beta-grant.ts says so at length). */
async function RateBand({ space }: { space: Space }) {
  const rate = await resolvedNetworkRate()
  const bps = networkTakeRateBpsForPlan(space.plan, rate)
  const connected = isNetworkConnected(space.networkConnected)
  const pct = (bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <p className="text-body font-bold leading-tight text-text">
        {connected ? `0% on your own people. ${pct}% on a sale the network sends you.` : '0% on everything.'}
      </p>
      <p className="mt-2 text-body-sm leading-relaxed text-muted">
        {connected
          ? `Someone who already follows you, or who you brought here yourself, costs you nothing, on every plan, always. The ${pct}% applies only when Frequency found the buyer.`
          : 'This space takes no sales from the network, so the network takes no rate.'}
      </p>
    </div>
  )
}

function BandSkeleton() {
  return <div className="h-28 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
}
