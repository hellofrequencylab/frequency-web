import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimitOk, clientIp, tooMany } from '@/lib/rate-limit'
import { collaboratorTypeLabel } from '@/lib/events/event-share'
import { normalizeSpaceType, isConsoleSpaceType } from '@/lib/spaces/types'
import { DISCOVERABLE_CIRCLE_VISIBILITY } from '@/lib/circles/visibility'

// Name autocomplete for two event fields:
//   • DEFAULT — the "Where does this event live" placement field (components/events/
//     event-placement-field.tsx): Spaces AND Circles matching a query.
//   • ?for=event-share — the Collaborators share field (components/events/event-share-field.tsx):
//     Spaces ONLY, and only VALID Collaborator targets (ADR-835) — real Business / Non Profit
//     Spaces, never the platform root. The person/Space distinction is STRUCTURAL (only spaces rows
//     surface here, never profiles), so a Space named after its owner IS eligible; each hit carries
//     `type_label` (collaboratorTypeLabel) so the picker badges it as a Space and it never reads as
//     a person. requestEventShare enforces the same rule server-side; this filter just keeps
//     invalid rows out of the picker.
// Auth-gated + rate-limited (the guards are copied from app/api/search/route.ts). The admin client
// bypasses RLS, so this scopes results itself: only listable Spaces (active, not private) and
// non-archived Circles surface, and the picked target's steward still has to approve before
// anything goes live — so this is a low-risk read.

type ScopeHit = { id: string; name: string; slug: string; image_url: string | null; type_label?: string }

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
    // Collaborator targets only: active, listable, console-type Spaces (the root is excluded in the
    // query; the type filter below is belt-and-suspenders for anything unexpected). `type` rides the
    // select for the badge — each hit returns the member-facing `type_label` instead of the raw type.
    const { data } = await admin
      .from('spaces')
      .select('id, name, brand_name, slug, brand_logo_url, status, visibility, type')
      .or(`name.ilike.%${safeQ}%,brand_name.ilike.%${safeQ}%,slug.ilike.%${safeQ}%`)
      .eq('status', 'active')
      .neq('visibility', 'private')
      .neq('type', 'root')
      .order('name')
      .limit(6)
    const rows = (data ?? []) as Array<{
      id: string
      name: string | null
      brand_name: string | null
      slug: string
      brand_logo_url: string | null
      type: string | null
    }>

    const spaces: ScopeHit[] = rows
      .filter((r) => isConsoleSpaceType(normalizeSpaceType(r.type)))
      .map((s) => ({
        id: s.id,
        name: s.brand_name ?? s.name ?? 'Space',
        slug: s.slug,
        image_url: s.brand_logo_url,
        type_label: collaboratorTypeLabel(s.type),
      }))

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
    // 🔴 The admin client bypasses RLS, so `circles_visibility_restrictive` does not apply here and
    // the visibility filter has to be written by hand (ADR-1015). A picker is a DISCOVERY surface:
    // it may only offer circles anyone could already browse, so unlisted and private both drop out.
    admin
      .from('circles')
      .select('id, name, slug, image_url, status')
      .or(`name.ilike.%${safeQ}%,slug.ilike.%${safeQ}%`)
      .neq('status', 'archived')
      .in('visibility', [...DISCOVERABLE_CIRCLE_VISIBILITY])
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
