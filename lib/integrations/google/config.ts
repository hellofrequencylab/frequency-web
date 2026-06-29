// Google contacts import — environment + endpoint config (ADR-374). The whole feature stays inert
// until BOTH GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are present (the same OAuth client
// that powers Supabase Google sign-in, with the two import redirect URIs added). Reads env at call
// time (never at module load) so an unset key never crashes an unrelated page — mirrors lib/billing
// /stripe.ts and lib/ai/client.ts. Server-only by use (the routes import it).

/** The only scope the import requests: read-only access to the member's own Google contacts. */
export const GOOGLE_CONTACTS_SCOPE = 'https://www.googleapis.com/auth/contacts.readonly'

/** The client id of the shared "Frequency Web" OAuth client, or null when unset. */
export function googleClientId(): string | null {
  return process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || null
}

/** The client secret, or null when unset. Never sent to the browser. */
export function googleClientSecret(): string | null {
  return process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || null
}

/** Is the import wired up? Both halves of the OAuth credential must be present. When false, the
 *  routes no-op (redirect back with ?import=unavailable) and the UI hides the button. */
export function googleImportConfigured(): boolean {
  return !!(googleClientId() && googleClientSecret())
}

/** The redirect URI for a given request origin. MUST byte-match a URI registered on the Google client
 *  (`https://frequencylocal.com/api/integrations/google/callback` in prod,
 *  `http://localhost:3000/api/integrations/google/callback` in dev). Derived from the live request
 *  origin so the value used at /start and at /callback is always identical (Google requires that). */
export function googleRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/integrations/google/callback`
}
