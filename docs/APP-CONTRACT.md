# The app contract (`/api/v1`)

The versioned JSON API a native client calls. It exists for the Expo / React Native iOS app
(`DEF-MOBILE`, parked; the stack was ruled 2026-09-29), and the web may call it too. Decided in
[ADR-1643](DECISIONS.md) (`LIVE-715`). Which endpoints are built and which are still to come is
tracked in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json) (the WM rows `LIVE-715` to `LIVE-726`),
never in this file.

The code is the authority. This page explains it:

| Piece | File |
|---|---|
| Types and runtime schemas (shared with the app) | `lib/contract/index.ts` |
| Who is calling (bearer token or cookie) | `lib/contract/caller.ts` |
| The envelope on the wire, rate limit, input parsing | `lib/contract/respond.ts` |
| The bearer Supabase client | `lib/supabase/bearer.ts` |
| The worked example | `app/api/v1/me/route.ts` |

## 1. Shape of every response

Every body is the envelope. Both keys are always present and exactly one is non-null:

```json
{ "data": { "id": "…" }, "error": null }
{ "data": null, "error": { "code": "unauthorized", "message": "Sign in again: …" } }
```

Every response carries:

| Header | Value | Why |
|---|---|---|
| `Frequency-Contract` | `1` | The contract version that answered. |
| `Cache-Control` | `no-store, private` | Answers are per caller. A public endpoint may send its own. |
| `Vary` | `Authorization, Cookie` | For any cache that ignores the line above. |

A client branches on `error.code`, never on `error.message`. The message is written for a person
and may be reworded.

## 2. Auth

Two ways in, one caller out. Both resolve to the same `CallerProfile` the web's
`getCallerProfile()` returns, through the same mapping (`callerFromViewerRow` in `lib/auth.ts`).
There is no second auth system.

1. **`Authorization: Bearer <supabase access token>`** (the app). The app signs in with
   supabase-js, keeps the session in the device keychain, and sends the access token on every
   request. The server verifies it with Supabase Auth (`auth.getUser(token)`, a round trip, not a
   local decode) and reads the caller's row with that token under RLS. Refreshing the token is
   the app's job; the server never sees the refresh token.
2. **The web session cookie**, used only when there is no `Authorization` header.

Rules:

- A present `Authorization` header decides. A malformed, forged, expired or revoked token is a
  `401`, even if a valid cookie rides along.
- An Auth outage is `internal` (500), never `unauthorized`. An app answers `401` by discarding
  its session, and an outage is not a sign-out. On `401`, refresh once and retry; on a second
  `401`, sign out.
- A signed-in account with no Frequency profile is `profile_required`. Send the person through
  onboarding.
- The web's view-as preview (a cookie) never applies to a bearer caller.
- **CSRF.** A cookie-session request that is not `GET`, `HEAD` or `OPTIONS` must carry an
  `Origin` matching the host, or it is `forbidden`. A bearer request needs no such check, because
  nothing attaches a bearer token on a person's behalf.
- **The proxy does not run on `/api/v1`** (`proxy.ts` matcher). No marker cookies, no
  first-touch record, no redirects. The route reads and refreshes a web cookie session itself.
  The web's prefetch fuse only touches requests that carry `next-router-prefetch`, which an app
  never sends.

## 3. CORS: closed

No `/api/v1` response sends `Access-Control-Allow-*`. A native app is not a browser and needs
none. The web calls from its own origin. Opening CORS would only let other websites read a
signed-in member's answers. Do not add it.

## 4. Error codes

Stable within v1. A new code may be added; an existing code never changes its meaning or its
status. A client treats an unknown code as `internal`.

| Code | Status | Meaning |
|---|---|---|
| `unauthorized` | 401 | No valid credential: none, or a malformed, forged, expired or revoked token. |
| `profile_required` | 403 | Signed in, but the account has no Frequency profile yet. |
| `forbidden` | 403 | Signed in and not allowed, or a cookie write from another origin. |
| `not_found` | 404 | It does not exist, or the caller may not know that it does. |
| `invalid_input` | 400 | The body or query failed its schema. The message names the first bad field. |
| `conflict` | 409 | The write collides with the current state. |
| `rate_limited` | 429 | Too many requests. Wait for `Retry-After` seconds. |
| `update_required` | 426 | Reserved. Today `GET /api/v1/app-config` answers `updateRequired: true` for a build below the minimum. |
| `internal` | 500 | The server failed. Retry a read; retry a write only if it is idempotent. |

