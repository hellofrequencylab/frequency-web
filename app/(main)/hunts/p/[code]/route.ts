import { createHash } from 'node:crypto'
import { getCallerProfile } from '@/lib/auth'
import { deferHuntEvent, reasonClass } from '@/lib/hunts/analytics'
import { claimAsPlayer, loadScanPlacement } from '@/lib/hunts/claim-store'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { isCrawler, resolvePlacement } from '@/lib/hunts/placement'
import { claimAsTeamMember } from '@/lib/hunts/team-store'
import { teamClaimKey } from '@/lib/hunts/teams'
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
 * The confirm form carries exactly one field: a solo player's run-bound `token`, or `team=1` when the
 * landing found the caller on a locked team (FH-043S). A team confirmation carries no token: the team
 * door picks the team and its run from the caller's own membership and checks the roster again.
 */
async function readConfirmation(request: Request): Promise<{ token: string } | { team: true } | null> {
  try {
    const fields = [...(await request.formData()).entries()]
    if (fields.length !== 1) return null
    const [name, value] = fields[0]
    if (name === 'team') return value === '1' ? { team: true } : null
    return name === 'token' && typeof value === 'string' && value.length > 0 && value.length <= 2000 ? { token: value } : null
  } catch {
    return null
  }
}

const LANDED = ['credited', 'already_credited', 'held'] as const

export async function POST(request: Request, { params }: Context) {
  if (!huntSwitchOn('claims')) return notFound()

  const requestOrigin = new URL(request.url).origin
  const origin = scanOrigin(requestOrigin)
  if (origin?.origin !== requestOrigin || request.headers.get('origin') !== requestOrigin || isCrawler(request.headers.get('user-agent'))) {
    return new Response('Open the Trail to confirm this stop.', { status: 403, headers: privateHeaders })
  }

  const caller = await getCallerProfile()
  if (!caller) return new Response('Sign in to confirm this stop.', { status: 401, headers: privateHeaders })
  const form = await readConfirmation(request)
  if (!form) return new Response('Open the stop and try again.', { status: 400, headers: privateHeaders })

  const { code } = await params
  const placement = await loadScanPlacement({ code })
  if (!placement?.huntSlug || placement.revokedAt) return notFound()

  const nowEpoch = Math.floor(Date.now() / 1000)
  // FH-043S: a team member's scan credits the team run through the team door, with the same key the
  // typed code uses, so a scan and a typed retry are one claim. Off the roster it is refused, never solo.
  const outcome = 'team' in form
    ? await claimAsTeamMember(caller.id, { slug: placement.huntSlug, code, idempotencyKey: teamClaimKey(caller.id, placement.huntSlug, code), nowEpoch })
    : await claimAsPlayer(caller.id, {
      placementId: placement.id,
      token: form.token,
      idempotencyKey: createHash('sha256').update(form.token).digest('hex'),
      nowEpoch,
    })
  deferHuntEvent({
    event: 'hunt.stop_claim',
    actorProfileId: caller.id,
    props: { hunt_id: placement.huntId, assurance: 'signed_node', reason_class: reasonClass(outcome.ok ? outcome.result : outcome.reason), replayed: outcome.ok && outcome.replayed },
  })
  const landing = new URL(`/play/${encodeURIComponent(placement.huntSlug)}`, origin)
  const result = outcome.ok ? outcome.result : null
  // FH-020V: a visit kept for staff review is its own answer on the landing, never a credit and never a refusal.
  // A team whose captain has not locked the roster reads that, so the member knows what to ask for.
  const landed = LANDED.find((r) => r === result) ?? (!outcome.ok && outcome.reason === 'roster_not_locked' ? 'roster_not_locked' : 'unavailable')
  landing.searchParams.set('claim', landed)
  return redirect(landing, 303)
}
