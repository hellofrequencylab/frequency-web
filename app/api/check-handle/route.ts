import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitOk, clientIp, tooMany } from '@/lib/rate-limit'

// Handle uniqueness check. Uses the handle_is_available SECURITY DEFINER RPC
// (added in 20240204000000) so the caller's role doesn't matter. Anyone
// can check whether a handle is taken without seeing whose row holds it.
//
// The `userId` query param lets the signup flow keep its own auto-generated
// handle when it re-checks. Without this, the user would see "taken" on
// their own handle.
export async function GET(request: Request) {
  if (!(await rateLimitOk('check-handle', clientIp(request), 60, '60 s'))) return tooMany()

  const { searchParams } = new URL(request.url)
  const handle = searchParams.get('handle')
  const excludeUserId = searchParams.get('userId')

  if (!handle) {
    return NextResponse.json({ available: false })
  }

  const supabase = await createClient()

  // If the caller passed a userId to exclude, we still need to check
  // whether *anyone else* has the handle. The RPC tells us if it's free
  // globally; if it's not free but the only owner is the excluded user,
  // it's effectively still available.
  const { data: available, error } = await supabase.rpc('handle_is_available', {
    check_handle: handle,
  })

  if (error) return NextResponse.json({ available: false })
  if (available) return NextResponse.json({ available: true })

  // Not globally free. Check whether the only owner is the excluded user.
  if (excludeUserId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.id === excludeUserId) {
      const { data: ownProfile } = await supabase
        .from('profiles')
        .select('handle')
        .eq('auth_user_id', excludeUserId)
        .maybeSingle()
      if (ownProfile?.handle === handle) {
        return NextResponse.json({ available: true })
      }
    }
  }

  return NextResponse.json({ available: false })
}
