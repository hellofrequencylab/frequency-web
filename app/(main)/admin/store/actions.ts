'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/database.types'

type StoreCategory = Database['public']['Enums']['store_category']

const STORE_CATEGORIES: StoreCategory[] = [
  'cosmetic',
  'membership',
  'feature',
  'title',
  'collectible',
]

function isStoreCategory(v: string): v is StoreCategory {
  return (STORE_CATEGORIES as string[]).includes(v)
}

// Defense-in-depth: the app re-verifies host+ here, AND the store_items RLS policies
// (host+ insert/update/delete) enforce it at the database now that these run on the
// caller's session client (RLS Tier-1 convergence, H2-1) instead of the admin client.
async function authorizeHostAction() {
  const caller = await getCallerProfile()
  if (!caller || !atLeastRole(caller.community_role, 'host')) {
    throw new Error('Unauthorized')
  }
  return caller
}

function parseFormData(fd: FormData) {
  const str = (k: string) => String(fd.get(k) ?? '').trim()
  const num = (k: string, fallback = 0) => {
    const v = Number(fd.get(k))
    return isNaN(v) ? fallback : v
  }

  const category = str('category')
  if (!isStoreCategory(category)) throw new Error(`Invalid category: ${category}`)

  return {
    slug: str('slug'),
    name: str('name'),
    description: str('description'),
    category,
    gem_cost: num('gem_cost'),
    icon: str('icon') || 'gem',
    stock: str('stock') === '' ? null : num('stock', 0),
    sort_order: num('sort_order'),
    preview: str('preview') || null,
  } as const
}

export async function createStoreItem(fd: FormData): Promise<void> {
  await authorizeHostAction()
  const fields = parseFormData(fd)

  const supabase = await createClient()
  const { error } = await supabase.from('store_items').insert({
    slug: fields.slug,
    name: fields.name,
    description: fields.description,
    category: fields.category,
    gem_cost: fields.gem_cost,
    icon: fields.icon,
    stock: fields.stock,
    sort_order: fields.sort_order,
    preview: fields.preview,
    is_active: false,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/store')
}

export async function updateStoreItem(id: string, fd: FormData): Promise<void> {
  await authorizeHostAction()
  const fields = parseFormData(fd)

  const supabase = await createClient()
  const { error } = await supabase
    .from('store_items')
    .update({
      slug: fields.slug,
      name: fields.name,
      description: fields.description,
      category: fields.category,
      gem_cost: fields.gem_cost,
      icon: fields.icon,
      stock: fields.stock,
      sort_order: fields.sort_order,
      preview: fields.preview,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/store')
}

export async function deleteStoreItem(id: string): Promise<void> {
  await authorizeHostAction()

  const supabase = await createClient()
  const { error } = await supabase.from('store_items').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/store')
}

export async function toggleStoreItemActive(id: string, isActive: boolean): Promise<void> {
  await authorizeHostAction()

  const supabase = await createClient()
  const { error } = await supabase
    .from('store_items')
    .update({ is_active: isActive })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/store')
}
