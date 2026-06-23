// THE CRM policy layer — one pure function answers "what can this person do in the
// contact engine?" It is the CRM sibling of lib/core/capabilities.ts (resolveCapabilities),
// and it COMPOSES the existing entitlement primitives rather than inventing a new gate:
//
//   • PERSONAL contact engine (the free utility spine) — granted to any signed-in member.
//     This is the brief's law: gate value AMPLIFIERS, never core utility. Contacts, the
//     interaction timeline, capture, keep-in-touch reminders, the referral link, the
//     opt-in member graph, and personal AI are all FREE. (Personal AI is metered for free
//     members by the ai_usage gate — that is a quota, not a capability gate, so it lives in
//     lib/ai, not here.)
//
//   • SPACE CRM amplifiers (the paid surface) — resolved EXACTLY as the Space CRM board is
//     gated today: spaceFunctionAccess(space, 'crm', role) for the board, and the plan's
//     spaces.entitlements keys (email / automation / team / multi_pipeline / reporting) for
//     the Studio modules layered on it. No new gate, no new tier (ADR: keep existing tiers).
//
//   • ROOT (the staff axis, web_role) — platform reach. Root sees the unified `contacts`
//     hub and runs platform-wide campaigns. Root NEVER sees a member's private
//     `network_contacts` (that capability does not exist here, by construction — privacy is
//     enforced in the data layer; this set simply never grants it).
//
// PURE + framework-independent (no Supabase/Next imports — only the pure ladder + entitlement
// readers), exactly like lib/core/capabilities.ts and lib/spaces/functions.ts, so it is
// trivially unit-testable and reusable from web, mobile, and DB-adjacent code. Capabilities
// are UX for the client and LAW for the server: the server recomputes and enforces, never
// trusting a client's set (docs/CAPABILITIES-AND-MOBILE.md).

import { type WebRole, isStaff as webIsStaff, isJanitor as webIsJanitor } from '@/lib/core/roles'
import type { EntitlementTier } from '@/lib/core/entitlement'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { spaceHasEntitlement, type SpaceLike } from '@/lib/spaces/entitlements'
import type { SpaceRole } from '@/lib/spaces/membership'

export type CrmCapability =
  // ── Personal contact engine (free utility — the spine, never gated) ──
  | 'crm.contacts.view' // see your own contacts + their unified timeline
  | 'crm.contacts.edit' // create / edit / tag / note / archive a contact
  | 'crm.capture' // manual, QR/NFC card, OCR, Gmail/phone import
  | 'crm.reminders' // keep-in-touch reminders / the "reach out today" list
  | 'crm.referral' // your referral link + Zaps attribution
  | 'crm.graph' // the opt-in member graph (mutual connect)
  | 'crm.ai.personal' // personal AI (briefs, smart reminders, cleanup) — metered for free, unlimited paid
  // ── Space CRM amplifiers (paid surface; plan axis via spaces.entitlements) ──
  | 'crm.space.view' // the per-Space CRM board (contacts + pipeline)
  | 'crm.space.pipeline' // a single sales/relationship pipeline
  | 'crm.space.multiPipeline' // more than one pipeline
  | 'crm.space.email' // 1:1 + campaign email from the Space
  | 'crm.space.campaigns' // bulk campaigns + segments
  | 'crm.space.automation' // automation rules / builder
  | 'crm.space.team' // team seats + roles
  | 'crm.space.analytics' // reporting / analytics
  // ── Root (staff axis, web_role) ──
  | 'crm.root.allContacts' // read the platform-wide unified `contacts` hub (NEVER private network_contacts)
  | 'crm.root.campaigns' // platform-wide campaigns + the full member graph

/** The inputs a CRM capability check is resolved against. The caller fetches these (viewer
 *  identity + tier + staff axis, and the Space they are acting within, if any) and passes them
 *  in — keeping this function pure and IO-free. */
export interface CrmContext {
  viewer: {
    /** profiles.id, or null when anonymous. A null viewer holds NO CRM capabilities. */
    profileId: string | null
    /** Personal billing tier (free | crew | supporter). Reserved for future personal-tier
     *  amplifiers; the brief gates CRM amplifiers on the SPACE plan, so the personal engine is
     *  fully free today. Kept on the context so a tier-gated personal feature is a one-line add. */
    tier?: EntitlementTier | null
    /** Operational staff axis (web_role): 'none' | 'admin' | 'janitor'. The brief's "Root". */
    webRole?: WebRole | null
  }
  /** The Space the viewer is acting within (the Studio / Space CRM surface), if any. Omit for the
   *  purely personal CRM. */
  space?: (SpaceLike & { featureRoles?: unknown }) | null
  /** The viewer's role WITHIN `space` (from getSpaceCapabilities). Omit / null ⇒ no Space access
   *  (fail-closed). */
  spaceRole?: SpaceRole | null
}

/**
 * Resolve the viewer's CRM capabilities. Pure and deterministic — same inputs always yield the
 * same set. Mirrors resolveCapabilities (lib/core/capabilities.ts): build a set, never throw,
 * fail closed on anything unknown.
 */
export function resolveCrmCapabilities(ctx: CrmContext): Set<CrmCapability> {
  const caps = new Set<CrmCapability>()
  const { viewer } = ctx

  // Anonymous viewers hold nothing — the personal CRM is private to a signed-in owner.
  if (!viewer.profileId) return caps

  // ── Personal contact engine: free utility for every signed-in member (the spine). ──
  caps.add('crm.contacts.view')
  caps.add('crm.contacts.edit')
  caps.add('crm.capture')
  caps.add('crm.reminders')
  caps.add('crm.referral')
  caps.add('crm.graph')
  caps.add('crm.ai.personal') // free to USE; the free/paid line is a quota (ai_usage), not a gate

  // ── Space CRM amplifiers: resolved exactly as the Space CRM is gated today. ──
  // The board itself is the 'crm' function (plan ⇒ practitioner+, role ⇒ admin by default,
  // both overridable per-Space). Every richer module is the board access AND its plan
  // entitlement key (spaces.entitlements), default-deny: a missing key is OFF.
  const space = ctx.space ?? null
  if (space) {
    const role = ctx.spaceRole ?? null
    const boardAccess = spaceFunctionAccess(space, 'crm', role)
    if (boardAccess) {
      caps.add('crm.space.view')
      caps.add('crm.space.pipeline') // the single pipeline ships with the CRM entitlement (practitioner+)
      if (spaceHasEntitlement(space, 'multi_pipeline')) caps.add('crm.space.multiPipeline')
      if (spaceHasEntitlement(space, 'email')) {
        caps.add('crm.space.email')
        caps.add('crm.space.campaigns')
      }
      if (spaceHasEntitlement(space, 'automation')) caps.add('crm.space.automation')
      if (spaceHasEntitlement(space, 'team')) caps.add('crm.space.team')
      if (spaceHasEntitlement(space, 'reporting')) caps.add('crm.space.analytics')
    }
  }

  // ── Root (staff axis): platform reach. Admin + janitor read the unified hub; janitor (the
  // Executive Admin / crown jewels) also runs platform-wide campaigns + the full graph. ──
  if (webIsStaff(viewer.webRole)) caps.add('crm.root.allContacts')
  if (webIsJanitor(viewer.webRole)) caps.add('crm.root.campaigns')

  return caps
}

/** Convenience predicate for render-time checks (mirrors lib/core/capabilities.ts `can`). */
export function canCrm(caps: ReadonlySet<CrmCapability>, cap: CrmCapability): boolean {
  return caps.has(cap)
}
