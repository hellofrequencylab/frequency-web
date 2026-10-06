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

// ── POST /api/v1/session/bootstrap: the native post-sign-in step (LIVE-718) ─────────────────────

/** What the app gets after it signs in (and on every cold start): who it is, and where a guest
 *  claim says to land. `seatLanding` (a live event) outranks `orderLanding` (a paid Journey's
 *  welcome); both are site paths the app maps to its own screens, or opens on the web. */
export const sessionBootstrapView = z.object({
  me: meView,
  seatLanding: z.string().nullable(),
  orderLanding: z.string().nullable(),
})
export type SessionBootstrapView = z.infer<typeof sessionBootstrapView>
export const sessionBootstrapResponse = envelope(sessionBootstrapView)

// ── /api/v1/nodes: capture and nearby (LIVE-721) ────────────────────────────────────────────────

const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })

/** POST /api/v1/nodes/{id}/capture body. `secret` is the signed code a QR or an NFC tag carries
 *  (the `?s=` of its /n/<id> link). `attestation` (App Attest / Play Integrity) is accepted and
 *  not yet verified: that needs the app build (DEF-MOBILE). */
export const nodeCaptureInput = z.object({
  secret: z.string().max(512).nullable().optional(),
  location: latLng.nullable().optional(),
  attestation: z.string().max(8192).nullable().optional(),
})
export const nodeCaptureView = z.object({
  ok: z.boolean(),
  reason: z.string().nullable(),
  zapsAwarded: z.number().nullable(),
  offerTitle: z.string().nullable(),
})
export const nodeCaptureResponse = envelope(nodeCaptureView)

export const nearbyNodeView = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  radiusM: z.number(),
  distanceM: z.number(),
})
export const nearbyNodesResponse = envelope(z.object({ items: z.array(nearbyNodeView) }))

// ── The core loops (LIVE-716) ───────────────────────────────────────────────────────────────────
//
// Every list is a page: `{ items, nextCursor }`, with `nextCursor` null on the last page. A list
// whose reader has no cursor yet always answers null (one page), and gains one additively.

export function page<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() })
}

/** Another member, as every list shows them. */
export const peerView = z.object({
  id: z.string(),
  handle: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
})
export type PeerView = z.infer<typeof peerView>

// Feed: GET /api/v1/feed, POST /api/v1/feed/posts, POST /api/v1/feed/posts/{id}/reactions

export const feedQuery = z.object({
  sort: z.enum(['recent', 'relevant', 'popular']).default('relevant'),
  /** A Circle or channel id: that scope's posts only, as its own page shows them. */
  scope: z.uuid().optional(),
})
export const feedPostView = z.object({
  id: z.string(),
  body: z.string().nullable(),
  postType: z.string(),
  createdAt: z.string(),
  mediaUrls: z.array(z.string()),
  visibility: z.string().nullable(),
  scopeId: z.string().nullable(),
  isPinned: z.boolean(),
  reactionCount: z.number(),
  commentCount: z.number(),
  author: peerView,
  /** The reaction keys the caller has on this post. */
  myReactions: z.array(z.string()),
})
export type FeedPostView = z.infer<typeof feedPostView>
export const feedResponse = envelope(page(feedPostView))

export const postCreateInput = z.object({
  body: z.string().max(5000).optional(),
  scopeId: z.uuid(),
  visibility: z.enum(['public', 'group', 'cluster']).default('public'),
  postType: z.enum(['feed', 'note', 'announcement']).default('feed'),
  imageUrl: z.url().max(2000).optional(),
})
export const postCreateResponse = envelope(z.object({ posted: z.literal(true) }))

export const reactionInput = z.object({ reaction: z.string().min(1).max(32), active: z.boolean() })
export const reactionResponse = envelope(z.object({ active: z.boolean(), count: z.number() }))

// Circles: GET /api/v1/circles (mine), GET /api/v1/circles/{id}, POST/DELETE .../membership

export const circleView = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  about: z.string().nullable(),
  type: z.string(),
  memberCount: z.number(),
  status: z.string(),
  imageUrl: z.string().nullable(),
})
export type CircleView = z.infer<typeof circleView>
export const circlesResponse = envelope(page(circleView))
export const circleResponse = envelope(circleView)
export const membershipResponse = envelope(z.object({ member: z.boolean() }))

// Events: GET /api/v1/events, POST/DELETE /api/v1/events/{id}/rsvp, POST .../check-in

export const eventView = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  city: z.string().nullable(),
  circleId: z.string().nullable(),
  circleName: z.string().nullable(),
  priceCents: z.number().nullable(),
})
export type EventView = z.infer<typeof eventView>
export const eventsQuery = z.object({ slug: z.string().min(1).max(200).optional() })
export const eventsResponse = envelope(page(eventView))
export const eventResponse = envelope(eventView)

