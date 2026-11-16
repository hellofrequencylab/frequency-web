// CSP violation sink (P8). The report-only Content-Security-Policy (next.config.ts)
// posts violations here so we can see what an ENFORCED policy would block and tighten the
// directives before flipping to enforcement. Logs a concise summary; never stores, never
// throws, always 204. Unauthenticated by design (browsers post reports with no session).

import { NextRequest, NextResponse } from 'next/server'
import { log } from '@/lib/log'
import { clientIp, rateLimitOk } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// A report is a few hundred bytes. Past 10KB it is not one (SCAN-1239).
const MAX_REPORT_BYTES = 10_000

export async function POST(req: NextRequest) {
  // Throttled per address; a refused report still answers 204, so a browser never retries. 'allow' when KV is
  // unset: a lost report costs nothing, a deny would only hide the sink.
  if (!(await rateLimitOk('csp-report', clientIp(req), 60, '1 m', { whenUnconfigured: 'allow' }))) {
    return new NextResponse(null, { status: 204 })
  }
  try {
    const text = await req.text()
    if (text.length > MAX_REPORT_BYTES) return new NextResponse(null, { status: 204 })
    const body = (() => {
      try {
        return JSON.parse(text)
      } catch {
        return null
      }
    })()
    // Two shapes: classic { "csp-report": {...} } and Reporting API [{ body: {...} }].
    const r = body?.['csp-report'] ?? (Array.isArray(body) ? body[0]?.body : body) ?? {}
    log.info('csp.violation', {
      directive: r['violated-directive'] ?? r.effectiveDirective ?? null,
      blocked: String(r['blocked-uri'] ?? r.blockedURL ?? '').slice(0, 200),
      document: String(r['document-uri'] ?? r.documentURL ?? '').slice(0, 200),
    })
  } catch {
    /* best-effort — a malformed report must never error */
  }
  return new NextResponse(null, { status: 204 })
}
