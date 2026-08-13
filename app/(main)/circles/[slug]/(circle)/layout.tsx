import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { EyeOff, LayoutDashboard, MapPin, PenLine, Settings, Users } from 'lucide-react'
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
import { loadCircleShell } from '@/lib/circles/store'
import { circleTabs } from '@/lib/circles/tabs'
import {
  circleHeroOverlayStyle,
  hasCircleHeroHeight,
  readCircleCoverFocus,
  readCircleHeroHeight,
} from '@/lib/circles/hero'
import { ClaimCircle } from '@/components/circles/claim-circle'
import { listPublicPractices } from '@/lib/practices'
import { circleEventInsider, loadCircleContentFacts } from './tab-facts'

// ── THE CIRCLE DETAIL SHELL (PAGE-FRAMEWORK §3, "How templates map to Next.js") ──────────────────
//
// A Detail page IS a route-segment layout: the context header + tabs live here, the tab bodies slot
// in as `children`. Navigating between tabs preserves this header (partial rendering) instead of
// repainting it.
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
// Component. The strip is a <nav> of real links carrying aria-current="page" — these tabs are
// ROUTES, so they must never wear ARIA tab/tablist roles (the most common bug in this pattern).
//
// WHY THE RAIL IS UNTOUCHED. Nothing is registered in lib/layout/page-chrome.ts for this route and
// nothing should be: FOCUS_NONE_PREFIXES / SCOPED_PREFIXES / SCOPED_PATTERNS are empty on purpose
// (owner directive 2026-06-20, reaffirmed 2026-07-28 after the Channel 'scoped' experiment was
// reversed the same night), so /circles/<slug> and every tab under it keep the 'global' community
// rail. The circle ADMIN rail also needs no edit: adminScopeFor matches /^\/circles\/([^/]+)/ as a
// PREFIX, so a tab route resolves to the same circle scope its parent does (locked by
// lib/layout/page-chrome.test.ts).
//
// ── THE HEADER: THE COVER LOCKUP, RESTORED (owner ruling, 2026-08-13) ────────────────────────────
//
// 🔴 READ THIS BEFORE CHANGING THE HEADER. It has now been rewritten twice and reverted once, and
// the revert was the owner's, in these words: *"The old header was perfect, I just wanted you to
// rearrange the content."* The 2026-08-12 version moved the title OFF the cover and into the
// template's own identity lockup below it. That is a defensible pattern in the abstract and it is
// NOT what this product uses: every other destination page — the Space profile, the Journey page,
// the person profile — opens on one immersive cover with the title riding it (ADR-793, the unified
// entity header). A Circle that alone put its title in a text row below the photo was the odd one
// out, and it read as one.
//
// So the `hero` + `band` shape is back, exactly as ADR-793 specifies it:
//
//   1. COVER    — ONE immersive PageHero as DetailTemplate's `hero` slot: rounded, bordered, height
//                 off the header element's size ladder. No cover photo = the neutral token gradient.
//                 Never a bare cover card with the title stranded underneath it.
//   2. TUNABLE  — layout / height / overlay resolve through `resolveHeaderElement`, so /admin/elements
//                 retunes the band with no deploy, and the operator's saved hero height wins over it.
//   3. TITLE    — the single page <h1> rides the cover, bottom-left, over the ink scrim, with the
//                 uppercase "CIRCLE" eyebrow above it. This is the ONLY h1 on the page: the body
//                 tabs beneath are bodies, not shells (check:headers proves it).
//   4. SUBTITLE — one quiet on-ink line on the cover: the place.
//   5. ACTIONS  — bottom-RIGHT on the cover. See the next block, which is the part that changed.
//   6. BAND     — below the hero: status + mode chips, the Hub line, the fact row, the capacity bar.
//   7. BACK     — DetailTemplate's `back` slot, above the band. The breadcrumb and the back link
//                 coexisted here for a year and the owner reads both as correct; this is not the
//                 page to relitigate it on.
//
// ── EDIT AND MANAGE RIDE WITH THE PRIMARY ACTION (owner ruling, 2026-08-13) ──────────────────────
//
// The previous version moved every host affordance into the admin rail and left the header with one
// primary. The owner put two of them back and said where: *"Those are admin only. put them to the
// right by the post button."* So Edit and Manage are cover actions now, beside Post, not a separate
// light row down in the band where they used to sit.
//
// They are gated on `circle.editSettings` — the SAME capability the admin rail's circle modules
// use, resolved once by `circleCapabilities` above. A member sees Post and nothing else; a visitor
// sees Join; nobody who cannot manage the Circle sees either button, so the row does not grow for
// the twenty-nine people in thirty who could not use it anyway.
//
// The primary keeps its accent fill so it lifts off the photo; Edit, Manage and Leave use the
// glassy on-ink `HERO_ACTION_CLASS`, which is the kit's one answer to "a secondary button on top of
// an arbitrary image" and the reason none of them needs a hand-rolled class string.
//
// THE OPERATOR'S THREE COVER CONTROLS are native to this shape and need no special handling: hero
// HEIGHT, cover FOCAL POINT and the cover SCRIM are PageHero's own props, which is what they were
// written against. (Between 2026-08-12 and this revert they were briefly routed through
// DetailTemplate's standard cover path instead. That path keeps its `coverFocus`/`coverSize`/
// `coverOverlayStyle` props — other Detail pages use them — it is just not what a Circle takes.)
//
// The scrim mapping is NOT written here and must never be: `lib/layout/cover-scrim.ts` holds the
// one operator-vocabulary → PageHero-prop mapping (none/shade/blend → none/shadow/fade), shared
// with Spaces, and `circleHeroOverlayStyle` in lib/circles/hero.ts only says "read it off a
// Circle's theme blob". A second copy is how Spaces and Circles drift into disagreeing about what
// "Blend" looks like.
//
// ── SPEED (PAGE-FRAMEWORK §5) ────────────────────────────────────────────────────────────────────
// This file used to run FOUR serial awaits before it returned any JSX, which is §5.3's named
// anti-pattern: nothing can stream until the last one lands. It is now two rounds, and the second
// is a single Promise.all:
//   round 1 — the Circle itself + the viewer's profile id (both request-memoized).
//   round 2 — capabilities, the viewer's Crew hat, and the three tab-content facts, in parallel.
// Everything that is not identity streams behind its own <Suspense>: the demo-claim card (which
// reads the whole practice library) and the tab body below, whose skeleton lives in loading.tsx.
// The tab-content facts stay INLINE and are the one deliberate exception: the strip is navigation,
// and navigation that pops in after the page paints moves the content under the reader's cursor.
// They are three light reads that overlap with the capability resolution, and each one is memoized
// for the tab body that renders next, so the strip costs the page no extra round trip.

