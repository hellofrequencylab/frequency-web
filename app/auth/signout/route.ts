import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST-only to prevent sign-out via prefetched GET links (CSRF hygiene).
export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const { origin } = new URL(request.url)
  return NextResponse.redirect(`${origin}/`, { status: 303 })
}
