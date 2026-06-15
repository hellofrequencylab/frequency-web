import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSafeRoute } from '@/lib/layout/page-chrome'

// The per-route page settings reader. Like loadChromeOverrides: a service-role read so it
// works regardless of the caller's RLS context, REQUEST-CACHED (React.cache, by route arg),
// and FAIL-SAFE — null on ANY error, including the missing table pre-migration. So the (main)
// layout's generateMetadata (and any caller) falls back to the code defaults and nothing
// breaks if the migration hasn't been applied yet. `page_settings` isn't in the generated DB
// types yet, so the admin client is cast loose for this table (repo convention; cf. lib/page-editor/data.ts).

export interface PageSettingsRow {
  route: string
  seo_title: string | null
  seo_description: string | null
  og_image_url: string | null
  status: string
  visibility_role: string | null
  layout: unknown
}

const SELECT = 'route, seo_title, seo_description, og_image_url, status, visibility_role, layout'

export const loadPageSettings = cache(async (route: string): Promise<PageSettingsRow | null> => {
  try {
    if (!isSafeRoute(route)) return null
    const { createAdminClient } = await import('@/lib/supabase/admin')
    // page_settings isn't in the generated DB types yet (regenerated separately per the
    // migration), so the client is cast loose for this table; this read is fully fail-safe.
    // eslint-disable-next-line no-restricted-syntax
    const db = createAdminClient() as unknown as SupabaseClient
    const { data, error } = await db.from('page_settings').select(SELECT).eq('route', route).maybeSingle()
    if (error) return null
    return (data as PageSettingsRow | null) ?? null
  } catch {
    return null
  }
})
