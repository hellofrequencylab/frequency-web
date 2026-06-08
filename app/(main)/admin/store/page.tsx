import { Gem, ShoppingBag, Package, ToggleRight } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { NewItemButton, EditItemButton, DeleteItemButton, ActiveToggle } from './store-item-controls'

type StoreItem = Database['public']['Tables']['store_items']['Row']
type StoreCategory = Database['public']['Enums']['store_category']

const CATEGORY_STYLES: Record<StoreCategory, { label: string; cls: string }> = {
  cosmetic:    { label: 'Cosmetic',    cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  membership:  { label: 'Membership', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  feature:     { label: 'Feature',    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  title:       { label: 'Title',      cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
  collectible: { label: 'Collectible',cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
}

export default async function AdminStorePage() {
  await requireAdmin('host', { staff: 'community' })

  const admin = createAdminClient()

  const [
    { data: items },
    { count: totalItems },
    { count: activeItems },
    { count: totalRedemptions },
  ] = await Promise.all([
    admin
      .from('store_items')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    admin.from('store_items').select('id', { count: 'exact', head: true }),
    admin.from('store_items').select('id', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('store_redemptions').select('id', { count: 'exact', head: true }),
  ] as const)

  const rows = (items ?? []) as StoreItem[]

  return (
    <AdminPage
      title="Store"
      eyebrow="Engage"
      description="Manage gem store items, catalog, and availability."
      width="wide"
      actions={<NewItemButton />}
    >
      {/* Stats strip */}
      <AdminSection>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Total items" value={totalItems ?? 0} icon={ShoppingBag} />
          <StatCard label="Active" value={activeItems ?? 0} icon={ToggleRight} />
          <StatCard label="Redemptions" value={totalRedemptions ?? 0} icon={Gem} />
        </div>
      </AdminSection>

      {/* Catalog */}
      <AdminSection title={`Catalog (${rows.length})`}>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface py-16 text-center">
            <Package className="mx-auto mb-3 h-8 w-8 text-subtle" />
            <p className="text-sm font-medium text-text">No items yet</p>
            <p className="mt-1 text-xs text-muted">Add the first gem store item using the button above.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {/* Header row (desktop) */}
            <div className="hidden border-b border-border px-4 py-2 sm:grid sm:grid-cols-[1fr_130px_100px_80px_64px_72px] sm:items-center sm:gap-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Item</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Category</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle text-right">Gem cost</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle text-right">Stock</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle text-center">Active</span>
              <span className="sr-only">Actions</span>
            </div>

            {/* Data rows */}
            <div className="divide-y divide-border/50">
              {rows.map((item) => {
                const cat = CATEGORY_STYLES[item.category]
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated sm:grid-cols-[1fr_130px_100px_80px_64px_72px] sm:gap-4"
                  >
                    {/* Name + slug */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-base leading-none" aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className="truncate text-sm font-medium text-text">{item.name}</span>
                      </div>
                      <span className="mt-0.5 block truncate text-xs text-subtle">{item.slug}</span>
                    </div>

                    {/* Category badge — hidden on mobile */}
                    <span
                      className={`hidden sm:inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${cat.cls}`}
                    >
                      {cat.label}
                    </span>

                    {/* Gem cost — hidden on mobile */}
                    <span className="hidden sm:flex items-center justify-end gap-1 text-sm font-medium tabular-nums text-text">
                      <Gem className="h-3 w-3 shrink-0 text-primary" />
                      {item.gem_cost.toLocaleString()}
                    </span>

                    {/* Stock — hidden on mobile */}
                    <span className="hidden sm:block text-right text-sm tabular-nums text-muted">
                      {item.stock === null ? '∞' : item.stock.toLocaleString()}
                    </span>

                    {/* Active toggle — desktop column */}
                    <div className="hidden sm:flex justify-center">
                      <ActiveToggle id={item.id} isActive={item.is_active} />
                    </div>

                    {/* Row actions (+ mobile toggle) */}
                    <div className="flex items-center justify-end gap-1">
                      <span className="sm:hidden">
                        <ActiveToggle id={item.id} isActive={item.is_active} />
                      </span>
                      <EditItemButton item={item} />
                      <DeleteItemButton id={item.id} name={item.name} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </AdminSection>
    </AdminPage>
  )
}
