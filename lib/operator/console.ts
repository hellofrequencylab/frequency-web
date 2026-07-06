// The Operator Console registry — the single, append-only source of truth for the operator
// information architecture (docs/BUSINESS-ACCOUNTS-PRODUCTION-PLAN.md Part 1, ADR pending).
//
// ONE console, SCOPE-SWITCHED: the root platform (a Space with type='root') and every tenant Space
// are the same operator role at different scopes. Both mount the same 7 workspaces; what a viewer
// sees is decided by lib/operator/visible.ts from three axes that already ship:
//   1. ROLE      — root reads the STAFF axis (web_role + the team_members staffDomain matrix);
//                  space reads the SpaceRole ladder (viewer < editor < moderator < admin).
//   2. PLAN      — an optional FEATURE_GATES key (lib/pricing/gates.ts), OFF-safe: while billing is
//                  OFF every gate grants, so behavior matches today.
//   3. SPACE FN  — an optional per-Space function switch (lib/spaces/functions.ts) and/or a
//                  spaceTypes restriction (donations only for 'organization', etc.).
//
// This module is PURE DATA + TYPES (no React / Supabase / async), transcribed from the real nav
// sources — app/(main)/admin/sections.ts (ADMIN_GROUPS) and lib/spaces/functions.ts (SPACE_FUNCTIONS).
// Later phases only APPEND subtabs (never re-shape the seven workspaces). Copy is plain operator
// voice, no em dashes (docs/CONTENT-VOICE.md).

import type { WebRole } from '@/lib/core/roles'
import type { StaffDomain } from '@/lib/core/staff-roles'
import type { SpaceRole } from '@/lib/spaces/membership'
import type { SpaceType } from '@/lib/spaces/types'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'

/** Which operator scope an entry belongs to. 'root' = platform; 'space' = a tenant Space;
 *  'both' = it renders in either, gated per-scope. */
export type ConsoleScope = 'root' | 'space' | 'both'

/** The seven fixed workspace ids (the left rail). Stable — routes derive from these. */
export type WorkspaceId =
  | 'home'
  | 'profile-site'
  | 'people'
  | 'marketing'
  | 'offerings'
  | 'community'
  | 'settings'

export const WORKSPACE_IDS: readonly WorkspaceId[] = [
  'home',
  'profile-site',
  'people',
  'marketing',
  'offerings',
  'community',
  'settings',
] as const

/** One gated console entry (a subtab). Every gating field is OPTIONAL; the resolver applies only the
 *  ones present, exactly as the shipped gates do. */
export interface ConsoleEntry {
  /** Stable subtab id, used as the ?tab= value. Unique within its workspace. */
  id: string
  /** Plain operator-facing label (no em dashes). */
  label: string
  desc?: string
  scope: ConsoleScope
  // ── Root gating (staff axis) ──────────────────────────────────────────────
  /** Root floor on the web_role ladder (none < admin < janitor). Default 'admin' at root scope. */
  rootMinWebRole?: WebRole
  /** A team_members capability domain that ALSO unlocks this entry, unioned with rootMinWebRole. */
  staffDomain?: StaffDomain
  // ── Space gating (SpaceRole ladder) ───────────────────────────────────────
  /** Space floor on the SpaceRole ladder. Default from the space function, else 'editor'. */
  spaceMinRole?: SpaceRole
  /** The per-Space function switch this entry rides (universal default-ON, or plan-gated). */
  spaceFn?: SpaceFunctionKey
  /** Restrict this entry to these spaces.type values. Absent = all types. */
  spaceTypes?: readonly SpaceType[]
  // ── Plan gating (both scopes, OFF-safe) ───────────────────────────────────
  /** A lib/pricing/gates.ts FEATURE_GATES key. While billing is OFF the resolver grants it. */
  planGate?: string
  /** The legacy route(s) this entry folds, for the redirect map (lib/operator/route-map.ts, P0:6). */
  legacyHrefs?: readonly string[]
}

