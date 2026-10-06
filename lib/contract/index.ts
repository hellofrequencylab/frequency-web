// THE APP CONTRACT, version 1 (LIVE-715, ADR-1643). docs/APP-CONTRACT.md is the prose; this file
// is the shape.
//
// 🔴 PURE ON PURPOSE. This module is what a native client compiles against: the Expo / React
// Native app (DEF-MOBILE, parked) will import these types and schemas as they are. So it imports
// `zod` and nothing else: no `next/*`, no `@/lib/supabase/*`, no `server-only`, no React. A
// server-only import here would make the one shared file un-shareable, which is exactly the drift
// CAPABILITIES-AND-MOBILE §4a warns about. lib/contract/contract.test.ts reads the imports and
// fails on anything but zod.
//
// The server half lives beside it: lib/contract/caller.ts (who is calling: a bearer token or the
// web cookie) and lib/contract/respond.ts (the envelope on the wire, the rate limit, input
// parsing). Both are server-only and neither is imported from here.
//
// WHY IT HAS AN IMPORTER FROM DAY ONE. lib/contract/ has been built and deleted twice as a
// zero-importer orphan (views.ts 2026-06-06, types.ts 2026-06-14; HYG-067). Every module in this
// directory is imported by a live route under app/api/v1, so an orphan sweep cannot take it again.

import { z } from 'zod'

/** The contract version this server speaks. A breaking change is a new major beside this one
 *  (`/api/v2`), never an edit to v1. Sent on every /api/v1 response as `Frequency-Contract`. */
export const CONTRACT_VERSION = 1

/** The URL prefix of this version. */
export const CONTRACT_PREFIX = '/api/v1'

/** Response header naming the contract version that answered. */
export const CONTRACT_HEADER = 'Frequency-Contract'

/**
 * The stable error codes, and the HTTP status each one travels with. A client branches on
 * `error.code`, never on `error.message` (the message is for a person and may be reworded).
 * Codes are ADDITIVE within v1: a new code may appear, an existing one never changes meaning or
 * status. A client must treat an unknown code as `internal`.
 */
export const ERROR_STATUS = {
  /** No valid credential: no cookie session and no bearer token, or a token that is malformed,
   *  forged, expired or revoked. The app should refresh its session and retry once, then sign out. */
  unauthorized: 401,
  /** Signed in, but there is no Frequency profile for this account yet. The app sends the person
   *  through onboarding. */
  profile_required: 403,
  /** Signed in, and not allowed to do this. Also a cookie-session write from another origin. */
  forbidden: 403,
  /** The thing does not exist, or the caller may not know that it does. */
  not_found: 404,
  /** The request body or query failed its schema. `message` names the first bad field. */
  invalid_input: 400,
  /** The write collides with the current state (a duplicate, a stale version). */
  conflict: 409,
  /** Too many requests from this caller or address. Retry after the `Retry-After` seconds. */
  rate_limited: 429,
  /** This app build is older than the server supports. Reserved: today GET /api/v1/app-config
   *  answers `updateRequired: true` for such a build (LIVE-722). Show an update prompt. */
  update_required: 426,
  /** The server failed. Safe to retry a read; a write should be retried only if idempotent. */
  internal: 500,
} as const

export type ContractErrorCode = keyof typeof ERROR_STATUS

export const CONTRACT_ERROR_CODES = Object.keys(ERROR_STATUS) as ContractErrorCode[]

export const contractErrorCode = z.enum(CONTRACT_ERROR_CODES as [ContractErrorCode, ...ContractErrorCode[]])

/** The error half of the envelope. */
export const contractError = z.object({
  code: contractErrorCode,
  message: z.string(),
})
export type ContractError = z.infer<typeof contractError>

/**
 * The envelope every /api/v1 response body is, success or failure: both keys are always present
 * and exactly one is non-null. `{ data: T, error: null }` or `{ data: null, error: { code, message } }`.
 * Pass the endpoint's data schema to get the schema of its whole response.
 */
export function envelope<T extends z.ZodType>(data: T) {
  return z.union([
    z.object({ data, error: z.null() }),
    z.object({ data: z.null(), error: contractError }),
  ])
}

export type Envelope<T> = { data: T; error: null } | { data: null; error: ContractError }

// ── GET /api/v1/me: the worked example ──────────────────────────────────────────────────────────

const communityRole = z.enum(['member', 'crew', 'host', 'guide', 'mentor', 'admin', 'janitor'])
const communityLevel = z.enum(['member', 'crew', 'host', 'guide', 'mentor'])
const webRole = z.enum(['none', 'admin', 'janitor', 'moderator'])
const membershipTier = z.enum(['free', 'crew'])

