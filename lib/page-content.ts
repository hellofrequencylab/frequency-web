import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// Operator-editable page header content (title + description), keyed by route
// (ADR-180). A coded page reads this and falls back to its hardcoded default when
// nothing is set, so editing is purely additive. Edited from the page's Settings
// panel by an operator (admin+); see components/admin/modules/page-content-module.
//
// `page_content` isn't in the generated DB types yet → untyped-client cast (repo
// convention). Cached per request so a page's title + description share one read.

export interface PageContent {
  title: string
  description: string
}

export const getPageContent = cache(async (route: string): Promise<PageContent | null> => {
  try {
    const db = createAdminClient() as unknown as SupabaseClient
    const { data } = await db
      .from('page_content')
      .select('title, description')
      .eq('route', route)
      .maybeSingle()
    if (!data) return null
    const row = data as { title: string | null; description: string | null }
    return { title: row.title ?? '', description: row.description ?? '' }
  } catch {
    return null
  }
})

/** Resolve a page's title + description, preferring the operator override. */
export async function resolvePageContent(
  route: string,
  fallback: PageContent,
): Promise<PageContent> {
  const c = await getPageContent(route)
  return {
    title: c?.title?.trim() || fallback.title,
    description: c?.description?.trim() || fallback.description,
  }
}
