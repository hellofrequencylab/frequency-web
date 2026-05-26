import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// New users have community_role='member', which the RLS policies block from
// reading other profiles. We use the service role here so the uniqueness
// check works regardless of the caller's role. This route only returns a
// boolean — no profile data is exposed.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const handle = searchParams.get('handle')
  const excludeUserId = searchParams.get('userId')

  if (!handle) {
    return NextResponse.json({ available: false })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let query = supabase
    .from('profiles')
    .select('handle')
    .eq('handle', handle)

  // Exclude the requesting user's own row so their auto-generated handle
  // doesn't appear as taken when they try to keep or modify it.
  if (excludeUserId) {
    query = query.neq('auth_user_id', excludeUserId)
  }

  const { data } = await query.maybeSingle()
  return NextResponse.json({ available: !data })
}
