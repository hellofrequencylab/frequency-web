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

// Store — the Vault Store catalog. INDEX / TABLE (ADR-233 §3.3).
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

  // ── THE FULFILLMENT QUEUE (backlog LIVE-013) ────────────────────────────────────────────────
  //
  // `classifyRedemption` routes a feature/membership SKU to `{ kind: 'pending' }` — "the
  // store_redemptions row IS the fulfillment record an operator acts on". That was true of the
  // row and false of the operator: nothing in /manage or /admin ever listed those rows, so the
  // only place a paid perk existed was a "Recorded ✓" flash on the member's own screen. Measured
  // against production 2026-08-17: one Guest Pass, 150 Gems, bought 2026-06-27, never surfaced.
  //
  // READ-ONLY on purpose. Marking one honored needs a column `store_redemptions` does not have;
  // the ALTER is proposed in docs/proposals/LIVE-013-cosmetic-fulfillment.sql and is the owner's
  // to apply. A queue that shows the work is the part that needed no schema, and shipping it now
  // beats shipping nothing while the column waits.
  const { data: redemptionRows } = await admin
    .from('store_redemptions')
    .select('id, redeemed_at, gems_spent, store_items!item_id ( slug, name, category ), profiles!profile_id ( handle, display_name )')
    .gt('gems_spent', 0)
    .order('redeemed_at', { ascending: true })
    .limit(500)

  type QueueRow = {
    id: string
    redeemed_at: string
    gems_spent: number
    store_items: { slug: string; name: string; category: StoreCategory } | null
    profiles: { handle: string | null; display_name: string | null } | null
  }

  // Only the perks a PERSON delivers. A cosmetic/title applies itself, a collectible is the chip
  // in the member's collection, and `streak-freeze` banks its own token in-app (ADR-305).
  const queue = ((redemptionRows ?? []) as unknown as QueueRow[]).filter(
    (r) =>
      r.store_items !== null &&
      (r.store_items.category === 'feature' || r.store_items.category === 'membership') &&
      r.store_items.slug !== 'streak-freeze',
  )

  const queueColumns: ColumnDef<QueueRow>[] = [
    {
      key: 'member',
      header: 'Member',
      render: (r) => (
        <div className="min-w-0">
          <span className="truncate text-body-sm font-medium text-text">{r.profiles?.display_name ?? 'Unknown member'}</span>
          {r.profiles?.handle && <span className="mt-0.5 block truncate text-meta text-subtle">@{r.profiles.handle}</span>}
        </div>
      ),
    },
    {
      key: 'item',
      header: 'Owed',
      render: (r) => (
        <div className="min-w-0">
          <span className="truncate text-body-sm text-text">{r.store_items?.name}</span>
          <span className="mt-0.5 block truncate text-meta text-subtle">{r.store_items?.slug}</span>
        </div>
      ),
    },
    {
      key: 'gems_spent',
      header: 'Gems paid',
      align: 'right',
      type: 'number',
      render: (r) => (
        <span className="flex items-center justify-end gap-1 tabular-nums">
          <Gem className="h-3 w-3 shrink-0 text-primary" aria-hidden />
          {r.gems_spent.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'redeemed_at',
      header: 'Waiting since',
      render: (r) => (
        <span className="text-meta text-muted">
          {new Date(r.redeemed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
        </span>
      ),
    },
  ]

  const columns: ColumnDef<StoreItem>[] = [
    {
      key: 'name',
      header: 'Item',
      render: (item) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {item.icon && (
              <span className="text-body leading-none" aria-hidden="true">
                {item.icon}
              </span>
            )}
            <span className="truncate text-body-sm font-medium text-text">{item.name}</span>
          </div>
          <span className="mt-0.5 block truncate text-meta text-subtle">{item.slug}</span>
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
      description="Manage Vault Store items, catalog, and availability."
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
          caption="Vault Store catalog"
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
              description="Add the first Vault Store item using the button above."
            />
          }
        />
      </AdminSection>

      <AdminSection
        title={`To honor (${queue.length})`}
        description="Perks a member already paid Gems for that a person has to hand over: a guest pass, a seat at the table, a name on a node. Oldest first."
      >
        <DataTable
          caption="Redeemed perks awaiting fulfillment"
          columns={queueColumns}
          rows={queue}
          getRowId={(r) => r.id}
          empty={
            <EmptyState
              variant="first-use"
              icon={Package}
              title="Nothing waiting"
              description="No member is owed a hand-delivered perk right now."
            />
          }
        />
      </AdminSection>
    </AdminTemplate>
  )
}
