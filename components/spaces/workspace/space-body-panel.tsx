import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { SURFACE_PANELS } from './surface-panels'
import { ProfileBodySkeleton } from '@/components/spaces/profile-body-skeleton'
import { MembersBody } from '@/app/(main)/spaces/[slug]/settings/members/members-body'
import { OfferingsBody } from '@/app/(main)/spaces/[slug]/settings/offerings/offerings-body'
import { ServicesBody } from '@/app/(main)/spaces/[slug]/settings/services/services-body'
import { QrBody } from '@/app/(main)/spaces/[slug]/settings/qr/qr-body'
import { EmailBody } from '@/app/(main)/spaces/[slug]/settings/email/email-body'
import { BillingBody } from '@/app/(main)/spaces/[slug]/settings/billing/billing-body'
import { CrmBody } from '@/app/(main)/spaces/[slug]/crm/crm-body'

// INLINE WORKSPACE — the panel BODY (Stage D1). The Space profile's persistent hero + tab menu live in
// the (profile) route-group layout, so a `?panel=<id>` soft-navigation swaps ONLY this body (the layout
// does not re-render on a query change). This component REPLACES the normal profile body with the chosen
// surface, rendered inline: a light header (the surface label + a "Back to page" link that clears the
// panel + an "Open full page" link out to the standalone route) above the surface body itself.
//
// The page already gated: it renders this ONLY for a viewer who can manage the Space AND a known panel id
// (isPanelId). We still look the panel up defensively and return null on a miss, so the page falls back to
// its normal body. DAWN semantic tokens only; voice-canon copy (no em dashes).

// BODY DISPATCH — the D1 seam rendered ONE hardcoded body (Members); D2 generalizes it to a panel-id → body
// map. Each body is the chrome-free, self-gating Server Component lifted from its settings route (mirrors
// members-body.tsx). This map lives here (a Server Component) rather than in the PURE surface-panels
// registry so the server-only body imports never reach the client bundle that imports PANEL_SURFACE_TO_ID.
// A panel with no body entry falls through to null (defensive; the page already gated on isPanelId).
type PanelBody = (props: { slug: string }) => ReactNode | Promise<ReactNode>
const PANEL_BODIES: Record<string, PanelBody> = {
  members: MembersBody,
  offerings: OfferingsBody,
  services: ServicesBody,
  qr: QrBody,
  email: EmailBody,
  billing: BillingBody,
  crm: CrmBody,
}

export function SpaceBodyPanel({ slug, panel }: { slug: string; panel: string }) {
  const entry = SURFACE_PANELS[panel]
  const Body = PANEL_BODIES[panel]
  if (!entry || !Body) return null

  return (
    <div className="space-y-6">
      {/* STICKY panel header (Stage D4): the surface label + the "Back to page" exit + "Open full page"
          pin under the site chrome AND the profile menu, so the operator keeps the exit in reach while
          scrolling a long manager. The offset stacks the header directly beneath the sticky profile menu
          (site header 3.5rem + the menu bar's own height); the bg spans the content column (no negative
          margins), matching how the profile menu bar paints its backdrop. z BELOW the menu (its z-20) so
          the header tucks under it, never over it. DAWN tokens only. */}
      <header className="sticky top-[calc(3.5rem+3rem+env(safe-area-inset-top))] z-10 flex flex-wrap items-center justify-between gap-4 border-b border-border bg-canvas/95 py-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/spaces/${slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to page
          </Link>
          <span className="text-border" aria-hidden>
            /
          </span>
          <h1 className="text-xl font-bold text-text">{entry.label}</h1>
        </div>
        <Link
          href={entry.fullHref(slug)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong transition-colors hover:text-primary"
        >
          Open full page
          <ExternalLink className="h-4 w-4" aria-hidden />
        </Link>
      </header>

      {/* The matched panel body (D2: Members, Offerings, Services, QR, Email, Plan and usage; D5: CRM). The
          registry keeps the label + full-route mapping in one place; PANEL_BODIES maps the id to its body.
          The body is wrapped in its OWN Suspense (Stage D4) so switching panels paints the header + skeleton
          INSTANTLY while the new body streams, instead of a blank/janky swap. Reuses the shared profile-body
          skeleton. A BOUNDED panel (Stage D5: the wide CRM board) is wrapped in an `overflow-x-auto` box so
          it horizontal-scrolls WITHIN the panel column instead of breaking the page layout out full-width. */}
      <Suspense fallback={<ProfileBodySkeleton />}>
        {entry.bounded ? (
          <div className="overflow-x-auto">
            <Body slug={slug} />
          </div>
        ) : (
          <Body slug={slug} />
        )}
      </Suspense>
    </div>
  )
}
