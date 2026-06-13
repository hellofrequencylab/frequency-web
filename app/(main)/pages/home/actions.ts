'use server'

import { revalidatePath } from 'next/cache'
import { getJanitor } from '@/lib/page-editor/guard'
import { createAdminClient } from '@/lib/supabase/admin'

// Save the home page's SEO title + meta description (ADR-180 page_content, route
// '/'). Janitor-gated like the rest of /pages (the generic savePageContent rides
// the admin COMMUNITY role, which a janitor doesn't necessarily hold). Only these
// two fields: the homepage body is a coded experience and stays in code.

const MAX_TITLE = 200
const MAX_DESCRIPTION = 600

export async function saveHomeSeo(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const janitor = await getJanitor()
  if (!janitor) return { ok: false, error: 'Not allowed.' }

  // Blank = clear the override (the coded copy takes back over).
  const title = ((fd.get('title') as string) ?? '').trim().slice(0, MAX_TITLE) || null
  const description = ((fd.get('description') as string) ?? '').trim().slice(0, MAX_DESCRIPTION) || null

  // `page_content` predates the generated types — untyped-client cast (convention).
  const db = createAdminClient()
  const { error } = await db.from('page_content').upsert({
    route: '/',
    title,
    description,
    updated_by: janitor.profileId,
    updated_at: new Date().toISOString(),
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
  revalidatePath('/pages/home')
  revalidatePath('/pages')
  return { ok: true }
}