export const rsvpInput = z.object({ status: z.enum(['going', 'maybe', 'not_going']) })
export const rsvpView = z.object({
  /** going, waitlist, maybe or not_going; null when the caller has no RSVP row. */
  status: z.string().nullable(),
  /** pending while a host approval is outstanding. */
  approvalStatus: z.string().nullable(),
})
export const rsvpResponse = envelope(rsvpView)

export const checkInResponse = envelope(
  z.object({
    ok: z.boolean(),
    alreadyCheckedIn: z.boolean(),
    zapsAwarded: z.number(),
    reason: z.string().nullable(),
  }),
)

// Practices: GET /api/v1/practices (mine), GET /api/v1/practices/{id}, POST/DELETE .../log

export const practiceView = z.object({
  id: z.string(),
  slug: z.string().nullable(),
  title: z.string(),
  summary: z.string().nullable(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  headerImage: z.string().nullable(),
  cadence: z.string().nullable(),
  durationMin: z.number().nullable(),
  /** A practice with a timer is logged from inside its session, never with a one-tap log. */
  usesTimer: z.boolean(),
  timerKind: z.string(),
})
export type PracticeView = z.infer<typeof practiceView>
export const myPracticeView = practiceView.extend({
  loggedToday: z.boolean(),
  source: z.enum(['self', 'journey']),
  cue: z.string().nullable(),
})
export const myPracticesResponse = envelope(page(myPracticeView))
export const practiceResponse = envelope(practiceView)

export const practiceLogInput = z.object({
  circleId: z.uuid().nullable().optional(),
  /** The device's IANA zone, a fallback only: the profile's home zone wins (as on the web). */
  timezone: z.string().max(64).nullable().optional(),
})
export const practiceLogResponse = envelope(
  z.looseObject({ logged: z.boolean(), zapsAwarded: z.number().optional() }),
)
export const practiceUnlogResponse = envelope(z.looseObject({}))

// Messages: GET /api/v1/messages, GET/POST /api/v1/messages/{id}, GET/POST .../rooms/{id}

export const messagesSummaryView = z.object({
  totalUnread: z.number(),
  rooms: z.array(
    z.object({ id: z.string(), name: z.string(), visibility: z.string(), lastMessageAt: z.string().nullable(), unread: z.number() }),
  ),
  conversations: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullable(),
      participants: z.array(peerView),
      lastMessage: z.object({ body: z.string(), createdAt: z.string() }).nullable(),
      unread: z.number(),
    }),
  ),
})
export const messagesSummaryResponse = envelope(messagesSummaryView)

export const threadView = z.object({
  id: z.string(),
  title: z.string(),
  name: z.string().nullable(),
  participants: z.array(peerView),
  /** Oldest first, the newest 100. Reading the thread marks it read. */
  messages: z.array(z.object({ id: z.string(), senderId: z.string(), body: z.string(), createdAt: z.string() })),
})
export const threadResponse = envelope(threadView)

export const roomThreadView = z.object({
  id: z.string(),
  name: z.string(),
  visibility: z.string(),
  canPost: z.boolean(),
  messages: z.array(
    z.object({ id: z.string(), authorId: z.string(), body: z.string(), createdAt: z.string(), author: peerView.nullable() }),
  ),
})
export const roomThreadResponse = envelope(roomThreadView)

export const messageSendInput = z.object({ body: z.string().trim().min(1).max(4000) })
export const messageSendResponse = envelope(z.object({ sent: z.literal(true) }))

// Notifications: GET /api/v1/notifications, POST /api/v1/notifications/read

export const notificationView = z.object({
  id: z.string(),
  type: z.string(),
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  body: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
  actor: peerView.nullable(),
})
export const notificationsResponse = envelope(
  page(notificationView).extend({ unread: z.number().nullable() }),
)
export const notificationsReadResponse = envelope(z.object({ read: z.literal(true) }))

// Profile: GET/PATCH /api/v1/profile, GET /api/v1/profile/{handle}

export const profileView = z.object({
  id: z.string(),
  handle: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  headerImageUrl: z.string().nullable(),
  bio: z.string().nullable(),
  website: z.string().nullable(),
  city: z.string().nullable(),
  communityRole: z.string().nullable(),
  membershipTier: z.string().nullable(),
  createdAt: z.string().nullable(),
})
export type ProfileView = z.infer<typeof profileView>
export const profileResponse = envelope(profileView)

/** The fields Settings → Profile edits. A field left out keeps its stored value. */
export const profileEditInput = z.object({
  displayName: z.string().max(80).optional(),
  handle: z.string().max(40).optional(),
  bio: z.string().max(1000).optional(),
  website: z.string().max(200).optional(),
  city: z.string().max(120).optional(),
})

export const publicProfileView = profileView.omit({ city: true }).extend({ blockedByMe: z.boolean() })
export const publicProfileResponse = envelope(publicProfileView)
