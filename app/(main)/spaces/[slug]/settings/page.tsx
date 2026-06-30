import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { BadgeCheck, Briefcase, ChevronRight, CreditCard, DoorOpen, GraduationCap, Mail, QrCode, SlidersHorizontal, Ticket, Users } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess, type SpaceFunctionKey } from '@/lib/spaces/functions'
import { isStaff } from '@/lib/core/roles'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { DangerDelete } from '@/components/admin/danger-delete'
import { deleteSpace } from '@/lib/spaces/provision'
import { SPACE_PLAN_LABEL, asSpacePlan } from '@/lib/pricing/plans'
import { SpaceSettingsForm, type SpaceSettingsValues } from './settings-form'

// MANAGE <Space> — the owner back-end HUB (ENTITY-SPACES-BUILD Wave B, Epic 1.7). A centered,
// no-rail Focus surface (the rail is registered 'none' for /spaces/<slug>/settings in
// page-chrome.ts). It resolves the Space, gates RENDER on resolveSpaceManageAccess (canManage ||
// staffViewing), and 404s for everyone else so a non-editor / non-staff viewer can't tell the
// settings surface exists. It seats the profile-settings FORM plus a card-linked set of every
// management surface this Space's type offers (Memberships for a business, Check in / Tickets for an
// event space, Members for all).
//
// HARMONIZED (ADR-441 EM1-3, the Spaces harmonization finish): the unified
// `/spaces/<slug>/manage` console now serves the `practitioner` and `organization` Space types, so
// this legacy 7-card hub REDIRECTS those two types to it (after the SAME access gate, so a
// non-manager still 404s and the route never leaks). Every settings SUB-page (availability, members,
// donations, qr, email, billing, features, crm, …) stays in place: the console links to them as its
// section targets. The OTHER types (business / event_space / lab / partner) have no console yet
// (manage notFound()s for them), so they keep this hub unchanged.
//
// TWO VIEWERS:
//   • canManage (owner / admin / editor) — the form is live and saves through updateSpaceProfile.
//   • staffViewing (a janitor previewing a Space they don't manage) — a Staff preview banner shows
//     and the form is rendered READ-ONLY (a fieldset-disabled, submit off). The write action stays
//     gated on canEditProfile server-side, so staff viewing never confers a write (read-only is both
//     a UI state and the unchanged server gate).
//
// `about` / `tagline` / `visibility` aren't on the mapped Space object (they aren't in the generated
// DB types yet, ADR-246), so they're read here through the untyped admin client alongside the
// resolved Space, the same pattern lib/spaces/store.ts uses for `visibility`.

type ExtraRow = { about?: string | null; tagline?: string | null; visibility?: string | null; plan?: string | null }

/** Read the not-yet-typed profile columns (about / tagline / visibility / plan) for a Space id. */
async function readProfileExtras(spaceId: string): Promise<ExtraRow> {
  try {
    const { data } = (await createAdminClient()
      .from('spaces')
      .select('about, tagline, visibility, plan')
      .eq('id', spaceId)
      .maybeSingle()) as { data: ExtraRow | null }
    return data ?? {}
  } catch {
    return {}
  }
}

export const metadata = {
  title: 'Manage space',
}

/** One management surface, rendered as a tappable hub card (icon tile + title + one-line context). */
function HubCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string
  icon: typeof Users
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong hover:bg-surface-elevated"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text">{title}</span>
        <span className="block text-xs text-muted">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
    </Link>
  )
}

