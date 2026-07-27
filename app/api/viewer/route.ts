import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// The signed-in viewer's header identity, read from the CLIENT after hydration.
//
// Why this exists: reading auth during render is a dynamic API, and a dynamic API anywhere in a
// layout opts the whole route out of static rendering. <SiteHeader> did exactly that, which
// force-dynamicked all 22 public /discover pages and silently voided their `export const
// revalidate = 3600` — every visitor and every crawler paid two auth round trips plus the page's
// full query set, on every single hit. (Component-level static/dynamic boundaries would need
// cacheComponents, which this app does not enable.)
//
// So /discover renders the header's ANONYMOUS shell statically — which is the indexable view a bot
// should see anyway — and a signed-in member's own chrome is swapped in from here on mount. This
// endpoint returns exactly what the header needs and nothing else.
//
// PRIVACY: own-row only, keyed on the caller's session. There is no id parameter, so there is
// nothing to enumerate; an anonymous caller gets `{ signedIn: false }`.

export const dynamic = 'force-dynamic'

export async function GET() {
  const noStore = { 'Cache-Control': 'no-store, private' }
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ signedIn: false }, { headers: noStore })

    // Own-row read via the SESSION client (RLS-covered), the same select the header used to do
    // during render — see ADR-042.
    const { data } = await supabase
      .from('profiles')
      .select('display_name, handle, avatar_url, community_role, web_role')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (!data) return NextResponse.json({ signedIn: false }, { headers: noStore })

    return NextResponse.json(
      {
        signedIn: true,
        profile: {
          display_name: data.display_name ?? '',
          handle: data.handle ?? '',
          avatar_url: data.avatar_url ?? null,
        },
        communityRole: data.community_role ?? null,
        webRole: data.web_role ?? null,
      },
      { headers: noStore },
    )
  } catch {
    // FAIL-SAFE: the header keeps its anonymous shell rather than breaking the page.
    return NextResponse.json({ signedIn: false }, { headers: noStore })
  }
}