/**
 * The signed-in caller's own profile summary. The role and tier fields are the SAME values the web
 * resolves for the same person (lib/auth.ts `callerFromViewerRow`): what the app shows is what the
 * web would show, and the server re-checks every write regardless (CAPABILITIES-AND-MOBILE §3).
 */
export const meView = z.object({
  id: z.string(),
  handle: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  /** The effective community role (the web's view-as preview never applies to a bearer caller). */
  communityRole,
  /** The derived global Community level (ADR-218). */
  communityLevel,
  /** The operational staff axis (ADR-208). */
  webRole,
  /** The tier features unlock on (beta open access grants Crew to everyone signed in). */
  membershipTier,
  /** How this request was authenticated. */
  auth: z.enum(['bearer', 'cookie']),
})
export type MeView = z.infer<typeof meView>

export const meResponse = envelope(meView)

// ── GET /api/v1/capabilities: what may the caller do here? (LIVE-717) ─────────────────────────

/** The scopes the capability projection answers for. */
export const capabilityScopeKind = z.enum(['global', 'circle', 'hub', 'nexus', 'event', 'practice', 'journey', 'profile', 'space'])
export type CapabilityScopeKind = z.infer<typeof capabilityScopeKind>

/**
 * The caller's capabilities on one scope, the SAME set the web resolves to render its affordances
 * (lib/core/load-capabilities.ts, and lib/spaces/entitlements.ts for a Space). It tells an app
 * which actions to SHOW. It is never permission: every write re-checks on the server.
 *
 * `capabilities` are the resolver's dotted names (`circle.editSettings`, `event.create`, ...). A
 * client ignores a name it does not know; new names are additive. For a Space they are the
 * `space.*` projection of the Space role: `space.owner`, `space.admin`, `space.editProfile`,
 * `space.manageMembers`, `space.invite`, and `spaceRole` carries the role itself.
 */
export const capabilitiesView = z.object({
  kind: capabilityScopeKind,
  id: z.string().nullable(),
  capabilities: z.array(z.string()),
  spaceRole: z.string().nullable(),
})
export type CapabilitiesView = z.infer<typeof capabilitiesView>

export const capabilitiesResponse = envelope(capabilitiesView)

// ── /api/v1/account: deletion and the data export (LIVE-719) ───────────────────────────────────

/** GET /api/v1/account: what the app shows before it offers deletion. */
export const accountView = z.object({
  /** Spaces whose paid plan ends when this account is deleted; null when it could not be read
   *  (say it in general terms then, never "nothing"). */
  paidSpacesEndedByDelete: z.array(z.object({ name: z.string(), plan: z.string() })).nullable(),
})
export type AccountView = z.infer<typeof accountView>
export const accountResponse = envelope(accountView)

/** DELETE /api/v1/account takes this body, so a stray DELETE cannot erase an account. */
export const accountDeleteInput = z.object({ confirm: z.literal('DELETE') })
export const accountDeleteResponse = envelope(z.object({ deleted: z.literal(true) }))

/** GET /api/v1/account/export: the member data export, the same object the web downloads. Its
 *  sections are documented in lib/privacy/export.ts (`meta.format` names the shape and version). */
export const accountExportResponse = envelope(
  z.object({ filename: z.string(), export: z.object({ meta: z.looseObject({ format: z.string(), version: z.number() }), data: z.record(z.string(), z.unknown()) }) }),
)

// ── GET /api/v1/app-config: update prompt and client flags (LIVE-722) ───────────────────────────

export const appPlatform = z.enum(['ios', 'android'])
export type AppPlatform = z.infer<typeof appPlatform>

/**
 * What an app build reads at launch, before sign-in. `updateRequired` is true when the build's
 * reported version is below `minSupportedVersion`: show the blocking update prompt. `flags` are the
 * operator switches a client may read (new keys are additive; a client treats a missing key as
 * false).
 */
export const appConfigView = z.object({
  platform: appPlatform,
  minSupportedVersion: z.string(),
  latestVersion: z.string().nullable(),
  updateRequired: z.boolean(),
  flags: z.record(z.string(), z.boolean()),
})
export type AppConfigView = z.infer<typeof appConfigView>
export const appConfigResponse = envelope(appConfigView)

// ── /api/v1/reports and /api/v1/blocks: report and block (LIVE-723, App Store 1.2) ─────────────

export const reportInput = z.object({
  targetType: z.enum(['post', 'dispatch', 'comment', 'member', 'event', 'guestbook']),
  targetId: z.uuid(),
  reason: z.enum(['spam', 'harassment', 'inappropriate', 'misinformation', 'other']),
  details: z.string().max(2000).optional(),
})
export type ReportInput = z.infer<typeof reportInput>
export const reportResponse = envelope(z.object({ reported: z.literal(true) }))

export const blockInput = z.object({ profileId: z.uuid() })
export const blockResponse = envelope(z.object({ blocked: z.boolean() }))