export default async function CircleDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Round 1. The circle + roster and the viewer, request-memoized: the tab page under `children`
  // calls the same loaders and gets memo hits, so the shell costs no extra reads.
  const [shell, myProfileId] = await Promise.all([loadCircleShell(slug), getMyProfileId()])
  if (!shell) notFound()
  const { circle, members, theme } = shell

  const isMember = !!myProfileId && members.some((m) => m.profile?.id === myProfileId)
  const isHost = !!myProfileId && circle.host?.id === myProfileId

  // Round 2. Four independent reads in one batch. `user` gates the signed-in-only banners, caps
  // drives the manager rules, isPaidViewer feeds the Crew gate on Join, and the content facts
  // decide which tabs exist at all.
  const [user, caps, isCrew, content, header] = await Promise.all([
    getCachedUser(),
    // Request-memoized, so the tab page under `children` asking the same question is a memo hit
    // rather than a second capability resolution (lib/circles/detail-access.ts).
    circleCapabilities(circle.id),
    myProfileId ? isPaidViewer() : Promise.resolve(false),
    // `insider` keys the memoized events read, and it is derived from the roster (not from caps)
    // so the Events tab can derive the SAME key and hit the memo. See circleEventInsider.
    loadCircleContentFacts(circle.id, circleEventInsider({ isMember, isHost })),
    // The tunable header band (ADR-793). Identity layout, standard height, unless /admin/elements
    // says otherwise. It joins this batch rather than sitting in front of the JSX, because the
    // cover cannot paint without it and a serial await here is PAGE-FRAMEWORK §5.3's anti-pattern.
    resolveHeaderElement({ defaults: { layout: 'identity', height: 'standard' } }),
  ])

  const canManage = caps.has('circle.editSettings')
  // Draft circles are private to their managers (ADR starter-circles draft status): a draft is a
  // not-yet-published circle only its host/stewards (and staff) may see, so it can be built up
  // before it goes live. Anyone else gets a 404 by direct link, exactly as if it did not exist —
  // and it is already excluded from every discovery surface (index, /discover, sitemap RPC). The
  // gate lives HERE so it covers every tab beneath the shell, not just the Feed one.
  const isDraft = circle.status === 'draft'
  if (isDraft && !canManage) notFound()

  const full = circle.member_count >= circle.member_cap
  const nearCap = circle.member_count >= circle.member_cap * 0.9
  const pct = Math.min(100, Math.round((circle.member_count / circle.member_cap) * 100))

  // The operator's saved hero height, when they have set one on THIS Circle, wins over the header
  // element default resolved in round 2 above. Null-unless-chosen is the whole point: a host who
  // picks "Standard" on a Circle whose element says "Tall" must see the height change, so an
  // explicit choice is stored and only an unset key defers to the element (lib/circles/hero.ts).
  const savedHeroHeight = hasCircleHeroHeight(theme) ? readCircleHeroHeight(theme) : undefined

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

  // Which tabs this Circle has earned. Pure + unit-tested in lib/circles/tabs.ts.
  const tabs = circleTabs({
    slug: circle.slug,
    memberCount: members.length,
    canManage,
    isMember,
    ...content,
  })

  // The ONE primary action, resolved to a single answer per viewer. A member's is Post: it lands on
  // the Feed tab at the composer, which is the thing a Circle is for. Everyone else's is Join.
  const canJoin = !isMember && !!myProfileId && !full && !isDraft
  const primary = isMember || isHost ? 'post' : canJoin ? 'join' : 'none'

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

      {/* Demo circles invite a real member to claim + host them in place. The card needs the whole
          practice library for its picker, so it streams: the header never waits on it. */}
      {circle.is_demo && user && (
        <Suspense fallback={null}>
          <DemoClaimCard circleId={circle.id} name={circle.name} about={circle.about} />
        </Suspense>
      )}

      <DetailTemplate
        back={{ href: '/circles', label: 'Circles' }}
        title={circle.name}
        hero={
          <PageHero
            variant={header.layout}
            size={savedHeroHeight ?? header.height}
            // The operator's own None / Shade / Blend choice, added to the Circle admin rail on
            // 2026-08-12. It is TOTAL — an untuned Circle reads 'shade', the treatment that stays
            // legible on any photo — so it needs no fallback to the element default and must not
            // have one, or a deliberate "None" would be overridden by the element.
            overlayStyle={circleHeroOverlayStyle(theme)}
            coverImage={circle.image_url}
            coverFocus={readCircleCoverFocus(theme)}
            eyebrow="Circle"
            title={circle.name}
            subtitle={[circle.neighborhood, circle.city].filter(Boolean).join(', ') || undefined}
            actions={
              <>
                {/* The ONE filled primary, so it lifts off an arbitrary photo. Post for someone
                    already inside, Join for someone who is not. */}
                {primary === 'post' && (
                  <Link
                    href={`/circles/${circle.slug}#circle-post`}
                    className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary lift-1 transition-colors hover:bg-primary-hover"
                  >
                    <PenLine className="h-4 w-4" aria-hidden />
                    Post
                  </Link>
                )}

                {primary === 'join' && (
                  <CrewGateButton
                    isCrew={isCrew}
                    label="Join"
                    buttonClassName="shrink-0 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary lift-1 transition-colors hover:bg-primary-hover"
                  >
                    <JoinCircleButton
                      circleId={circle.id}
                      circleSlug={circle.slug}
                      label="Join"
                      className="shrink-0 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary lift-1 transition-colors hover:bg-primary-hover"
                    />
                  </CrewGateButton>
                )}

                {!isMember && myProfileId && full && (
                  <span className="shrink-0 inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-on-ink/40 bg-on-ink/10 px-3 py-1.5 text-body-sm font-semibold text-on-ink/70 backdrop-blur-sm">
                    Full
                  </span>
                )}

                {/* ADMIN ONLY, beside the primary (owner ruling 2026-08-13). Gated on the same
                    `circle.editSettings` the admin rail's circle modules use, so a member never
                    sees them. The host menu rides along: it is the third host affordance and it
                    belongs with the other two, not on its own row. */}
                {canManage && (
                  <>
                    <OpenAdminBarButton
                      scope={{ kind: 'circle', id: circle.id }}
                      caps={Array.from(caps)}
                      label="Edit"
                      icon={<Settings className="h-4 w-4" />}
                      className={HERO_ACTION_CLASS}
                    />
                    <Link href={`/circles/${circle.slug}/manage`} className={HERO_ACTION_CLASS}>
                      <LayoutDashboard className="h-4 w-4" aria-hidden />
                      Manage
                    </Link>
                    <CircleHostMenu circleId={circle.id} />
                  </>
                )}

                {/* Leaving is only possible from here, so it cannot move to the admin rail with the
                    host tools. A host does not get it: they hand the Circle over (ADR-845) rather
                    than walking out of it. */}
                {isMember && !isHost && (
                  <form action={leaveCircle.bind(null, circle.id)}>
                    <button type="submit" className={HERO_ACTION_CLASS}>
                      Leave
                    </button>
                  </form>
                )}
              </>
            }
          />
        }
        band={
          <div className="min-w-0 space-y-2">
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

            {/* Place-first context: the Hub this circle belongs to. Hubs/Nexuses surface here as the
                emergent "where this sits", never as primary nav (IA §3a/§4). */}
            {circle.hub && (
              <div className="flex items-center gap-1.5 text-body-sm text-subtle">
                <MapPin className="h-4 w-4 shrink-0" aria-hidden />
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
                <Users className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                <span className="font-semibold text-text">
                  {circle.member_count} of {circle.member_cap} members
                </span>
              </span>
              {circle.host && (
                <span>
                  Host{' '}
                  <Link
                    href={`/people/${circle.host.handle}`}
                    className="font-medium text-primary-strong hover:underline"
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

// The demo-claim card's practice picker needs the whole public practice library. Only a claimable
// demo circle seen by a signed-in viewer ever pays for that read, and now it pays for it BEHIND a
// Suspense boundary instead of in front of the header (PAGE-FRAMEWORK §5.3).
async function DemoClaimCard({
  circleId,
  name,
  about,
}: {
  circleId: string
  name: string
  about: string | null
}) {
  const practices = await listPublicPractices()
  return (
    <ClaimCircle
      circleId={circleId}
      name={name}
      about={about}
      practices={practices.map((p) => ({ id: p.id, title: p.title }))}
    />
  )
}
