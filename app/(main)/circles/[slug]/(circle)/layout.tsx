import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Users, MapPin, Settings, EyeOff, LayoutDashboard } from 'lucide-react'
import { ProgressTrack } from '@/components/ui/progress-track'
import { getCachedUser, getMyProfileId } from '@/lib/auth'
import { leaveCircle } from '../../actions'
import { JoinCircleButton } from '@/components/circles/join-circle-button'
import { CircleHandoffBanner } from '@/components/circles/circle-handoff-banner'
import { CrewGateButton } from '@/components/crew/upgrade-lightbox'
import { CircleHostMenu } from '@/components/circles/circle-host-menu'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { circleCapabilities } from '@/lib/circles/detail-access'
import { isPaidViewer } from '@/lib/core/viewer-hats'
import { DetailTemplate, PageHero, HERO_ACTION_CLASS } from '@/components/templates'
import { UnderlineTabs } from '@/components/ui/underline-tabs'
import { resolveHeaderElement } from '@/lib/elements/header'
import { readCircleCoverFocus, readCircleHeroHeight, hasCircleHeroHeight } from '@/lib/circles/hero'
import { loadCircleShell } from '@/lib/circles/store'
import { circleTabs } from '@/lib/circles/tabs'
import { ClaimCircle } from '@/components/circles/claim-circle'
import { listPublicPractices } from '@/lib/practices'

// ── THE CIRCLE DETAIL SHELL (PAGE-FRAMEWORK §3, "How templates map to Next.js") ──────────────────
//
// A Detail page IS a route-segment layout: the context header + tabs live here, the tab bodies slot
// in as `children`. §3 named this file by name and it was the one Detail route that never got it,
// so the Circle was a single arrangeable column with nowhere to put a roster, a chat, or a board.
// Navigating between tabs now preserves this header (partial rendering) instead of repainting it.
//
// WHY A ROUTE GROUP. `manage/`, `settings/`, `edit/` and `crm/` are SIBLINGS of `(circle)/`, outside
// the group, so they never inherit this chrome. That is the shape app/(main)/spaces/[slug]/(profile)
// /layout.tsx settled on, and for the reason recorded there: the alternative — one shared layout
// that branches on the request path — is invalid in the App Router, because a layout does not
// re-render across its child segments and its output is cached per instance. A prefetch of an owner
// sub-route would poison the header for the profile itself.
//
// WHY THE TAB STRIP IS A CLIENT LEAF. Same cause, different symptom: this layout renders ONCE for
// the whole tab group, so a server-computed `active` tab would freeze on whichever tab you landed
// on first. <UnderlineTabs> resolves it from usePathname, the only signal that stays true across
// soft navigation. It is the smallest client boundary on the page; everything else here is a Server
// Component.
//
// WHY THE RAIL IS UNTOUCHED. Nothing is registered in lib/layout/page-chrome.ts for this route and
// nothing should be: FOCUS_NONE_PREFIXES / SCOPED_PREFIXES / SCOPED_PATTERNS are empty on purpose
// (owner directive 2026-06-20, reaffirmed 2026-07-28 after the Channel 'scoped' experiment was
// reversed the same night), so /circles/<slug> and every tab under it keep the 'global' community
// rail. The circle ADMIN rail also needs no edit: adminScopeFor matches /^\/circles\/([^/]+)/ as a
// PREFIX, so a tab route resolves to the same circle scope its parent does (locked by
// lib/layout/page-chrome.test.ts).
//
// The hero + band below are lifted VERBATIM from the old circles/[slug]/page.tsx, down to the eight
// numbered header rules; only their home changed. The single page <h1> rides the PageHero inside
// this layout, so a tab page renders a BODY and never a second shell (a nested template would emit
// a second h1 and trip `check:headers`).

