// The uniform-rail BOTTOM BANK (ADR-515) — the fixed per-scope quick-links pinned as a button-grid at
// the foot of every admin rail. It answers "where do I go from here?": the primary AREAS a manager
// jumps to for this scope (the manage console, CRM, Insights, Billing, the operator workspace), as
// opposed to the inline settings the rail edits in place.
//
// PURE + client-safe (no React, no IO): the standardized admin rail imports it into the client bundle.
// The base per-scope links are FIXED (declared here); `settings-panel` MERGES any surface tagged
// `placement: 'bank'` (ADR-515) as extra links, resolved to their href through the same maps the body
// uses (hrefForSurface / hrefForEntitySurface). Fail-safe by construction: empty-safe for an unknown or
// null scope, de-dupes by href, and NEVER admits a destructive / Danger link (the bank is navigation,
// never a place to delete from).

import type { LucideIcon } from 'lucide-react'
import { Settings, SlidersHorizontal, Users, BarChart3, CreditCard, ShieldCheck, LayoutDashboard, CalendarPlus, Megaphone, Hash, ShieldAlert, PencilRuler } from 'lucide-react'
import { hrefForSurface } from '@/lib/spaces/surface-hrefs'
import type { AdminScope } from '@/lib/layout/page-chrome'

/** One bank quick-link: a plain label, a Lucide icon, and a resolved in-app href. */
export interface BankLink {
  label: string
  icon: LucideIcon
  href: string
}

/** The viewer facts the bank reads. Staff/operator unlocks the operator-workspace links on the
 *  personal/global bank. Kept minimal + serializable-shaped so any caller can supply it. */
export interface BankViewer {
  /** The web_role staff axis (operator). Omitted / false ⇒ no operator links. */
  isStaff?: boolean
}

/** The URL section for an entity kind whose `/{section}/<slug>/manage` console the bank links to. */
const SECTION_FOR_KIND: Partial<Record<string, string>> = {
  circle: 'circles',
  event: 'events',
  hub: 'hubs',
  nexus: 'nexuses',
  practice: 'practices',
  journey: 'journeys',
}

