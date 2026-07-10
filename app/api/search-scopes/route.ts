import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimitOk, clientIp, tooMany } from '@/lib/rate-limit'

// Name autocomplete for the "Where does this event live" field (components/events/
// event-placement-field.tsx). Returns Spaces and Circles matching a query, so a host can
// pick where to ask their event be placed. Auth-gated + rate-limited (the guards are copied
// from app/api/search/route.ts). The admin client bypasses RLS, so this scopes results itself:
// only listable Spaces (active, not private) and non-archived Circles surface, and the picked
// target's steward still has to approve before anything goes live — so this is a low-risk read.

type ScopeHit = { id: string; name: string; slug: string; image_url: string | null }

const EMPTY = { spaces: [] as ScopeHit[], circles: [] as ScopeHit[] }

export async function GET(request: Request) {
  if (!(await rateLimitOk('search-scopes', clientIp(request), 60, '60 s'))) return tooMany()

  const { searchParams } = new URL(request.url)
  // Strip characters that would break a PostgREST or() filter; trim + cap length.
  const q = (searchParams.get('q') ?? '').replace(/[(),]/g, ' ').trim().slice(0, 80)
  if (q.length < 2) return NextResponse.json(EMPTY)
  // Escape LIKE wildcards so user input is always a literal substring.
  const safeQ = q.replace(/[%_\\]/g, '\\$&')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(EMPTY, { status: 401 })

  const admin = createAdminClient()
  const [spacesRes, circlesRes] = await Promise.all([
    admin
      .from('spaces')
      .select('id, name, brand_name, slug, brand_logo_url, status, visibility')
      .or(`name.ilike.%${safeQ}%,brand_name.ilike.%${safeQ}%,slug.ilike.%${safeQ}%`)
      .eq('status', 'active')
      .neq('visibility', 'private')
      .order('name')
      .limit(6),
    admin
      .from('circles')
      .select('id, name, slug, image_url, status')
      .or(`name.ilike.%${safeQ}%,slug.ilike.%${safeQ}%`)
      .neq('status', 'archived')
      .order('name')
      .limit(6),
  ])

  const spaces: ScopeHit[] = (
    (spacesRes.data ?? []) as Array<{
      id: string
      name: string | null
      brand_name: string | null
      slug: string
      brand_logo_url: string | null
    }>
  ).map((s) => ({ id: s.id, name: s.brand_name ?? s.name ?? 'Space', slug: s.slug, image_url: s.brand_logo_url }))

  const circles: ScopeHit[] = (
    (circlesRes.data ?? []) as Array<{ id: string; name: string | null; slug: string; image_url: string | null }>
  ).map((c) => ({ id: c.id, name: c.name ?? 'Circle', slug: c.slug, image_url: c.image_url }))

  return NextResponse.json({ spaces, circles })
}