export default async function CircleDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // The circle + roster, request-memoized: the tab page under `children` calls the same loader and
  // gets a memo hit, so the shell costs no extra reads (lib/circles/store.ts).
  const shell = await loadCircleShell(slug)
  if (!shell) notFound()
  const { circle, theme, members } = shell

  // The saved header settings (circles.theme, the ADR-886 pattern applied to Circles). An untouched
  // circle resolves to the centered default and NO explicit height, which is exactly today's
  // render. savedHeroHeight is null-unless-chosen so the header ELEMENT config (resolveHeaderElement,
  // ADR-793) keeps deciding height for every circle no host has tuned; once a host picks one, theirs
  // wins.
  const circleCoverFocus = readCircleCoverFocus(theme)
  const savedHeroHeight = hasCircleHeroHeight(theme) ? readCircleHeroHeight(theme) : null

  // Four independent, request-cached reads in one batch. `user` gates the signed-in-only banners;
  // caps drives every inline-admin affordance; isPaidViewer feeds the Crew gate on Join.
  const [user, myProfileId, caps, header] = await Promise.all([
    getCachedUser(),
    getMyProfileId(),
    // Request-memoized, so the tab page under `children` asking the same question is a memo hit
    // rather than a second capability resolution (lib/circles/detail-access.ts).
    circleCapabilities(circle.id),
    // The operator-tunable header (the Journey/Profile/Space idiom): identity layout at the
    // standard height unless an /admin/elements master (or Space override) retunes it.
    resolveHeaderElement({ defaults: { layout: 'identity', height: 'standard' } }),
  ])

  const isMember = !!myProfileId && members.some((m) => m.profile?.id === myProfileId)
  const isHost = !!myProfileId && circle.host?.id === myProfileId
  const isCrew = myProfileId ? await isPaidViewer() : false

  const canManage = caps.has('circle.editSettings')
  // Draft circles are private to their managers (ADR starter-circles draft status): a draft is a
  // not-yet-published circle only its host/stewards (and staff) may see, so it can be built up
  // before it goes live. Anyone else gets a 404 by direct link, exactly as if it did not exist —
  // and it is already excluded from every discovery surface (index, /discover, sitemap RPC). The
  // gate lives HERE so it covers every tab beneath the shell, not just the Home one.
  const isDraft = circle.status === 'draft'
  if (isDraft && !canManage) notFound()

  // The demo-claim card needs the practice library for its picker; only a claimable demo circle
  // seen by a signed-in viewer ever pays for that read.
  const practiceLibrary = circle.is_demo && user ? await listPublicPractices() : []

  const pct = Math.min(100, Math.round((circle.member_count / circle.member_cap) * 100))
  const nearCap = circle.member_count >= circle.member_cap * 0.9
  const full = circle.member_count >= circle.member_cap

  // Header status pill: draft → muted, forming → green, active → blue, full/closed → red.
  const statusPill = isDraft
    ? { label: 'Draft', cls: 'bg-surface-elevated text-subtle' }
    : full
    ? { label: 'Full', cls: 'bg-danger-bg text-danger' }
    : circle.status === 'forming'
      ? { label: 'Forming', cls: 'bg-success-bg text-success' }
      : circle.status === 'active'
        ? { label: 'Active', cls: 'bg-info-bg text-info' }
        : { label: circle.status === 'archived' ? 'Closed' : 'Inactive', cls: 'bg-danger-bg text-danger' }

  const typeLabel = String(circle.type)
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  // ADR-089's empty-Circle guardrail, applied to the tab strip: a Circle's heavier surfaces wait
  // until it crosses a small size threshold. A one-member circle nobody has joined yet reads as ONE
  // page, exactly as it does today — splitting it into tabs would only make a thin room feel
  // emptier. Its host still gets the strip, because a host setting a circle up needs to see where
  // the roster lives. Pure + unit-tested in lib/circles/tabs.ts.
  const tabs = circleTabs({
    slug: circle.slug,
    memberCount: members.length,
    canManage,
  })

  return (
    <div>
      {/* Draft notice: only a manager ever reaches this page while the circle is a draft (everyone
          else 404s above), so this line reassures the owner it is private until they publish. */}
      {isDraft && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning-bg/50 px-4 py-3">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <div className="text-body-sm">
            <p className="font-semibold text-text">This circle is in draft</p>
            <p className="mt-0.5 text-muted">
              Only you can see it. It stays off the Circles directory, map, and search until you set the
              status to Active in the settings panel.
            </p>
          </div>
        </div>
      )}

      {/* A pending handoff, shown ONLY to the person it was offered to (ADR-845). Self-fetching,
          so it costs this page no read and renders nothing for everyone else. */}
      {user && <div className="mb-4"><CircleHandoffBanner circleId={circle.id} /></div>}

      {/* Demo circles invite a real member to claim + host them in place. */}
      {circle.is_demo && user && (
        <ClaimCircle
          circleId={circle.id}
          name={circle.name}
          about={circle.about}
          practices={practiceLibrary.map((p) => ({ id: p.id, title: p.title }))}
        />
      )}

      {/* ── UNIFIED ENTITY HEADER (the events/Spaces grammar, ADR-793) ─────────────────────────
          Extracted rules, mirrored from the Space profile ((profile)/layout.tsx), the Journey page,
          and the person profile — the ONE header system every destination page now opens on:
            1. COVER: one immersive PageHero band as DetailTemplate's `hero` slot (rounded-3xl,
               border, min-height off the header element's size ladder), never a standalone cover
               card with the title stranded below it. No cover = the neutral token gradient.
            2. TUNABLE: layout/height/overlay resolve through resolveHeaderElement (identity/
               standard defaults, the entity-page idiom), so /admin/elements retunes it, no deploy.
            3. TITLE: the single h1 rides the cover, bottom-left, over the ink scrim (on-ink copy),
               with the uppercase accent eyebrow above it — the Space-page lockup.
            4. SUBTITLE: one quiet on-ink line on the cover (the place line here).
            5. ACTIONS: bottom-right ON the cover. ONE filled primary CTA (Join, the Space pattern:
               accent fill + lift-1 so it lifts off the photo); secondaries use the glassy
               on-ink HERO_ACTION_CLASS.
            6. ADMIN: never on the cover — Edit/host tools read as a light row in the `band`
               below the hero (the Journey/Profile placement).
            7. BAND: badge chips (rounded-pill), then icon fact rows (key fact semibold, the
               events subtitle idiom), then the capacity bar.
            8. BACK: DetailTemplate's `back` slot, above the band. Tabs stay in `tabs`. */}
      <DetailTemplate
        back={{ href: '/circles', label: 'Circles' }}
        title={circle.name}
        hero={
          <PageHero
            variant={header.layout}
            size={savedHeroHeight ?? header.height}
            overlayStyle={header.overlayStyle}
            coverImage={circle.image_url}
            coverFocus={circleCoverFocus}
            eyebrow="Circle"
            title={circle.name}
            subtitle={
              [circle.neighborhood, circle.city].filter(Boolean).join(', ') || undefined
            }
            actions={
              <>
                {isMember && !isHost && (
                  <form action={leaveCircle.bind(null, circle.id)}>
                    <button type="submit" className={HERO_ACTION_CLASS}>
                      Leave
                    </button>
                  </form>
                )}

                {!isMember && myProfileId && !full && (
                  <CrewGateButton
                    isCrew={isCrew}
                    label="Join"
                    buttonClassName="shrink-0 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary lift-1 hover:bg-primary-hover transition-colors"
                  >
                    <JoinCircleButton
                      circleId={circle.id}
                      circleSlug={circle.slug}
                      className="shrink-0 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary lift-1 hover:bg-primary-hover transition-colors"
                    />
                  </CrewGateButton>
                )}

                {!isMember && myProfileId && full && (
                  <span className="shrink-0 inline-flex items-center justify-center rounded-lg border border-on-ink/40 bg-on-ink/10 px-3 py-1.5 text-body-sm font-semibold text-on-ink/70 backdrop-blur-sm cursor-not-allowed">
                    Full
                  </span>
                )}
              </>
            }
          />
        }
        band={
          <div className="min-w-0 space-y-2">
            {/* Host/admin tools read as a normal light row BELOW the header (never riding the
                cover) — the Journey/Profile placement for the standardized admin affordances. */}
            {canManage && (
              <div className="flex flex-wrap items-center gap-2 pb-1">
                <CircleHostMenu circleId={circle.id} />
                <OpenAdminBarButton
                  scope={{ kind: 'circle', id: circle.id }}
                  caps={Array.from(caps)}
                  label="Edit"
                  icon={<Settings className="h-4 w-4" />}
                />
                <Link
                  href={`/circles/${circle.slug}/manage`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-body-sm font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
                >
                  <LayoutDashboard className="h-4 w-4 text-subtle" />
                  Manage
                </Link>
              </div>
            )}

            {/* Status / mode chips — the rounded-pill chip grammar the event + Journey bands use. */}
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-meta font-semibold ${statusPill.cls}`}>
                {statusPill.label}
              </span>
              <span className="inline-flex items-center rounded-pill bg-signal-bg px-2 py-0.5 text-meta font-medium text-signal-strong">
                {typeLabel}
              </span>
              {nearCap && !full && (
                <span className="inline-flex items-center rounded-pill bg-warning-bg px-2 py-0.5 text-meta font-medium text-warning">
                  Almost full
                </span>
              )}
            </span>

            {/* Place-first context: the locale, then the Hub this circle belongs to.
                Hubs/Nexuses surface here as the emergent "where this sits", never as
                primary nav — a member reads it as place, not an org chart (IA §3a/§4). */}
            {circle.hub && (
              <div className="flex items-center gap-1.5 text-body-sm text-subtle">
                <MapPin className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  {circle.hub.nexus?.outpost?.name && <>{circle.hub.nexus.outpost.name} · </>}
                  <Link href={`/hubs/${circle.hub.slug}`} className="hover:text-primary-strong hover:underline">
                    {circle.hub.name}
                  </Link>
                </span>
              </div>
            )}

            {/* Fact row — the events-header idiom: icon rows, the key fact a step stronger. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-muted">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-primary-strong shrink-0" />
                <span className="font-semibold text-text">
                  {circle.member_count} of {circle.member_cap} members
                </span>
              </span>
              {circle.host && (
                <span>
                  Host{' '}
                  <Link
                    href={`/people/${circle.host.handle}`}
                    className="text-primary-strong hover:underline font-medium"
                  >
                    {circle.host.display_name}
                  </Link>
                </span>
              )}
            </div>
            <ProgressTrack
              value={pct}
              tone={full ? 'danger' : 'primary'}
              track="border"
              animate
              className="mt-2 max-w-xs"
              label={`${circle.member_count} of ${circle.member_cap} seats taken`}
            />
          </div>
        }
        tabs={tabs.length > 0 ? <UnderlineTabs tabs={tabs} label="Circle sections" /> : undefined}
      >
        {children}
      </DetailTemplate>
    </div>
  )
}
