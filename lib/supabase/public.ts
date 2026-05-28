import { createServerClient } from '@supabase/ssr'

// Cookieless anon client for PUBLIC reads (the /discover pages, sitemap).
//
// Unlike lib/supabase/server.ts this never touches cookies(), so it does NOT
// opt the caller into dynamic rendering — public pages can be statically
// generated / ISR-cached and used inside generateStaticParams at build time.
// It authenticates as the `anon` role, so RLS is fully enforced; combined with
// the column-safe public_* RPCs this guarantees no logged-out reader ever sees
// more than the anon policy allows.
export function createPublicClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {},
      },
    }
  )
}
