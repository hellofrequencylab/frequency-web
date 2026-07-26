import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimitOk, clientIp, tooMany } from '@/lib/rate-limit'
import { isPersonalMemberSpace } from '@/lib/events/event-share'
import { normalizeSpaceType, isConsoleSpaceType } from '@/lib/spaces/types'

// Name autocomplete for two event fields:
//   • DEFAULT — the "Where does this event live" placement field (components/events/
//     event-placement-field.tsx): Spaces AND Circles matching a query.
//   • ?for=event-share — the Collaborators share field (components/events/event-share-field.tsx):
//     Spaces ONLY, and only VALID Collaborator targets (ADR-834) — real Business / Non Profit
//     Spaces, never the platform root and never a member's PERSONAL space (a Space whose identity
//     mirrors its owner's member identity; those read as people in the picker and collide with the
//     personal-cohost relation). requestEventShare enforces the same rule server-side; this filter
//     just keeps invalid rows out of the picker.
// Auth-gated + rate-limited (the guards are copied from app/api/search/route.ts). The admin client
// bypasses RLS, so this scopes results itself: only listable Spaces (active, not private) and
// non-archived Circles surface, and the picked target's steward still has to approve before
// anything goes live — so this is a low-risk read.

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
  const shareMode = searchParams.get('for') === 'event-share'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(EMPTY, { status: 401 })

  const admin = createAdminClient()

  if (shareMode) {
    // Collaborator targets only. Over-fetch (12) because the personal-space filter below can drop
    // rows, then trim back to the picker's 6. `type`/`owner_profile_id` ride the select for the
    // gate; they are not returned to the client.
    const { data } = await admin
      .from('spaces')
      .select('id, name, brand_name, slug, brand_logo_url, status, visibility, type, owner_profile_id')
      .or(`name.ilike.%${safeQ}%,brand_name.ilike.%${safeQ}%,slug.ilike.%${safeQ}%`)
      .eq('status', 'active')
      .neq('visibility', 'private')
      .neq('type', 'root')
      .order('name')
      .limit(12)
    const rows = (data ?? []) as Array<{
      id: string
      name: string | null
      brand_name: string | null
      slug: string
      brand_logo_url: string | null
      type: string | null
      owner_profile_id: string | null
    }>

    // Batch-resolve the owners' member identities for the personal-space check.
    const ownerIds = [...new Set(rows.map((r) => r.owner_profile_id).filter((v): v is string => !!v))]
    const ownerById = new Map<string, { display_name: string | null; handle: string | null }>()
    if (ownerIds.length > 0) {
      const { data: owners } = await admin
        .from('profiles')
        .select('id, display_name, handle')
        .in('id', ownerIds)
      for (const p of (owners ?? []) as Array<{ id: string; display_name: string | null; handle: string | null }>) {
        ownerById.set(p.id, { display_name: p.display_name, handle: p.handle })
      }
    }

    const spaces: ScopeHit[] = rows
      .filter((r) => {
        if (!isConsoleSpaceType(normalizeSpaceType(r.type))) return false
        const owner = r.owner_profile_id ? ownerById.get(r.owner_profile_id) : undefined
        return !isPersonalMemberSpace({
          type: r.type,
          name: r.name,
          brandName: r.brand_name,
          slug: r.slug,
          ownerDisplayName: owner?.display_name ?? null,
          ownerHandle: owner?.handle ?? null,
        })
      })
      .slice(0, 6)
      .map((s) => ({ id: s.id, name: s.brand_name ?? s.name ?? 'Space', slug: s.slug, image_url: s.brand_logo_url }))

    return NextResponse.json({ spaces, circles: [] as ScopeHit[] })
  }

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
