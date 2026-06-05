import type { SupabaseClient } from '@supabase/supabase-js'
import type { Data } from '@measured/puck'
import { createAdminClient } from '@/lib/supabase/admin'

// `pages` is untyped in the generated DB types -> cast (same as lib/studio/*).

// The splash (`/`, slug `home`) AND `about` are deliberately NOT here. They are
// bespoke coded experiences (the splash's live counts/parallax; the About story's
// crafted rhythm) that the generic Puck block set can't reproduce — and being in
// this list is exactly what let a published draft *shadow* the coded design (the
// trap we hit: About rendered a duplicated, garbled draft over the clean code).
// Keeping them out is the guard: every editor route, the Pages directory, and
// publish/draft/unpublish gate on `isEditableSlug`, so the coded page is the single
// source of truth.
export const EDITABLE_PAGES = [
  { slug: 'the-lab', title: 'The Lab', path: '/the-lab' },
  { slug: 'how-it-works', title: 'How it works', path: '/how-it-works' },
] as const

export type EditableSlug = (typeof EDITABLE_PAGES)[number]['slug']

export function pathForSlug(slug: string): string {
  return EDITABLE_PAGES.find((p) => p.slug === slug)?.path ?? '/'
}

export function isEditableSlug(slug: string): slug is EditableSlug {
  return EDITABLE_PAGES.some((p) => p.slug === slug)
}

export interface PageRow {
  slug: string
  title: string
  data: Data | null
  published_data: Data | null
  status: string
  updated_at: string | null
  published_at: string | null
}

const SELECT = 'slug, title, data, published_data, status, updated_at, published_at'

export async function getPage(slug: string): Promise<PageRow | null> {
  const db = createAdminClient() as unknown as SupabaseClient
  const { data } = await db.from('pages').select(SELECT).eq('slug', slug).maybeSingle()
  return (data as PageRow | null) ?? null
}

// The live document the public site renders, or null (→ legacy fallback).
export async function getPublishedData(slug: string): Promise<Data | null> {
  const page = await getPage(slug)
  return (page?.published_data as Data | null) ?? null
}

export async function listPages(): Promise<Record<string, PageRow>> {
  const db = createAdminClient() as unknown as SupabaseClient
  const { data } = await db.from('pages').select(SELECT)
  const map: Record<string, PageRow> = {}
  for (const r of (data as PageRow[]) ?? []) map[r.slug] = r
  return map
}
