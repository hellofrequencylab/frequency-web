// Wide interaction firehose — batch sink (PI.1, ADR-166). The high-volume counterpart
// to /api/track: accepts a BATCH (a client flush) of raw interaction observations and
// bulk-inserts them into interaction_events. Member-tied (anonymous posts dropped, like
// /api/track); consent-gated server-side (analytics scope, ADR-069) — a member who
// opted out of analytics is silently not recorded. Returns 204; never blocks the UI.
//
// 2026-09-05 (scan2 L2-08): the insert result is read. `.then(undefined, () => {})` handled a
// rejection, but supabase-js resolves `{ error }` and never rejects, so a failing insert (column
// drift, RLS, quota) was dropped with nothing in the logs: a silent, total loss of first-party
// analytics. The error is now logged at error level with the table name; the beacon still gets
// its 204, because a beacon must never retry.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasConsent } from '@/lib/consent/consent'
import { normalizeBatch } from '@/lib/analytics/interaction-events'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: { sessionId?: string; events?: unknown }
  try {
    body = await req.json()
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const clean = normalizeBatch(body?.events)
  if (clean.length === 0) return new NextResponse(null, { status: 204 })

  // Member-tied only (drop anonymous, matching /api/track). Resolve the profile.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse(null, { status: 204 })
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return new NextResponse(null, { status: 204 })

  // Consent gate (ADR-069): no analytics consent → silently drop.
  if (!(await hasConsent(profile.id, 'analytics'))) return new NextResponse(null, { status: 204 })

  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.slice(0, 64) : null
  const rows = clean.map((o) => ({
    profile_id: profile.id,
    session_id: sessionId,
    kind: o.kind,
    surface: o.surface,
    path: o.path,
    props: o.props,
    occurred_at: o.occurredAt,
  }))

  // Service-role bulk insert (RLS blocks client writes). Fire-and-forget.
  // 2026-09-05 (scan2 L2-08): fire-and-forget the RESPONSE, never the error. supabase-js resolves
  // `{ error }`; the catch arm stays only for a transport that rejects outright.
  let insertError: { message: string } | null = null
  try {
    ;({ error: insertError } = await createAdminClient().from('interaction_events').insert(rows))
  } catch (err) {
    insertError = { message: err instanceof Error ? err.message : String(err) }
  }
  if (insertError) {
    log.error('observe.insert_failed', { table: 'interaction_events', rows: rows.length, error: insertError.message })
  }

  return new NextResponse(null, { status: 204 })
}
