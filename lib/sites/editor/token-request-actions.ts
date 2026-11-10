'use server'
import { authorizeWebsiteEditor } from './authorization'
import { requestThemeTokens, type TokenRequestResult } from '@/lib/sites/token-request'

/** Ask the team for a theme token (D-1: no raw CSS). Runs behind the website editor pass; dark until
 *  SITE_TOKEN_REQUESTS_ENABLED is on. */
export async function requestWebsiteThemeTokens(
  host: string,
  requests: { token?: unknown; want?: unknown; why?: unknown }[],
): Promise<TokenRequestResult> {
  const auth = await authorizeWebsiteEditor(host)
  if (!auth) return { ok: false, error: 'Your editing session ended. Reopen the builder to send a request.' }
  const theme = typeof auth.preferences?.websiteTheme === 'string' ? auth.preferences.websiteTheme : 'unknown'
  return requestThemeTokens({ profileId: auth.profileId, spaceId: auth.space.id, spaceName: auth.space.name, theme, requests: Array.isArray(requests) ? requests : [] })
}
