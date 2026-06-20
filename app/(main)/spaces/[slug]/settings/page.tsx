import { notFound } from 'next/navigation'
import Link from 'next/link'
import { BadgeCheck, Briefcase, CalendarClock, ChevronRight, DoorOpen, GraduationCap, HeartHandshake, Mail, QrCode, Ticket, Users } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { SpaceSettingsForm, type SpaceSettingsValues } from './settings-form'

// MANAGE <Space> — the owner back-end HUB (ENTITY-SPACES-BUILD Wave B, Epic 1.7). A centered,
// no-rail Focus surface (the rail is registered 'none' for /spaces/<slug>/settings in
// page-chrome.ts). It resolves the Space, gates RENDER on resolveSpaceManageAccess (canManage ||
// staffViewing), and 404s for everyone else so a non-editor / non-staff viewer can't tell the
// settings surface exists. It seats the profile-settings FORM plus a card-linked set of every
// management surface this Space's type offers (Availability for a practitioner, Memberships for a
// business, Members for all).
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

type ExtraRow = { about?: string | null; tagline?: string | null; visibility?: string | null }

/** Read the not-yet-typed profile columns (about / tagline / visibility) for a Space id. */
async function readProfileExtras(spaceId: string): Promise<ExtraRow> {
  try {
    const { data } = (await createAdminClient()
      .from('spaces')
      .select('about, tagline, visibility')
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
        readOnly={staffViewing}
      />

      <div className="mt-4 space-y-3">
        {space.type === 'practitioner' && (
          // The Practitioner's 1:1 booking lives on its own Focus surface (weekly availability + the
          // owner's upcoming bookings). Link to it from the hub rather than nesting another editor.
          <HubCard
            href={`/spaces/${space.slug}/settings/availability`}
            icon={CalendarClock}
            title="Availability and bookings"
            description="Set the weekly times members can book, and see who is on your calendar."
          />
        )}

        {space.type === 'business' && (
          // The Business's memberships live on their own Focus surface (the tier editor + the member
          // list). Link to it from the hub rather than nesting another editor.
          <HubCard
            href={`/spaces/${space.slug}/settings/memberships`}
            icon={BadgeCheck}
            title="Memberships"
            description="Define the tiers members can join, and see who has joined."
          />
        )}

        {space.type === 'organization' && (
          // An Organization configures its hosted donation asks (a fund label, a short description, and
          // suggested amounts). No money in v1 (ADMIN-01); the member Donate CTA reads this config.
          <HubCard
            href={`/spaces/${space.slug}/settings/donations`}
            icon={HeartHandshake}
            title="Donations"
            description="Set up your fund, a short description, and the amounts members can pick."
          />
        )}

        {space.type === 'coaching' && (
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
        {space.type === 'event_space' && (
          // An Event Space runs door check-in: a reusable QR by the door, and the live roster of who
          // scanned in. Reuses the existing scan path; this card links to the owner roster surface.
          <HubCard
            href={`/spaces/${space.slug}/settings/checkin`}
            icon={DoorOpen}
            title="Check in"
            description="Show your door code and see who checked in."
          />
        )}

        {space.type === 'event_space' && (
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
        <HubCard
          href={`/spaces/${space.slug}/settings/members`}
          icon={Users}
          title="Members"
          description="See who is on your team and the role each one holds."
        />

        {/* QR codes + CRM are owner tools every Space type can use. */}
        <HubCard
          href={`/spaces/${space.slug}/settings/qr`}
          icon={QrCode}
          title="QR codes"
          description="Create codes for your space and the landing page they open to."
        />
        <HubCard
          href={`/spaces/${space.slug}/settings/crm`}
          icon={Briefcase}
          title="CRM"
          description="Track your pipeline and contacts, and keep private notes on the people you work with."
        />
        <HubCard
          href={`/spaces/${space.slug}/settings/email`}
          icon={Mail}
          title="Email"
          description="Write a campaign, pick who gets it, and send or schedule it."
        />
      </div>
    </FocusTemplate>
  )
}
