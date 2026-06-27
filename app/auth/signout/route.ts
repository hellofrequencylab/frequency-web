import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { IMPERSONATION_COOKIE } from '@/lib/impersonation'

// POST-only to prevent sign-out via prefetched GET links (CSRF hygiene).
export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  // Clear any act-as stash so a signout-while-impersonating can't leave a stale
  // cookie that confuses the next sign-in.
  ;(await cookies()).delete(IMPERSONATION_COOKIE)

  const { origin } = new URL(request.url)
  return NextResponse.redirect(`${origin}/`, { status: 303 })
}