## 5. Rate limits

Every route calls `rateLimited(request, '<endpoint>')` first, before any credential work, so a
stream of forged tokens cannot buy an Auth round trip each. It uses the existing limiter
(`lib/rate-limit.ts`): 300 requests a minute per address per endpoint by default, generous because
many phones share one carrier address. With no limiter configured in a deployment it allows
(denying would switch the whole app off at once); `/api/status` reports whether it is wired. A
write that needs a tighter per-person budget adds its own call after `authorizeCaller`.

## 6. Adding an endpoint

1. Put the logic in `lib/`, as one function the web's server action and the route both call. The
   action becomes a thin wrapper. Never implement a thing twice.
2. Add the response type and its zod schema to `lib/contract/index.ts`. It imports `zod` only:
   no `next/*`, no `@/lib/*`, no `server-only`. The app compiles against this file.
3. Write `app/api/v1/<name>/route.ts` in the order `app/api/v1/me/route.ts` uses: `rateLimited`,
   then `authorizeCaller` (a public endpoint says so in its comment instead), then `readInput` for
   any body or query (it runs the repo's `parseInput`), then `ok` or `fail`. Catch with `failFrom`
   so an unexpected error is `internal` with no detail.
4. Re-check authorization on the server for every write (`docs/CAPABILITIES-AND-MOBILE.md` §3).
   What the app was shown is never permission.
5. Test a signed-out `401`, a bearer caller, and one refusal. Parse every body with the endpoint's
   envelope schema.
6. Add the endpoint to the list below.

Lists page with a cursor: `?cursor=<opaque>&limit=<n>` in, `{ items, nextCursor }` out, where
`nextCursor` is `null` on the last page. The cursor is opaque to the client.

### Reusing lib code as the caller

A route that calls an existing lib function wraps it in `asCaller(auth, fn)` (`lib/contract/caller.ts`).
On the bearer path it binds the verified token for that call tree (`lib/supabase/request-identity.ts`),
so `createClient()` returns the bearer client and `getCachedUser()` returns the verified user: every
reader, gate and capability loader built on them sees the app's caller as the web sees the cookie's,
under the same RLS. On the cookie path it is a plain call. View-as never applies inside it.

## 7. Versioning and deprecation

- **Additive only within v1.** A new endpoint, a new optional field, a new error code. A client
  ignores fields it does not know.
- **Breaking means v2.** Removing or renaming a field, changing a type or a status, or tightening
  an input is a new `/api/v2/...` route beside the v1 one. Both run.
- **A v1 route retires only when no supported build calls it.** The minimum supported app version
  (`LIVE-722`, app config) moves past every build that uses it first. Until then it stays.
- A retirement is an ADR naming the route, the build that last used it, and the date.

## 8. Endpoints

| Method and path | Auth | Returns |
|---|---|---|
| `GET /api/v1/me` | bearer or cookie | `MeView`: the caller's id, handle, display name, avatar, community role and level, staff role, tier, and which credential was used. |
| `GET /api/v1/capabilities?kind=&id=` | bearer or cookie | `CapabilitiesView`: the caller's capability names on one scope (global, Circle, Hub, Nexus, event, practice, Journey, profile, Space). Display only; every write re-checks. |
| `GET /api/v1/account` | bearer or cookie | `AccountView`: the paid Spaces deleting the account would end, so the app warns first. |
| `DELETE /api/v1/account` | bearer or cookie | Body `{ "confirm": "DELETE" }`. Erases the caller's own account (App Store 5.1.1(v)) through the web's `deleteMyAccount`. Refused inside a staff act-as. |
| `GET /api/v1/account/export` | bearer or cookie | The member data export, the same object the web's "Download my data" builds. 5 per 10 minutes. |
| `GET /api/v1/app-config?platform=&version=` | public | `AppConfigView`: the minimum supported and latest version for the platform (`platform_settings` rows `app_min_supported_version_<platform>` and `app_latest_version_<platform>`), `updateRequired` for the reporting build, and the client-safe flags. Cached 5 minutes. |
| `POST /api/v1/session/bootstrap` | bearer | `SessionBootstrapView`: the caller's `MeView` plus `seatLanding` / `orderLanding`, after running the web's post-sign-in claims (guest seats, leads, tickets, orders). Idempotent: call after sign-in and on every cold start. |
| `POST /api/v1/nodes/{id}/capture` | bearer or cookie | Body `{ secret?, location?, attestation? }`. Runs the web's `captureNode` (window, signed code, proximity, capacity, exactly-once ledger, zaps). A refusal is `ok: false` with the verifier's reason. |
| `GET /api/v1/nodes/nearby?lat=&lng=&radius=` | bearer or cookie | `{ items }`: live nodes to register geofences for, nearest first, at most 20 within 5 km. Never a secret; a Ghost node's point is rounded to about 110 m. |
| `POST /api/v1/reports` | bearer or cookie | Report `{ targetType, targetId, reason, details? }` through the web's `reportContent`. A repeat report is `conflict`. |
| `POST` / `DELETE /api/v1/blocks` | bearer or cookie | Block or unblock `{ profileId }` as the caller (`lib/blocking.ts`). |

The rest of the app's surface (feed, Circles, events, practices, messages, notifications, the
capability projection, native sign-in, account deletion and export, push devices, capture and
nearby nodes, app config, report and block, in-app purchase) is filed as its own WM row in the
backlog.

