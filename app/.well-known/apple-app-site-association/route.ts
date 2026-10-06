// GET /.well-known/apple-app-site-association (LIVE-714): iOS universal links and shared web
// credentials. Apple fetches this through its CDN with no cookies and needs a plain 200 served as
// application/json with no redirect. proxy.ts does not run on /.well-known, so no session refresh
// or first-touch cookie rides along.
//
// THE TEAM ID COMES FROM APPLE_TEAM_ID: with it unset (or not the 10-character shape Apple issues)
// the file claims nothing, instead of a placeholder app id Apple's CDN would cache for this domain.
//
// PATHS ARE ROUTES THAT EXIST, each a member page a shared link lands on. The broadcast path was claimed
// until LIVE-714 and has no route, so the app would have opened on a dead screen.

export const dynamic = 'force-dynamic'

/** The iOS bundle id the app ships under (DEF-MOBILE). */
const APP_BUNDLE_ID = 'com.frequency.app'

/** The member paths a universal link may open in the app. */
const APP_LINK_PATHS = [
  '/feed',
  '/circles/*',
  '/events/*',
  '/people/*',
  '/messages/*',
  '/join/*',
  '/n/*',
  '/q/*',
  '/spaces/*',
  '/practices/*',
  // The native sign-in return (LIVE-718): a magic link opened on the phone lands in the app.
  '/auth/native',
]

const TEAM_ID_SHAPE = /^[A-Z0-9]{10}$/

/** The association body for an environment. */
function appleAssociation(env: Record<string, string | undefined> = process.env) {
  const team = env.APPLE_TEAM_ID?.trim() ?? ''
  const appID = TEAM_ID_SHAPE.test(team) ? `${team}.${APP_BUNDLE_ID}` : null
  return {
    applinks: { apps: [], details: appID ? [{ appID, paths: APP_LINK_PATHS }] : [] },
    webcredentials: { apps: appID ? [appID] : [] },
  }
}

export function GET() {
  return new Response(JSON.stringify(appleAssociation()), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
  })
}