export default async function SpaceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // Gate RENDER on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). 404
  // (not 403) for everyone else so the surface never confirms it exists. The WRITE action
  // (updateSpaceProfile) stays gated on canEditProfile, so staff viewing is read-only end to end.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  // HARMONIZATION (ADR-441 EM1-3, decided in ADR-452): the unified /spaces/<slug>/manage console serves the
  // `practitioner` and `organization` types. Send a manager / staff previewer of those types there so
  // there is one console, not two. The gate above already ran, so a non-manager 404s before this and
  // the redirect never reveals the route. All OTHER types fall through to the legacy hub below
  // (manage notFound()s for them, so there is nothing to redirect to yet). redirect() throws to
  // unwind rendering, so nothing past this line runs for the redirected types.
  if (space.type === 'practitioner' || space.type === 'organization') {
    redirect(`/spaces/${space.slug}/manage`)
  }

  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2). The hub stays the navigation entry point, so it
  // renders for any manager / staff previewer. What it GATES is the cards: a tool the viewer's role
  // cannot use (or that is turned off / not on the plan) does not render a dead card. The profile FORM
  // is the `profile` function, so it renders read-only when the viewer cannot use it (default editor =
  // the old canEditProfile threshold, so behavior is unchanged unless tuned). A staff janitor keeps the
  // full read-only preview (every card visible, every write gated server-side), exactly as today.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const canUse = (fn: SpaceFunctionKey): boolean =>
    staffViewing || spaceFunctionAccess(space, fn, caps.role)

  // Deleting a Space is OWNER-grade (or platform staff) and permanent — it cascades the space's
  // events, members, circles, and CRM. Never offered for the root space (the platform partition).
  const canDelete = space.type !== 'root' && (caps.isOwner || isStaff(caller?.webRole))

  const extras = await readProfileExtras(space.id)
  const initial: SpaceSettingsValues = {
    brandName: space.brandName ?? '',
    // brand_accent is stored as a DAWN token name; an old hex value (pre-Wave-B) simply won't match
    // a picker option and reads as "None" until re-picked.
    brandAccent: space.brandAccent ?? '',
    brandLogoUrl: space.brandLogoUrl ?? '',
    about: extras.about ?? '',
    tagline: extras.tagline ?? '',
    visibility: extras.visibility === 'private' ? 'private' : 'network',
  }

  const brandName = space.brandName ?? space.name

  return (
    <FocusTemplate
      eyebrow={brandName}
      title={`Manage ${brandName}`}
      description="Your hub for everything you run here. Edit your profile and brand, then jump to the surfaces your space offers."
      back={{ href: `/spaces/${space.slug}`, label: brandName }}
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <SpaceSettingsForm
        spaceId={space.id}
        slug={space.slug}
        initial={initial}
        readOnly={staffViewing || !canUse('profile')}
      />

      <div className="mt-4 space-y-3">
        {/* Features and access — the cross-cutting control: turn the tools this space uses on or off, and
            set who on the team can use each one. It is the gate's own editor, so it is always shown to a
            manager (it is owner/admin-editable, editor read-only); it is not itself a gateable function. */}
        <HubCard
          href={`/spaces/${space.slug}/settings/features`}
          icon={SlidersHorizontal}
          title="Features and access"
          description="Turn the tools this space uses on or off, and set who can use each one."
        />

        {/* Every card below is GATED on the per-Space function resolver: a tool the viewer's role cannot
            use (or that is off / not on the plan) does not render a dead card. A staff previewer sees
            them all (canUse short-circuits true). */}

        {/* Plan and billing — the space's plan ladder. Defaults to admin. */}
        {canUse('billing') && (
          <HubCard
            href={`/spaces/${space.slug}/settings/billing`}
            icon={CreditCard}
            title="Plan and billing"
            description={`Your current plan: ${SPACE_PLAN_LABEL[asSpacePlan(extras.plan)]}. See what each plan unlocks.`}
          />
        )}

        {/* practitioner (availability) and organization (donations) are CONSOLE types now: this hub
            redirects them to /spaces/<slug>/manage above, so their branches were unreachable here and
            were removed (ADR-441 EM1-3). Their settings sub-pages are intact — the console links to
            them. The branches below are the types that still use this legacy hub. */}

        {space.type === 'business' && canUse('memberships') && (
          // The Business's memberships live on their own Focus surface (the tier editor + the member
          // list). Link to it from the hub rather than nesting another editor.
          <HubCard
            href={`/spaces/${space.slug}/settings/memberships`}
            icon={BadgeCheck}
            title="Memberships"
            description="Define the tiers members can join, and see who has joined."
          />
        )}

        {space.type === 'coaching' && canUse('enroll') && (
          // The Coaching academy's enrollment lives on its own Focus surface (the program editor + the
          // enrollee list). No money in v1 (ADMIN-02).
          <HubCard
            href={`/spaces/${space.slug}/settings/enroll`}
            icon={GraduationCap}
            title="Enrollment"
            description="Define your program and see who has enrolled."
          />
        )}

        {/* `event_space` is a first-class member of `SpaceType` (HARD-01 / ADR-339), so this branch is a
            plain, exhaustively-checked comparison: no `as string` cast. */}
        {space.type === 'event_space' && canUse('checkin') && (
          // An Event Space runs door check-in: a reusable QR by the door, and the live roster of who
          // scanned in. Reuses the existing scan path; this card links to the owner roster surface.
          <HubCard
            href={`/spaces/${space.slug}/settings/checkin`}
            icon={DoorOpen}
            title="Check in"
            description="Show your door code and see who checked in."
          />
        )}

        {space.type === 'event_space' && canUse('tickets') && (
          // An Event Space runs free / RSVP ticketing (no money in v1; real paid ticketing is Phase 4):
          // the owner tier editor + the RSVP roster (ADMIN-03).
          <HubCard
            href={`/spaces/${space.slug}/settings/tickets`}
            icon={Ticket}
            title="Tickets"
            description="Set up free or RSVP ticket tiers, and see who has reserved a spot."
          />
        )}

        {/* Members is available for every Space type: who is on the team, and their roles. */}
        {canUse('members') && (
          <HubCard
            href={`/spaces/${space.slug}/settings/members`}
            icon={Users}
            title="Members"
            description="See who is on your team and the role each one holds."
          />
        )}

        {/* QR codes + CRM + Email are owner tools (CRM + Email are plan-gated; QR is universal). */}
        {canUse('qr') && (
          <HubCard
            href={`/spaces/${space.slug}/settings/qr`}
            icon={QrCode}
            title="QR codes"
            description="Create codes for your space and the landing page they open to."
          />
        )}
        {canUse('crm') && (
          <HubCard
            href={`/spaces/${space.slug}/crm`}
            icon={Briefcase}
            title="CRM"
            description="Your pipeline and contacts. Bring people over from My Contacts, and keep private notes on the people you work with."
          />
        )}
        {canUse('email') && (
          <HubCard
            href={`/spaces/${space.slug}/settings/email`}
            icon={Mail}
            title="Email"
            description="Write a campaign, pick who gets it, and send or schedule it."
          />
        )}
      </div>

      {/* Danger zone — owner-grade, permanent, and last on the page. Deleting the space removes it
          and everything it owns (its events and their RSVPs, its members, circles, pages, and CRM).
          Typing DELETE is required; the server re-checks owner/staff. */}
      {canDelete && (
        <div className="mt-8">
          <DangerDelete
            entity="space"
            warning="Permanently deletes this space and everything it owns: all its events (with their RSVPs and check-ins), members, circles, pages, and CRM. This cannot be undone."
            onDelete={deleteSpace.bind(null, space.id)}
            redirectTo="/spaces"
            confirmText="DELETE"
          />
        </div>
      )}
    </FocusTemplate>
  )
}
