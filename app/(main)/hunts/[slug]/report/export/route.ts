// The venue report's exports (FH-026). A GET that only reads: the report as CSV, or the venue's own
// opted-in contacts. Dark by default: HUNTS_CLAIMS_ENABLED (which needs HUNTS_ENABLED) answers 404
// until the owner turns it on. The Space in the query is a request, never a grant: readMerchantReport
// checks the caller's live standing at that venue before any row is read, and every refusal (signed
// out aside) is the same plain 404, so a removed staff member or another Space's staff learns nothing.
//
//   GET /hunts/<slug>/report/export?kind=report|contacts&space=<venue Space id>

import { getCallerProfile } from '@/lib/auth'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { contactsCsv, merchantReportCsv, readMerchantReport } from '@/lib/hunts/merchant-report'
import { huntBySlug, merchantReportDeps } from '@/lib/hunts/merchant-report-store'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ slug: string }> }

const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
const notFound = () => new Response('Not found.', { status: 404, headers })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export async function GET(request: Request, { params }: Context) {
  if (!huntSwitchOn('claims')) return notFound()
  const caller = await getCallerProfile()
  if (!caller) return new Response('Sign in to download this report.', { status: 401, headers })

  const url = new URL(request.url)
  const kind = url.searchParams.get('kind')
  const venueSpaceId = url.searchParams.get('space') ?? ''
  if ((kind !== 'report' && kind !== 'contacts') || !UUID.test(venueSpaceId)) return notFound()

  const { slug } = await params
  const hunt = await huntBySlug(slug)
  if (!hunt) return notFound()
  const out = await readMerchantReport(merchantReportDeps, { profileId: caller.id, huntId: hunt.id, venueSpaceId })
  if (!out.ok) return notFound()

  const body = kind === 'report' ? merchantReportCsv(out.report) : contactsCsv(venueSpaceId, hunt.id, out.roster)
  return new Response(body, {
    headers: {
      ...headers,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="trail-${hunt.slug}-${kind}.csv"`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
