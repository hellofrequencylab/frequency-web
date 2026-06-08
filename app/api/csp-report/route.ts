// CSP violation sink (P8). The report-only Content-Security-Policy (next.config.ts)
// posts violations here so we can see what an ENFORCED policy would block and tighten the
// directives before flipping to enforcement. Logs a concise summary; never stores, never
// throws, always 204. Unauthenticated by design (browsers post reports with no session).

import { NextRequest, NextResponse } from 'next/server'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
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
