// The Zap menu's live line from Vera (ADR-230). Deliberately CHEAP: this backs
// the most-tapped button in the app, so there is no AI call and no generation
// here — it reuses today's already-cached Dispatch when one exists (Vera
// already wrote it), else falls to a deterministic streak/time template. The
// client renders a static fallback instantly and swaps when this arrives.

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function templateLine(streak: number, hour: number): string {
  if (streak >= 2) {
    if (hour >= 18) return `Day ${streak}. One log tonight keeps the run alive.`
    return `Day ${streak}. Catch something real today.`
  }
  if (hour >= 18) return 'The day counts when you log it. Catch one thing.'
  return 'Every run starts with one. Catch today.'
}

export async function GET() {
  const profileId = await getMyProfileId()
  if (!profileId) return NextResponse.json({ line: null }, { status: 401 })

  const admin = createAdminClient() as unknown as SupabaseClient
  const day = new Date().toISOString().slice(0, 10)

  // Reuse today's Dispatch verbatim when it exists — never generate from here.
  const { data: dispatch } = await admin
    .from('vera_dispatches')
    .select('copy')
    .eq('profile_id', profileId)
    .eq('day', day)
    .maybeSingle()
  const cached = (dispatch as { copy: string } | null)?.copy
  if (cached) return NextResponse.json({ line: cached })

  const { data: prof } = await admin
    .from('profiles')
    .select('current_streak')
    .eq('id', profileId)
    .maybeSingle()
  const streak = Number((prof as { current_streak: number | null } | null)?.current_streak ?? 0)
  const hour = new Date().getUTCHours() // close enough for a nudge line
  return NextResponse.json({ line: templateLine(streak, hour) })
}
