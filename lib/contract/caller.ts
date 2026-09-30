import 'server-only'
import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js'
import {
  VIEWER_PROFILE_COLUMNS,
  callerFromViewerRow,
  getCachedUser,
  getCachedViewerProfile,
  getCallerProfile,
  toCallerProfile,
  type CallerProfile,
  type CommunityRole,
  type ViewerProfileRow,
} from '@/lib/auth'
import { createBearerClient } from '@/lib/supabase/bearer'
import type { ContractErrorCode, MeView } from '@/lib/contract'

// WHO IS CALLING /api/v1 (LIVE-715, ADR-1643). Two ways in, one caller out.
//
//   · `Authorization: Bearer <supabase access token>`: the native app. The token is verified by
//     Supabase Auth (`auth.getUser(token)`, a GET /auth/v1/user round trip, never a local decode),
//     and the caller's own profile row is read with that token under RLS. No cookie is read.
//   · The web's session cookie, when there is no Authorization header: the same getCallerProfile()
//     every server action uses, so a page that fetches /api/v1 sees exactly what it would render.
//
// Both land on the SAME CallerProfile, built by the same pure mapping (lib/auth.ts
// `callerFromViewerRow`). There is no second auth system and no second role mapping.
//
// RULES THAT ARE EASY TO GET WRONG, each tested in caller.test.ts:
//   1. A PRESENT Authorization header decides. A malformed, forged or expired token is a 401 even
//      when a valid cookie rides along. Falling back to the cookie would let a request authenticate
//      as someone other than the credential it names.
//   2. An Auth outage is not a sign-out. A network failure or 5xx from Supabase Auth is `internal`
//      (500), never `unauthorized`, because an app answers 401 by discarding its session.
//   3. A cookie write must come from this site. A browser attaches the cookie to any request, so a
//      non-GET on the cookie path needs an Origin matching the host (the CSRF rule the route
//      handlers never had, since server actions carry their own). A bearer write needs no such
//      check: nothing attaches a bearer token on a person's behalf.
//   4. View-as never applies to a bearer caller. It is a web cookie and a downgrade-only preview;
//      a bearer caller gets their real role.

export type AuthVia = 'bearer' | 'cookie'

export interface ApiCaller {
  ok: true
  via: AuthVia
  /** The same object getCallerProfile() returns on the web for this person. */
  caller: CallerProfile
  /** The caller's own profile row (the shared viewer columns), read under RLS. */
  profile: ViewerProfileRow
}

export interface ApiAuthFailure {
  ok: false
  code: ContractErrorCode
  message: string
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** A Supabase access token is a JWT: three base64url segments. Anything else is not one. */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
/** Far above a real access token (about 1 KB with custom claims); bounds what is forwarded. */
const MAX_TOKEN_LENGTH = 8192

/**
 * Read the Authorization header. `null` = no header at all (use the cookie). `{ token: null }` = a
 * header is present but is not a well-formed bearer JWT (a 401, rule 1).
 */
export function readBearer(header: string | null): { token: string | null } | null {
  if (header === null || header.trim() === '') return null
  const m = /^Bearer[ ]+(\S+)[ ]*$/i.exec(header.trim())
  const token = m?.[1] ?? null
  if (!token || token.length > MAX_TOKEN_LENGTH || !JWT_SHAPE.test(token)) return { token: null }
  return { token }
}

/** Is this cookie-session request from our own origin? (Rule 3.) */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function failure(code: ContractErrorCode, message: string): ApiAuthFailure {
  return { ok: false, code, message }
}

const UNAUTHORIZED = 'Sign in again: there is no valid session on this request.'
const PROFILE_REQUIRED = 'This account has no Frequency profile yet. Finish onboarding first.'

async function bearerCaller(token: string): Promise<ApiCaller | ApiAuthFailure> {
  const supabase = createBearerClient(token)
  const { data, error } = await supabase.auth.getUser(token)
  if (error) {
    // Rule 2: only Auth's own refusal (a 4xx about the token) means "not signed in".
    const refused = isAuthApiError(error) && (error.status ?? 0) >= 400 && (error.status ?? 0) < 500
    if (!refused || isAuthRetryableFetchError(error)) {
      return failure('internal', 'Could not verify the session right now. Try again.')
    }
    return failure('unauthorized', UNAUTHORIZED)
  }
  if (!data.user) return failure('unauthorized', UNAUTHORIZED)

  const { data: row, error: rowError } = await supabase
    .from('profiles')
    .select(VIEWER_PROFILE_COLUMNS)
    .eq('auth_user_id', data.user.id)
    .maybeSingle()
  if (rowError) return failure('internal', 'Could not read the profile right now. Try again.')
  if (!row) return failure('profile_required', PROFILE_REQUIRED)
  const profile = row as ViewerProfileRow
  // Rule 4: the real role. callerFromViewerRow is the web's mapping, unchanged.
  const realRole = (profile.community_role ?? 'member') as CommunityRole
  return { ok: true, via: 'bearer', caller: toCallerProfile(callerFromViewerRow(profile, realRole)), profile }
}

async function cookieCaller(request: Request): Promise<ApiCaller | ApiAuthFailure> {
  if (!SAFE_METHODS.has(request.method.toUpperCase()) && !sameOrigin(request)) {
    return failure('forbidden', 'A signed-in write from the browser must come from this site.')
  }
  // All three are request-cached in lib/auth: one getUser and one profiles read between them.
  const caller = await getCallerProfile()
  const profile = await getCachedViewerProfile()
  if (!caller || !profile) {
    return (await getCachedUser()) ? failure('profile_required', PROFILE_REQUIRED) : failure('unauthorized', UNAUTHORIZED)
  }
  return { ok: true, via: 'cookie', caller, profile }
}

/**
 * Establish the /api/v1 caller from a bearer token or the web cookie. Never throws: any failure,
 * including an unexpected one, comes back as `{ ok: false, code, message }` for the route to send.
 */
export async function authorizeCaller(request: Request): Promise<ApiCaller | ApiAuthFailure> {
  try {
    const bearer = readBearer(request.headers.get('authorization'))
    if (bearer) {
      if (!bearer.token) return failure('unauthorized', 'The Authorization header must be "Bearer <access token>".')
      return await bearerCaller(bearer.token)
    }
    return await cookieCaller(request)
  } catch {
    return failure('internal', 'Could not verify the session right now. Try again.')
  }
}

/** GET /api/v1/me: the caller's own profile summary. */
export function toMeView(auth: ApiCaller): MeView {
  return {
    id: auth.caller.id,
    handle: auth.profile.handle ?? null,
    displayName: auth.profile.display_name ?? null,
    avatarUrl: auth.profile.avatar_url ?? null,
    communityRole: auth.caller.community_role,
    communityLevel: auth.caller.communityLevel,
    webRole: auth.caller.webRole,
    membershipTier: auth.caller.membershipTier,
    auth: auth.via,
  }
}
