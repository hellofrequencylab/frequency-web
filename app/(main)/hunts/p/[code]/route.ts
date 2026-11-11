import { createHash } from 'node:crypto'
import { getCallerProfile } from '@/lib/auth'
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
  if (resolution.canClaim && await getCallerProfile()) landing.searchParams.set('p', code)
  return redirect(landing, 302)
}

async function readToken(request: Request): Promise<string | null> {
  try {
    const fields = [...(await request.formData()).entries()]
    if (fields.length !== 1) return null
    const [name, value] = fields[0]
    return name === 'token' && typeof value === 'string' && value.length > 0 && value.length <= 2000 ? value : null
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
  const token = await readToken(request)
  if (!token) return new Response('Open the stop and try again.', { status: 400, headers: privateHeaders })

  const { code } = await params
  const placement = await loadScanPlacement({ code })
  if (!placement?.huntSlug || placement.revokedAt) return notFound()

  const outcome = await claimAsPlayer(caller.id, {
    placementId: placement.id,
    token,
    idempotencyKey: createHash('sha256').update(token).digest('hex'),
    nowEpoch: Math.floor(Date.now() / 1000),
  })
  const landing = new URL(`/play/${encodeURIComponent(placement.huntSlug)}`, origin)
  const result = outcome.ok ? outcome.result : null
  landing.searchParams.set('claim', result === 'credited' || result === 'already_credited' ? result : 'unavailable')
  return redirect(landing, 303)
}
