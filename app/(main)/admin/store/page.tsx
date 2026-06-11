import { Gem, ShoppingBag, Package, ToggleRight } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { NewItemButton, EditItemButton, DeleteItemButton, ActiveToggle } from './store-item-controls'

// Store — the gem store catalog. INDEX / TABLE (ADR-233 §3.3).
// CATEGORY_STYLES (hardcoded hex) is retired; StatusChip tone-map takes its place.

type StoreItem = Database['public']['Tables']['store_items']['Row']
type StoreCategory = Database['public']['Enums']['store_category']

const CATEGORY_TONE: Record<StoreCategory, { tone: StatusTone; label: string }> = {
  cosmetic:    { tone: 'info',    label: 'Cosmetic' },
  membership:  { tone: 'info',    label: 'Membership' },
  feature:     { tone: 'warning', label: 'Feature' },
  title:       { tone: 'danger',  label: 'Title' },
  collectible: { tone: 'success', label: 'Collectible' },
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

  const columns: ColumnDef<StoreItem>[] = [
    {
      key: 'name',
      header: 'Item',
      render: (item) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {item.icon && (
              <span className="text-base leading-none" aria-hidden="true">
                {item.icon}
              </span>
            )}
            <span className="truncate text-sm font-medium text-text">{item.name}</span>
          </div>
          <span className="mt-0.5 block truncate text-xs text-subtle">{item.slug}</span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (item) => {
        const cat = CATEGORY_TONE[item.category]
        return <StatusChip tone={cat.tone}>{cat.label}</StatusChip>
      },
    },
    {
      key: 'gem_cost',
      header: 'Gem cost',
      align: 'right',
      type: 'number',
      render: (item) => (
        <span className="flex items-center justify-end gap-1 tabular-nums">
          <Gem className="h-3 w-3 shrink-0 text-primary" aria-hidden />
          {item.gem_cost.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      align: 'right',
      type: 'number',
      render: (item) => (
        <span className="tabular-nums text-muted">
          {item.stock === null ? '∞' : item.stock.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'is_active',
      header: 'Active',
      align: 'center',
      render: (item) => <ActiveToggle id={item.id} isActive={item.is_active} />,
    },
  ]

  return (
    <AdminTemplate
      title="Store"
      eyebrow="Engage"
      description="Manage gem store items, catalog, and availability."
      width="wide"
      actions={<NewItemButton />}
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Total items" value={totalItems ?? 0} icon={ShoppingBag} />
          <StatCard label="Active" value={activeItems ?? 0} icon={ToggleRight} />
          <StatCard label="Redemptions" value={totalRedemptions ?? 0} icon={Gem} />
        </div>
      </AdminSection>

      <AdminSection title={`Catalog (${rows.length})`}>
        <DataTable
          caption="Gem store catalog"
          columns={columns}
          rows={rows}
          getRowId={(item) => item.id}
          rowActions={(item) => (
            <div className="flex items-center gap-1">
              <EditItemButton item={item} />
              <DeleteItemButton id={item.id} name={item.name} />
            </div>
          )}
          empty={
            <EmptyState
              variant="first-use"
              icon={Package}
              title="No items yet"
              description="Add the first gem store item using the button above."
            />
          }
        />
      </AdminSection>
    </AdminTemplate>
  )
}
