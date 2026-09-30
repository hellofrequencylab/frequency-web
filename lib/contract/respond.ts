import 'server-only'
import {
  CONTRACT_HEADER,
  CONTRACT_VERSION,
  ERROR_STATUS,
  type ContractErrorCode,
  type Envelope,
} from '@/lib/contract'
import { parseInput, type z } from '@/lib/validation'
import { clientIp, rateLimitOk } from '@/lib/rate-limit'

// THE WIRE HALF OF THE CONTRACT (LIVE-715, ADR-1643). Every /api/v1 route answers through `ok` or
// `fail`, so every response carries the same envelope and the same headers:
//
//   · `Frequency-Contract: 1`, the version that answered.
//   · `Cache-Control: no-store, private`. These answers are per-caller; a shared cache must never
//     hold one. An endpoint that is genuinely public and cacheable (LIVE-722's app config) passes
//     its own Cache-Control.
//   · `Vary: Authorization, Cookie`, for any cache that ignores the line above.
//
// NO CORS HEADERS, on purpose. A native app is not a browser and does not send a preflight, so it
// needs none; and the web calls these routes from its own origin. Opening CORS would only let other
// websites read a signed-in member's answers. docs/APP-CONTRACT.md says so.

const DEFAULT_MESSAGE: Record<ContractErrorCode, string> = {
  unauthorized: 'Sign in again: there is no valid session on this request.',
  profile_required: 'This account has no Frequency profile yet. Finish onboarding first.',
  forbidden: 'You cannot do that here.',
  not_found: 'That could not be found.',
  invalid_input: 'The request is not in the expected shape.',
  conflict: 'That conflicts with what is already there.',
  rate_limited: 'Too many requests. Wait a moment and try again.',
  update_required: 'This version of the app is no longer supported. Update to keep going.',
  internal: 'Something went wrong on our side. Try again.',
}

function headers(extra?: HeadersInit): Headers {
  const h = new Headers({
    'content-type': 'application/json; charset=utf-8',
    [CONTRACT_HEADER]: String(CONTRACT_VERSION),
    'cache-control': 'no-store, private',
    vary: 'Authorization, Cookie',
  })
  if (extra) new Headers(extra).forEach((v, k) => h.set(k, v))
  return h
}

/** A success: `{ data, error: null }`, 200 unless told otherwise. */
export function ok<T>(data: T, init: { status?: number; headers?: HeadersInit } = {}): Response {
  const body: Envelope<T> = { data, error: null }
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers: headers(init.headers) })
}

/** A failure: `{ data: null, error: { code, message } }`, with the status the code travels with. */
export function fail(code: ContractErrorCode, message?: string, init: { headers?: HeadersInit } = {}): Response {
  const body: Envelope<never> = { data: null, error: { code, message: message || DEFAULT_MESSAGE[code] } }
  return new Response(JSON.stringify(body), { status: ERROR_STATUS[code], headers: headers(init.headers) })
}

/** Thrown by `readInput` (and by any lib step that wants a specific code); `failFrom` sends it. */
export class ContractFailure extends Error {
  constructor(
    readonly code: ContractErrorCode,
    message?: string,
  ) {
    super(message || DEFAULT_MESSAGE[code])
    this.name = 'ContractFailure'
  }
}

/**
 * Parse a request body or query with the repo's one parse seam (lib/validation.ts `parseInput`,
 * ADR-246), turning its throw into `invalid_input` with the first bad field named.
 */
export function readInput<T>(schema: z.ZodType<T>, input: unknown): T {
  try {
    return parseInput(schema, input)
  } catch (e) {
    throw new ContractFailure('invalid_input', e instanceof Error ? e.message : undefined)
  }
}

/** Send a caught error: a ContractFailure as its own code, anything else as `internal` (no detail). */
export function failFrom(error: unknown): Response {
  if (error instanceof ContractFailure) return fail(error.code, error.message)
  return fail('internal')
}

/**
 * The /api/v1 rate limit, through the existing limiter (lib/rate-limit.ts). Keyed by address and
 * applied BEFORE the caller is established, because verifying a bearer token is itself a round
 * trip to Supabase Auth, and a stream of forged tokens must not buy one each.
 *
 * `whenUnconfigured: 'allow'`: with no Upstash in a deployment, denying would switch off the whole
 * app at once (every screen is an /api/v1 call), which is the lockout failure, not the abuse one
 * (lib/rate-limit.ts `UnconfiguredPolicy`). /api/status already reports whether the limiter is wired.
 *
 * The default budget is generous on purpose: many phones share one carrier address (CGNAT). A
 * write endpoint that needs a tighter, per-person budget adds its own call after authorizeCaller.
 */
export async function rateLimited(
  request: Request,
  endpoint: string,
  { limit = 300, window = '1 m' }: { limit?: number; window?: Parameters<typeof rateLimitOk>[3] } = {},
): Promise<Response | null> {
  const allowed = await rateLimitOk(`v1:${endpoint}`, clientIp(request), limit, window, { whenUnconfigured: 'allow' })
  return allowed ? null : fail('rate_limited', undefined, { headers: { 'retry-after': '30' } })
}
