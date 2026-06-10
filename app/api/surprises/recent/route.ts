import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Recent unseen ZAP Surprises for the signed-in member (ADR-210). Gems surprises
// already toast in-flow off the practice-log result; the Zap variant fires on
// real-world acts that are often fire-and-forget (and the referral case fires for
// the referrer while they're elsewhere), so there is no in-flow channel. This thin
// read lets a global client toaster surface them shortly after they land.
//
// Reads the idempotent grant record (reward_grants) — RLS scopes rows to the
// caller, so no service role and no cross-member leak. The client dedups by
// rule_key (one toast per device), so we can return a small recent window.
export const dynamic = 'force-dynamic'

interface GrantRow {
  rule_key: string
  amount: number
  detail: string | null
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ surprises: [] })

  // The last half hour is plenty: surprises are capped to one/day and the client
  // remembers what it has shown, so this only needs to catch the fresh ones.
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('reward_grants')
    .select('rule_key, amount, detail, granted_at')
    .eq('reward_kind', 'zaps')
    .like('rule_key', 'surprise.zaps:%')
    .gte('granted_at', since)
    .order('granted_at', { ascending: false })
    .limit(5)

  const surprises = ((data ?? []) as GrantRow[]).map((r) => ({
    key: r.rule_key,
    amount: r.amount,
    // "A small surprise. Plus N zaps." → "A small surprise" (the card shows the amount).
    label: r.detail?.split('. Plus')[0] ?? 'A surprise',
  }))
  return NextResponse.json({ surprises })
}
