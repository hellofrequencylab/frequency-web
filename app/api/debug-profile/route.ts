import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Diagnostic endpoint — ONLY enabled in development.
// Visit: GET /api/debug-profile?handle=<your-handle>
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const handle = request.nextUrl.searchParams.get('handle') ?? ''
  const admin = createAdminClient()

  // 1. Can the admin client see any profiles at all?
  const { count, error: countError } = await admin
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  // 2. List up to 10 handles (no filter) so we know what's in the DB.
  const { data: allHandles, error: listError } = await admin
    .from('profiles')
    .select('handle, is_active, display_name')
    .limit(10)

  // 3. Exact match for the requested handle (no join, no is_active filter).
  const { data: raw, error: rawError } = await admin
    .from('profiles')
    .select('id, handle, display_name, is_active, nexus_region_id')
    .eq('handle', handle)
    .maybeSingle()

  // 4. Same query but with the nexus_regions join (explicit FK hint).
  const { data: withJoin, error: joinError } = await admin
    .from('profiles')
    .select('id, handle, display_name, is_active, nexus_regions!nexus_region_id(name)')
    .eq('handle', handle)
    .maybeSingle()

  // Decode the JWT payload to check the actual role claim.
  // Both the anon key and service role key start with eyJ — only the payload differs.
  let jwtRole = 'unknown'
  try {
    const raw_key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
    const payloadB64 = raw_key.split('.')[1] ?? ''
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'))
    jwtRole = payload.role ?? 'no-role-claim'
  } catch {
    jwtRole = 'decode-error'
  }

  return NextResponse.json({
    queried_handle: handle,
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    // Should be "service_role". If this says "anon" you have the wrong key in .env.local.
    service_role_key_jwt_role: jwtRole,
    total_profiles: { count, error: countError },
    all_handles: { data: allHandles, error: listError },
    exact_match_no_join: { data: raw, error: rawError },
    exact_match_with_join: { data: withJoin, error: joinError },
  })
}
