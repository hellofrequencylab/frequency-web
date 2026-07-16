// Rate limiting (P8 security) — sliding-window limits on abuse-prone public endpoints,
// backed by Upstash Redis. Server-only.
//
// The Vercel↔Upstash integration injects the creds as KV_REST_API_URL / KV_REST_API_TOKEN
// (Vercel's KV naming), not the SDK's default UPSTASH_* — so we build the client from
// those explicitly. When they're absent in dev/test/preview the limiter NO-OPS (allows
// everything) so nothing breaks; in PRODUCTION an absent limiter FAILS CLOSED (denies) so a
// missing integration can't silently unthrottle public endpoints. A Redis hiccup at runtime
// still FAILS OPEN — rate limiting must never take the site down.

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

type Window = Parameters<typeof Ratelimit.slidingWindow>[1]

const url = process.env.KV_REST_API_URL
const token = process.env.KV_REST_API_TOKEN
const redis = url && token ? new Redis({ url, token }) : null

// Are we running in a real production deployment? If so, an UNCONFIGURED limiter must FAIL CLOSED
// (deny) rather than silently no-op — a missing Upstash integration in prod would otherwise leave
// abuse-prone public endpoints wide open. In dev/test/preview we still no-op so local flows work.
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'

// One Ratelimit per (limit, window) config — reused across requests.
const limiters = new Map<string, Ratelimit>()
function limiterFor(limit: number, window: Window): Ratelimit | null {
  if (!redis) return null
  const key = `${limit}:${window}`
  let rl = limiters.get(key)
  if (!rl) {
    rl = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(limit, window), prefix: 'rl', analytics: false })
    limiters.set(key, rl)
  }
  return rl
}

/** The caller's IP (Vercel sets x-forwarded-for / x-real-ip). Falls back to a constant so
 *  the limiter still applies a shared bucket rather than failing. */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  return xff?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

/** 429 JSON for a rate-limited request. */
export function tooMany(): Response {
  return new Response(JSON.stringify({ error: 'rate_limited' }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': '30' },
  })
}

/**
 * Is this request within the limit? `true` = allowed. Scoped by `bucket` (the endpoint
 * name) + `id` (usually the IP), so each endpoint has its own window. When Upstash isn't
 * configured it FAILS CLOSED in production (deny) so a missing integration can't leave public
 * endpoints unthrottled, but no-ops to `true` in dev/test/preview. Still fails OPEN on a Redis
 * error at runtime — a transient KV hiccup must never take the site down.
 */
export async function rateLimitOk(bucket: string, id: string, limit: number, window: Window): Promise<boolean> {
  const rl = limiterFor(limit, window)
  if (!rl) return !IS_PRODUCTION
  try {
    const { success } = await rl.limit(`${bucket}:${id}`)
    return success
  } catch {
    return true
  }
}
