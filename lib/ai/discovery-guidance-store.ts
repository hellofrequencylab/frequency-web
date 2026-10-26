import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchPinned } from '@/lib/net/pinned-fetch'
import { parseGuidanceWatchState, type GuidanceWatchState } from './discovery-guidance-watch'

const KEY = 'official_discovery_guidance_watch_v1'
/** authz-delegated: only the strict-secret cron calls this global operational store.
 * Existing service-role-only platform text setting; no tenant/user rows or document bodies. */
export function guidanceWatchDependencies(exhausted: () => boolean) {
  return {
    exhausted,
    async read() {
      const { data, error } = await createAdminClient().from('platform_settings').select('value').eq('key', KEY).maybeSingle()
      if (error) throw new Error('Guidance state unavailable')
      return parseGuidanceWatchState(data?.value ?? null)
    },
    async write(state: GuidanceWatchState) {
      const { error } = await createAdminClient().from('platform_settings').upsert({ key: KEY, value: JSON.stringify(state), updated_at: new Date().toISOString() })
      if (error) throw new Error('Guidance state could not be saved')
    },
    fetch: (url: string) => fetchPinned(url, {
      maxBytes: 524_288, timeoutMs: 8_000, maxRedirects: 0,
      headers: { accept: 'text/html', 'user-agent': 'FrequencyOfficialGuidanceWatch/1.0' },
      accept: (status, headers) => status === 200 && /^text\/html(?:;|$)/i.test(headers['content-type'] ?? ''),
    }),
  }
}
