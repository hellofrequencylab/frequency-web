// Rate limiting (P8 security) — sliding-window limits on abuse-prone public endpoints,
// backed by Upstash Redis. Server-only.
//
// The Vercel↔Upstash integration injects the creds as KV_REST_API_URL / KV_REST_API_TOKEN
// (Vercel's KV naming), not the SDK's default UPSTASH_* — so we build the client from
// those explicitly. When they're absent (local dev / a preview without the integration),
// the limiter NO-OPS (allows everything) so nothing breaks; and a Redis hiccup FAILS OPEN
// for the same reason — rate limiting must never take the site down.

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

type Window = Parameters<typeof Ratelimit.slidingWindow>[1]

const url = process.env.KV_REST_API_URL
const token = process.env.KV_REST_API_TOKEN
const redis = url && token ? new Redis({ url, token }) : null

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
 * name) + `id` (usually the IP), so each endpoint has its own window. No-ops to `true`
 * when Upstash isn't configured, and fails open on any Redis error.
 */
export async function rateLimitOk(bucket: string, id: string, limit: number, window: Window): Promise<boolean> {
  const rl = limiterFor(limit, window)
  if (!rl) return true
  try {
    const { success } = await rl.limit(`${bucket}:${id}`)
    return success
  } catch {
    return true
  }
}