/** Whether an href points at a destructive surface — the bank never admits one (fail-safe). */
function isDangerHref(href: string): boolean {
  return /(?:^|\/)(?:danger|delete)(?:$|[/?#])/i.test(href)
}

/** Append a link only when its href resolved (a null href draws nothing, never a dead button). */
function pushLink(out: BankLink[], label: string, icon: LucideIcon, href: string | null | undefined): void {
  if (href) out.push({ label, icon, href })
}

/** The FIXED base bank for a scope, before any `placement: 'bank'` surfaces merge in.
 *
 *  `slug` is the entity's URL slug read from the live path (settings-panel resolves it). Console /
 *  settings routes are SLUG-keyed (`/circles/<slug>/manage`), but an OpenAdminBarButton carries the
 *  entity's DB id on `scope.id` (the slug≠id detail contract), so console hrefs use `slug ?? scope.id`.
 *  A few links are DB-id-keyed by design (the circle create quick-actions pass `?circle=<id>` — the
 *  create form matches the param against `circle.id`), so those deliberately keep `scope.id`. */
function baseBank(scope: AdminScope | null, viewer: BankViewer, slug: string | null): BankLink[] {
  if (!scope) return []
  // The URL slug for console/settings hrefs; falls back to scope.id when no path slug was supplied
  // (e.g. a unit test that passes a slug-shaped id directly).
  const urlSlug = slug ?? scope.id
  switch (scope.kind) {
    // A Space: its owner console + the primary paid workspaces (CRM · Insights · Billing), resolved
    // through hrefForSurface so a route rename is a one-line map change. Slug from the live path.
    case 'space': {
      if (!urlSlug) return []
      const out: BankLink[] = [
        { label: 'Manage console', icon: Settings, href: `/spaces/${urlSlug}/manage` },
      ]
      pushLink(out, 'CRM', Users, hrefForSurface('space.crm', urlSlug))
      pushLink(out, 'Insights', BarChart3, hrefForSurface('space.insights', urlSlug))
      pushLink(out, 'Billing', CreditCard, hrefForSurface('space.billing', urlSlug))
      return out
    }
    // The personal / global scope (and a person profile): the member's own settings + billing, plus the
    // operator workspace links for staff.
    case 'global':
    case 'profile': {
      const out: BankLink[] = [
        { label: 'All settings', icon: Settings, href: '/settings' },
        { label: 'Billing', icon: CreditCard, href: '/settings/billing' },
      ]
      if (viewer.isStaff) {
        out.push(
          { label: 'Operator', icon: ShieldCheck, href: '/admin' },
          { label: 'CRM', icon: Users, href: '/admin/crm' },
          { label: 'Insights', icon: BarChart3, href: '/admin/insights' },
        )
      }
      return out
    }
    // A CIRCLE (ADR-515 Phase 4): the thin manage console PLUS the host's two create quick-actions —
    // New event and New announcement — so the "where do I go from here?" bank carries the create paths
    // the header CircleHostMenu used to own. The hrefs mirror CircleHostMenu exactly (keyed on the same
    // circle id the scope carries), so they resolve identically. Insights stays INLINE (a circle has no
    // standalone insights page — see ADR-515 Phase 4), so it is not a bank link.
    case 'circle': {
      const id = scope.id
      if (!id || !urlSlug) return []
      return [
        // Console is SLUG-keyed; the two create quick-actions are DB-ID-keyed (the create form matches
        // `?circle=` against circle.id), so they keep scope.id — mirrors CircleHostMenu exactly.
        { label: 'Manage console', icon: SlidersHorizontal, href: `/circles/${urlSlug}/manage` },
        { label: 'New event', icon: CalendarPlus, href: `/events/new?circle=${id}` },
        { label: 'New announcement', icon: Megaphone, href: `/broadcast?compose=true&scope=${id}` },
      ]
    }
    // An EVENT (ADR-515 Phase 4): the full host Manage dashboard — the second-layer console that carries
    // the roster, approvals, questionnaire, sent Dispatches, AND the analytics (so "Insights" folds into
    // it rather than a duplicate button, and the on-page Dispatch composer stays the compose path). This
    // is the canonical "open the dashboard" affordance the People module used to deep-link to inline.
    case 'event': {
      if (!urlSlug) return []
      return [{ label: 'Manage dashboard', icon: LayoutDashboard, href: `/events/${urlSlug}/manage` }]
    }
    // A core entity with a full owner console: one Manage link into `/{section}/<slug>/manage`. Hub +
    // nexus + practice consoles are thin, so their bank is just that console (their insights/relevant
    // hubs live inside it) — 1 link is intentional; the inline body carries the rest.
    case 'hub':
    case 'nexus':
    case 'practice': {
      const section = SECTION_FOR_KIND[scope.kind]
      if (!urlSlug || !section) return []
      return [{ label: 'Manage console', icon: SlidersHorizontal, href: `/${section}/${urlSlug}/manage` }]
    }
    // A JOURNEY (ADR-515 Phase 6): a Journey's "console" IS its full-page builder — the immersive
    // Phase → Module → Lesson structure editor at /journeys/<slug>/edit (identity + delivery + publish
    // settings live alongside the block tree there). The block tree is data-heavy, so instead of a thin
    // per-entity /manage console the bank links straight into the builder. Slug-keyed (console/edit routes
    // are slug-keyed; the OpenAdminBarButton carries the DB id on scope.id, so we use slug ?? scope.id).
    case 'journey': {
      if (!urlSlug) return []
      return [{ label: 'Open builder', icon: PencilRuler, href: `/journeys/${urlSlug}/edit` }]
    }
    // A CHANNEL (ADR-515 Phase 5): topical channels are OPERATOR-CURATED (no per-channel owner — the
    // settings module gates on staff), so unlike the owner-console entities the channel has no per-entity
    // `/{section}/<slug>/manage` console. Its bank leans on the operator `/admin` hub instead: the channels
    // directory (where staff create / edit / archive channels) and Moderation (review + resolve reports).
    // Staff-only — a non-staff viewer never reaches the channel rail, so a null bank is the fail-safe.
    case 'channel': {
      if (!viewer.isStaff) return []
      return [
        { label: 'Channels', icon: Hash, href: '/admin/channels' },
        { label: 'Moderation', icon: ShieldAlert, href: '/admin/moderation' },
      ]
    }
    // Unknown / bank-less scopes get an empty bank gracefully.
    default:
      return []
  }
}

/**
 * The bank quick-links for a page `scope` + `viewer`, MERGED with any `placement: 'bank'` surface links
 * the caller resolved (`extra`). `slug` is the entity's URL slug from the live path — console/settings
 * routes are slug-keyed, so the base links use it (falling back to `scope.id` when omitted). De-dupes by
 * href (a base link and a bank surface pointing at the same place collapse to one) and drops any
 * destructive href (Danger is never in the bank). Returns `[]` gracefully for a null / unknown scope.
 * PURE + unit-tested.
 */
export function bankForScope(
  scope: AdminScope | null,
  viewer: BankViewer = {},
  extra: readonly BankLink[] = [],
  slug: string | null = null,
): BankLink[] {
  const seen = new Set<string>()
  const out: BankLink[] = []
  for (const link of [...baseBank(scope, viewer, slug), ...extra]) {
    if (!link || !link.href) continue
    if (isDangerHref(link.href)) continue
    if (seen.has(link.href)) continue
    seen.add(link.href)
    out.push(link)
  }
  return out
}
