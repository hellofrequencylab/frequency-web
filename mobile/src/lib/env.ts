import { SITE_HOST } from './node-link'

// Runtime settings, from EXPO_PUBLIC_* (inlined at bundle time; see mobile/.env.example). All public:
// the Supabase anon key is the same one the website ships to every browser. The device remote needs
// none of this; only the Frequency tab (sign-in, Rewards, check-in, push) does.

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

/** Hosts whose /n/ links count as check-ins: the site, plus the API's own host, so a link copied from
 *  a local or preview deployment (the one this build talks to) is accepted too. */
export const CHECKIN_HOSTS: readonly string[] = [
  SITE_HOST,
  ...(env.apiUrl ? [env.apiUrl.replace(/^[a-z]+:\/\//i, '').replace(/[/].*$/, '').toLowerCase()] : []),
]
