import { createHash } from 'node:crypto'
import { getCallerProfile } from '@/lib/auth'
import { deferHuntEvent, reasonClass } from '@/lib/hunts/analytics'
import { claimAsPlayer, loadScanPlacement } from '@/lib/hunts/claim-store'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { isCrawler, resolvePlacement } from '@/lib/hunts/placement'
import { appOrigin } from '@/lib/sites/host'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ code: string }> }

const privateHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
const notFound = () => new Response('Not found.', { status: 404, headers: privateHeaders })
const redirect = (url: URL, status: 302 | 303) =>
  new Response(null, { status, headers: { ...privateHeaders, Location: url.href } })

function configuredOrigin(value: string | undefined): URL | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    return url.pathname === '/' && !url.search && !url.hash ? url : null
  } catch {
    return null
  }
}

/** Trust exact configured origins, never a forwarded host or an arbitrary Vercel domain. */
function scanOrigin(requestOrigin: string): URL | null {
  const app = configuredOrigin(process.env.NEXT_PUBLIC_APP_URL)
  if (app?.origin === requestOrigin) return app
  if (process.env.VERCEL_ENV === 'preview') {
    for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
      const preview = host && configuredOrigin(`https://${host}`)
      if (preview && preview.origin === requestOrigin) return preview
    }
  }
  return configuredOrigin(appOrigin())
}

export async function GET(request: Request, { params }: Context) {
  if (!huntSwitchOn('claims')) return notFound()

  const requestUrl = new URL(request.url)
  const origin = scanOrigin(requestUrl.origin)
  if (!origin) return notFound()

  const { code } = await params
  const placement = await loadScanPlacement({ code })
  const scanPath = `/hunts/p/${encodeURIComponent(code)}`
  const resolution = resolvePlacement({
    placement,
    canonicalHost: origin.host,
    requestHost: requestUrl.host,
    path: scanPath,
    userAgent: request.headers.get('user-agent'),
  })
  if (resolution.kind === 'refuse' || !placement?.huntSlug) return notFound()
  if (resolution.kind === 'redirect' || requestUrl.origin !== origin.origin) {
    return redirect(new URL(scanPath, origin), 302)
  }

  const landing = new URL(`/play/${encodeURIComponent(placement.huntSlug)}`, origin)
  const caller = resolution.canClaim ? await getCallerProfile() : null
  if (caller) landing.searchParams.set('p', code)
  // FH-025: a person's scan is counted (never a crawler's), with no code and no placement on the event.
  // A signed-out scan stays first-party unless guest forwarding is switched on.
  if (resolution.canClaim) {
    deferHuntEvent({ event: 'hunt.placement_scan', actorProfileId: caller?.id ?? null, props: { hunt_id: placement.huntId, reason_class: 'opened' } })
  }
  return redirect(landing, 302)
}

/**
 * The confirm form: one `token`, and (FH-042S) at most one `answer` for a Mystery stop. Any other field,
 * or a repeat, refuses the form before any lookup.
 */
async function readForm(request: Request): Promise<{ token: string; answer?: string } | null> {
  try {
    const fields = [...(await request.formData()).entries()]
    const tokens = fields.filter(([name]) => name === 'token')
    const answers = fields.filter(([name]) => name === 'answer')
    if (tokens.length !== 1 || answers.length > 1 || tokens.length + answers.length !== fields.length) return null
    const token = tokens[0][1]
    const answer = answers[0]?.[1]
    if (typeof token !== 'string' || token.length === 0 || token.length > 2000) return null
    if (answer !== undefined && (typeof answer !== 'string' || answer.length > 200)) return null
    return { token, ...(typeof answer === 'string' && answer.trim() ? { answer: answer.trim() } : {}) }
  } catch {
    return null
  }
}

export async function POST(request: Request, { params }: Context) {
  if (!huntSwitchOn('claims')) return notFound()

  const requestOrigin = new URL(request.url).origin
  const origin = scanOrigin(requestOrigin)
  if (origin?.origin !== requestOrigin || request.headers.get('origin') !== requestOrigin || isCrawler(request.headers.get('user-agent'))) {
    return new Response('Open the Trail to confirm this stop.', { status: 403, headers: privateHeaders })
  }

  const caller = await getCallerProfile()
  if (!caller) return new Response('Sign in to confirm this stop.', { status: 401, headers: privateHeaders })
  const form = await readForm(request)
  if (!form) return new Response('Open the stop and try again.', { status: 400, headers: privateHeaders })

  const { code } = await params
  const placement = await loadScanPlacement({ code })
  if (!placement?.huntSlug || placement.revokedAt) return notFound()

  const outcome = await claimAsPlayer(caller.id, {
    placementId: placement.id,
    token: form.token,
    idempotencyKey: createHash('sha256').update(form.token).digest('hex'),
    nowEpoch: Math.floor(Date.now() / 1000),
    // FH-042S: a Mystery guess, judged on the server against the stored hash. Ignored at any other stop.
    ...(form.answer ? { answer: form.answer } : {}),
  })
  deferHuntEvent({
    event: 'hunt.stop_claim',
    actorProfileId: caller.id,
    props: { hunt_id: placement.huntId, assurance: 'signed_node', reason_class: reasonClass(outcome.ok ? outcome.result : outcome.reason), replayed: outcome.ok && outcome.replayed },
  })
  const landing = new URL(`/play/${encodeURIComponent(placement.huntSlug)}`, origin)
  const result = outcome.ok ? outcome.result : null
  // FH-042S: a Mystery that wants an answer lands back on the stop with the code, so the landing asks for
  // the answer (and a fresh token) there. A locked one says so. Nothing about the answer is in the URL.
  if (!outcome.ok && (outcome.reason === 'answer_required' || outcome.reason === 'answer_wrong')) {
    landing.searchParams.set('p', code)
    landing.searchParams.set('claim', 'answer')
    return redirect(landing, 303)
  }
  if (!outcome.ok && outcome.reason === 'answer_locked') {
    landing.searchParams.set('claim', 'answer_locked')
    return redirect(landing, 303)
  }
  // FH-020V: a visit kept for staff review is its own answer on the landing, never a credit and never a refusal.
  landing.searchParams.set('claim', result === 'credited' || result === 'already_credited' || result === 'held' ? result : 'unavailable')
  return redirect(landing, 303)
}