## 9. Environment

`/api/v1` needs nothing new. It reads `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (the bearer client) and the limiter's `KV_REST_API_URL` /
`KV_REST_API_TOKEN`. The app readiness rows add their own names here when they ship.

| Name | Row | What it does |
|---|---|---|
| `APPLE_TEAM_ID` | `LIVE-714` | The Apple team id in `/.well-known/apple-app-site-association` (app/.well-known/). Unset, the file claims no app. |
| `ANDROID_SHA256_FINGERPRINTS` | `LIVE-714` | Comma-separated signing-cert fingerprints for `/.well-known/assetlinks.json`. Unset, an empty list. |

## 11. Native sign-in

The app signs in with supabase-js (email OTP or magic link, Google OAuth; Sign in with Apple comes
with the app, `LIVE-725`) and exchanges the PKCE code itself. It never reaches the web's
`/auth/callback`, so it calls **`POST /api/v1/session/bootstrap`** right after sign-in. That runs
the same post-sign-in step as the callback (`lib/auth/post-sign-in.ts`), so a ticket or an RSVP
made as a guest shows up in the app.

**Redirect URLs.** The app passes one of these as `emailRedirectTo` / `redirectTo`:

| URL | When |
|---|---|
| `frequency://auth/callback` | The app's own scheme, for OAuth in an in-app browser session. |
| `https://frequencylocal.com/auth/native` | Magic links. With the app installed, iOS opens the app (the path is claimed in the association file). Without it, the web route forwards the code to `/auth/callback` and the person is signed in on the web. |

Both must be on the Supabase Auth redirect allow-list (dashboard config, an owner step when the
app is built, `OWN-091`).

**Token refresh.** supabase-js holds the session: `persistSession: true` with the device keychain
(Expo SecureStore) as storage, and `autoRefreshToken: true` while the app is in the foreground
(start and stop it on app state changes). The server never sees the refresh token. On a `401` the
app refreshes once and retries; a second `401` signs out (§2).

## 12. QR, NFC and geofence capture

A QR code and an NFC tag carry the same thing: the `/n/<nodeId>?s=<signed code>` link (an NDEF URI
record on a tag). The app reads the id and the `s` value and posts them to
`/api/v1/nodes/{id}/capture` with the device location when it has one. A geofence entry posts with
no secret and the location. The server decides; the device is never trusted.

`attestation` (App Attest on iOS, Play Integrity on Android) is accepted and not yet verified.
Verifying it needs the app build and parks with `DEF-MOBILE`.