/** A top-level workspace: id, label, route slug, scope, floor, and subtabs. */
export interface OperatorWorkspace {
  id: WorkspaceId
  label: string
  /** Route slug appended to the scope root: /admin/{route} or /spaces/[slug]/manage/{route}. */
  route: string
  /** Optional icon name (resolved to a component in the UI layer; kept as a string to stay pure). */
  icon?: string
  scope: ConsoleScope
  /** Workspace floor (same axis semantics as ConsoleEntry, per scope). */
  rootMinWebRole?: WebRole
  staffDomain?: StaffDomain
  spaceMinRole?: SpaceRole
  /** Space-type restriction for the whole workspace (Offerings is space-only, subset of types). */
  spaceTypes?: readonly SpaceType[]
  subtabs: readonly ConsoleEntry[]
}

// ── The registry ─────────────────────────────────────────────────────────────
// Seven workspaces. Subtabs are transcribed from ADMIN_GROUPS (root) and SPACE_FUNCTIONS (space).
// Append-only: later phases add subtabs; they never re-shape this list.

export const OPERATOR_CONSOLE: readonly OperatorWorkspace[] = [
  {
    id: 'home',
    label: 'Home',
    route: 'home',
    icon: 'home',
    scope: 'both',
    rootMinWebRole: 'admin',
    spaceMinRole: 'viewer',
    subtabs: [
      {
        id: 'overview',
        label: 'Overview',
        desc: 'Your key numbers, recent activity, and quick actions.',
        scope: 'both',
        rootMinWebRole: 'admin',
        spaceMinRole: 'viewer',
        legacyHrefs: ['/admin', '/admin/insights'],
      },
    ],
  },
  {
    id: 'profile-site',
    label: 'Profile and site',
    route: 'site',
    icon: 'layout',
    scope: 'both',
    rootMinWebRole: 'admin',
    spaceMinRole: 'editor',
    subtabs: [
      {
        id: 'profile',
        label: 'Profile',
        desc: 'Brand, tagline, about, and visibility.',
        scope: 'both',
        rootMinWebRole: 'admin',
        spaceMinRole: 'editor',
        spaceFn: 'profile',
        legacyHrefs: ['/spaces/[slug]/settings'],
      },
      {
        id: 'theme',
        label: 'Theme',
        desc: 'Colors, logo, and appearance.',
        scope: 'both',
        rootMinWebRole: 'admin',
        staffDomain: 'profiles',
        spaceMinRole: 'editor',
        spaceFn: 'profile',
        legacyHrefs: ['/admin/appearance'],
      },
      {
        id: 'pages',
        label: 'Pages',
        desc: 'The page builder and layout.',
        scope: 'both',
        rootMinWebRole: 'admin',
        staffDomain: 'profiles',
        spaceMinRole: 'editor',
        spaceFn: 'profile',
        legacyHrefs: ['/pages', '/admin/page-layout'],
      },
      {
        id: 'menu',
        label: 'Menu',
        desc: 'The navigation menu.',
        scope: 'root',
        rootMinWebRole: 'janitor',
        staffDomain: 'platform',
        legacyHrefs: ['/admin/menu'],
      },
      {
        id: 'spaces',
        label: 'Spaces',
        desc: 'The tenant Space directory.',
        scope: 'root',
        rootMinWebRole: 'admin',
        staffDomain: 'platform',
        legacyHrefs: ['/admin/spaces'],
      },
    ],
  },
  {
    id: 'people',
    label: 'People',
    route: 'people',
    icon: 'users',
    scope: 'both',
    rootMinWebRole: 'admin',
    spaceMinRole: 'editor',
    subtabs: [
      {
        id: 'roster',
        label: 'Roster',
        desc: 'Members and team.',
        scope: 'both',
        rootMinWebRole: 'admin',
        staffDomain: 'members',
        spaceMinRole: 'editor',
        spaceFn: 'members',
        legacyHrefs: ['/admin/members', '/spaces/[slug]/settings/members'],
      },
      {
        id: 'crm',
        label: 'CRM',
        desc: 'Pipeline, contacts, and notes.',
        scope: 'both',
        rootMinWebRole: 'admin',
        staffDomain: 'marketing',
        spaceMinRole: 'admin',
        spaceFn: 'crm',
        planGate: 'space_crm',
        legacyHrefs: ['/admin/crm', '/spaces/[slug]/crm'],
      },
      {
        id: 'segments',
        label: 'Segments',
        desc: 'Saved audiences.',
        scope: 'root',
        rootMinWebRole: 'admin',
        staffDomain: 'marketing',
        legacyHrefs: ['/admin/segments'],
      },
      {
        id: 'verification',
        label: 'Verification',
        desc: 'Partner and persona verification.',
        scope: 'root',
        rootMinWebRole: 'janitor',
        staffDomain: 'members',
        legacyHrefs: ['/admin/personas'],
      },
      {
        id: 'support',
        label: 'Support',
        desc: 'Member support tickets.',
        scope: 'root',
        rootMinWebRole: 'admin',
        staffDomain: 'members',
        legacyHrefs: ['/admin/support'],
      },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    route: 'marketing',
    icon: 'megaphone',
    scope: 'both',
    rootMinWebRole: 'admin',
    staffDomain: 'marketing',
    spaceMinRole: 'admin',
    subtabs: [
      {
        id: 'campaigns',
        label: 'Campaigns',
        desc: 'Write, schedule, and send email.',
        scope: 'both',
        rootMinWebRole: 'admin',
        staffDomain: 'marketing',
        spaceMinRole: 'admin',
        spaceFn: 'email',
        planGate: 'space_email',
        legacyHrefs: ['/admin/marketing/campaigns', '/spaces/[slug]/settings/email'],
      },
      {
        id: 'automations',
        label: 'Automations',
        desc: 'Triggers, sequences, and drips.',
        scope: 'both',
        rootMinWebRole: 'admin',
        staffDomain: 'marketing',
        spaceMinRole: 'admin',
        planGate: 'space_automation',
        legacyHrefs: ['/admin/marketing/automations', '/admin/marketing/nurture'],
      },
      {
        id: 'qr',
        label: 'QR codes',
        desc: 'Codes and the pages they open.',
        scope: 'both',
        rootMinWebRole: 'admin',
        staffDomain: 'qr',
        spaceMinRole: 'editor',
        spaceFn: 'qr',
        legacyHrefs: ['/admin/qr', '/spaces/[slug]/settings/qr'],
      },
      {
        id: 'funnels',
        label: 'Funnels',
        desc: 'Entry points and conversion paths.',
        scope: 'root',
        rootMinWebRole: 'admin',
        staffDomain: 'marketing',
        legacyHrefs: ['/admin/marketing/funnels', '/entry-points'],
      },
      {
        id: 'referrals',
        label: 'Referrals',
        desc: 'The referral program.',
        scope: 'root',
        rootMinWebRole: 'admin',
        staffDomain: 'marketing',
        legacyHrefs: ['/admin/referrals'],
      },
      {
        id: 'analytics',
        label: 'Analytics',
        desc: 'Campaign and demand analytics.',
        scope: 'root',
        rootMinWebRole: 'admin',
        staffDomain: 'insights',
        legacyHrefs: ['/admin/marketing/analytics', '/admin/marketing/market-read'],
      },
    ],
  },
  {
    id: 'offerings',
    label: 'Offerings and commerce',
    route: 'offerings',
    icon: 'shopping-bag',
    scope: 'both',
    rootMinWebRole: 'admin',
    spaceMinRole: 'admin',
    subtabs: [
      {
        id: 'availability',
        label: 'Availability and bookings',
        desc: 'Weekly booking times and the calendar.',
        scope: 'space',
        spaceMinRole: 'editor',
        spaceFn: 'availability',
        spaceTypes: ['practitioner'],
      },
      {
        id: 'memberships',
        label: 'Memberships',
        desc: 'The tiers members can join.',
        scope: 'space',
        spaceMinRole: 'admin',
        spaceFn: 'memberships',
        spaceTypes: ['business'],
      },
      {
        id: 'donations',
        label: 'Donations',
        desc: 'The fund and giving levels.',
        scope: 'space',
        spaceMinRole: 'admin',
        spaceFn: 'donations',
        spaceTypes: ['organization'],
      },
      {
        id: 'enroll',
        label: 'Enrollment',
        desc: 'Program definition and roster.',
        scope: 'space',
        spaceMinRole: 'admin',
        spaceFn: 'enroll',
        spaceTypes: ['coaching'],
      },
      {
        id: 'tickets',
        label: 'Tickets',
        desc: 'Ticket tiers and the roster.',
        scope: 'space',
        spaceMinRole: 'admin',
        spaceFn: 'tickets',
        spaceTypes: ['event_space'],
      },
      {
        id: 'checkin',
        label: 'Check-in',
        desc: 'Door check-in and scans.',
        scope: 'space',
        spaceMinRole: 'editor',
        spaceFn: 'checkin',
        spaceTypes: ['event_space'],
      },
      {
        id: 'marketplace',
        label: 'Marketplace',
        desc: 'Catalog, orders, and reports.',
        scope: 'root',
        rootMinWebRole: 'admin',
        staffDomain: 'platform',
        legacyHrefs: ['/admin/marketplace', '/admin/store'],
      },
    ],
  },
  {
    id: 'community',
    label: 'Community and content',
    route: 'community',
    icon: 'sparkles',
    scope: 'both',
    rootMinWebRole: 'admin',
    staffDomain: 'community',
    spaceMinRole: 'editor',
    subtabs: [
      {
        id: 'circles',
        label: 'Circles',
        desc: 'Circles, channels, hubs, and nexuses.',
        scope: 'both',
        rootMinWebRole: 'admin',
        staffDomain: 'community',
        spaceMinRole: 'editor',
        legacyHrefs: ['/admin/circles', '/admin/channels', '/admin/hubs', '/admin/nexuses'],
      },
      {
        id: 'events',
        label: 'Events',
        desc: 'Events and broadcasts.',
        scope: 'both',
        rootMinWebRole: 'admin',
        staffDomain: 'community',
        spaceMinRole: 'editor',
        legacyHrefs: ['/admin/events', '/admin/dispatches'],
      },
      {
        id: 'content',
        label: 'Content',
        desc: 'Practices, journeys, seasons, and challenges.',
        scope: 'root',
        rootMinWebRole: 'admin',
        staffDomain: 'community',
        legacyHrefs: ['/admin/content/practices', '/admin/content/journeys', '/admin/content/seasons'],
      },
      {
        id: 'rewards',
        label: 'Rewards',
        desc: 'Gamification, the store, and crew tasks.',
        scope: 'root',
        rootMinWebRole: 'admin',
        staffDomain: 'community',
        legacyHrefs: ['/admin/gamification', '/admin/crew-tasks'],
      },
      {
        id: 'moderation',
        label: 'Moderation',
        desc: 'The moderation queue.',
        scope: 'root',
        rootMinWebRole: 'admin',
        staffDomain: 'community',
        legacyHrefs: ['/admin/moderation'],
      },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    route: 'settings',
    icon: 'settings',
    scope: 'both',
    rootMinWebRole: 'admin',
    spaceMinRole: 'admin',
    subtabs: [
      {
        id: 'features',
        label: 'Features and access',
        desc: 'Turn features on and set who can use them.',
        scope: 'space',
        spaceMinRole: 'admin',
        legacyHrefs: ['/spaces/[slug]/settings/features'],
      },
      {
        id: 'billing',
        label: 'Plan and billing',
        desc: 'The plan, invoices, and payouts.',
        scope: 'both',
        rootMinWebRole: 'janitor',
        staffDomain: 'finance',
        spaceMinRole: 'admin',
        spaceFn: 'billing',
        legacyHrefs: ['/admin/pricing', '/admin/payments', '/spaces/[slug]/settings/billing'],
      },
      {
        id: 'roles',
        label: 'Roles',
        desc: 'Roles and permissions.',
        scope: 'root',
        rootMinWebRole: 'janitor',
        staffDomain: 'roles',
        legacyHrefs: ['/admin/roles'],
      },
      {
        id: 'ai',
        label: 'AI and Vera',
        desc: 'Vera configuration and AI controls.',
        scope: 'root',
        rootMinWebRole: 'janitor',
        staffDomain: 'insights',
        legacyHrefs: ['/admin/vera-ai', '/admin/ai', '/admin/studio'],
      },
      {
        id: 'audit',
        label: 'Audit',
        desc: 'The security and action trail.',
        scope: 'root',
        rootMinWebRole: 'janitor',
        staffDomain: 'platform',
        legacyHrefs: ['/admin/audit'],
      },
    ],
  },
] as const

/** Look up a workspace by id. */
export function getWorkspace(id: WorkspaceId): OperatorWorkspace | undefined {
  return OPERATOR_CONSOLE.find((w) => w.id === id)
}
