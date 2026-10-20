// Runtime settings, from EXPO_PUBLIC_* (inlined at bundle time; see mobile/.env.example). All public.

function clean(v: string | undefined): string | null {
  const t = (v ?? '').trim().replace(/\/+$/, '')
  return t.length ? t : null
}

export const env = {
  apiUrl: clean(process.env.EXPO_PUBLIC_API_URL),
  supabaseUrl: clean(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: clean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
}

/** True when the member half can run. The device half works without any of this. */
export const memberConfigured = !!(env.apiUrl && env.supabaseUrl && env.supabaseAnonKey)

/** The site host whose /n/ links are check-ins (app.config.ts `extra.webHost`). */
export const WEB_HOST = 'frequencylocal.com'

/** Hosts whose /n/ links count as check-ins: the site, plus the API's own host, so a link copied from
 *  a local or preview deployment (the one this build talks to) is accepted too. */
export const CHECKIN_HOSTS: readonly string[] = [WEB_HOST, ...(env.apiUrl ? [env.apiUrl.replace(/^[a-z]+:\/\//i, '').replace(/[/:].*$/, '').toLowerCase()] : [])]
