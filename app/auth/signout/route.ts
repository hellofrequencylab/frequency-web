import { NextResponse } from 'next/server'
import { signOutCurrentSession } from '@/lib/auth/sign-out'

// POST-only to prevent sign-out via prefetched GET links (CSRF hygiene).
export async function POST(request: Request) {
  await signOutCurrentSession()
  const { origin } = new URL(request.url)
  return NextResponse.redirect(`${origin}/`, { status: 303 })
}
