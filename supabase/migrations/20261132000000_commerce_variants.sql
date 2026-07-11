-- =============================================================================
-- Commerce variants + per-variant inventory (Etsy-Grade Phase 2).
--
-- The original commerce_variants table (20260815000000) + commerce_order_items.variant_id
-- were retired unused in Phase A2 (20260928000000_drop_commerce_variants) because nothing
-- ever populated them. This reintroduces a REAL variant model now that the authoring +
-- buyer + checkout paths exist to use it:
--   * a product may have 0..N variants (e.g. "Small / Blue", "Large / Red")
--   * a variant may override the product price (price_cents null = inherit product price)
--   * a variant may track its own stock (stock null = untracked / unlimited)
-- A plain product with no variants behaves exactly as before (single price + single stock).
--
-- House style (matches the commerce core): additive + idempotent (IF NOT EXISTS /
-- CREATE OR REPLACE), RLS mirrors commerce_products (public reads active listings,
-- writes go through the service-role admin client behind app-code authz — no client
-- write policy). SAFE to re-run. No em or en dashes.
--
-- NOTE (owner): like the rest of the commerce migrations, this repo file does not
-- retroactively alter the LIVE database -- apply to production (Supabase MCP /
-- dashboard) and record it, or the deployed schema stands until then.
--
-- ROLLBACK:
--   alter table public.commerce_order_items drop column if exists variant_id;
--   drop table if exists public.commerce_variants cascade;
-- =============================================================================

-- ── Variants ─────────────────────────────────────────────────────────────────
create table if not exists public.commerce_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.commerce_products(id) on delete cascade,
  -- Human label, e.g. "Small / Blue". Snapshotted onto the order item title at purchase.
  name        text not null,
  -- Structured option dimensions, e.g. {"Size":"S","Color":"Blue"} (up to ~2 dimensions).
  options     jsonb not null default '{}'::jsonb,
  -- null = inherit the product price; >= 0 = this variant's own price.
  price_cents integer check (price_cents is null or price_cents >= 0),
  -- null = untracked / unlimited; >= 0 = tracked stock (decremented on paid).
  stock       integer check (stock is null or stock >= 0),
  sku         text,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists commerce_variants_product_active_idx
  on public.commerce_variants (product_id, active);

alter table public.commerce_variants enable row level security;

drop policy if exists commerce_variants_read on public.commerce_variants;
create policy commerce_variants_read on public.commerce_variants
  for select using (
    exists (
      select 1 from public.commerce_products p
      where p.id = product_id
        and (p.status = 'active'
             or p.owner_profile_id = get_my_profile_id()
             or (p.owner_space_id is not null and public.is_space_member(p.owner_space_id)))
    )
  );
-- Writes (upsert/delete the variant set) via the service-role admin client behind the
-- Shop console authz gate. No client insert/update/delete policy by design.

comment on table public.commerce_variants is
  'Optional per-product variants (size/color/etc). price_cents null = inherit product price; stock null = untracked. Reads mirror commerce_products; writes via service role behind app authz. Etsy-Grade Phase 2.';

-- ── Re-add the order-item variant reference ──────────────────────────────────
-- ON DELETE SET NULL: retiring a variant must never orphan or destroy paid order
-- history; the item keeps its price + title snapshot and simply loses the FK.
alter table public.commerce_order_items
  add column if not exists variant_id uuid references public.commerce_variants(id) on delete set null;

-- ── Atomic stock decrement: extend to per-variant inventory ──────────────────
-- Supersedes 20260819000000's product-only version. Two passes, both under the
-- per-order lock + idempotency marker (metadata.inventory_decremented):
--   1. items carrying a variant_id whose VARIANT tracks stock -> decrement the variant
--   2. items with NO variant_id whose PRODUCT tracks stock     -> decrement the product
-- Untracked rows (stock is null) at either level are skipped and stay unlimited. A
-- variant-selected item NEVER touches the product's own stock (the variant governs).
-- Still raises out_of_stock (P0001) on insufficient stock so concurrent checkouts
-- cannot oversell; still idempotent per order (a retried settle no-ops).
create or replace function public.decrement_commerce_stock_atomic(
  _order uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_already boolean;
  v_rec     record;
begin
  if _order is null then
    raise exception 'invalid_order' using errcode = 'P0001';
  end if;

  select coalesce((metadata->>'inventory_decremented')::boolean, false)
    into v_already
    from public.commerce_orders
   where id = _order
   for update;

  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_already then
    return;  -- already decremented for this order; no-op (idempotent)
  end if;

  -- Pass 1: variant-tracked items. Lock each tracked variant, decrement or fail.
  for v_rec in
    select oi.variant_id as variant_id, sum(oi.qty)::integer as need
      from public.commerce_order_items oi
      join public.commerce_variants v on v.id = oi.variant_id
     where oi.order_id = _order
       and oi.variant_id is not null
       and v.stock is not null
     group by oi.variant_id
  loop
    update public.commerce_variants
       set stock = stock - v_rec.need
     where id = v_rec.variant_id
       and stock >= v_rec.need;

    if not found then
      raise exception 'out_of_stock' using errcode = 'P0001';
    end if;
  end loop;

  -- Pass 2: product-tracked items WITHOUT a variant. A variant-selected item is handled
  -- above and must not also decrement product stock, hence variant_id is null here.
  for v_rec in
    select oi.product_id as product_id, sum(oi.qty)::integer as need
      from public.commerce_order_items oi
      join public.commerce_products p on p.id = oi.product_id
     where oi.order_id = _order
       and oi.variant_id is null
       and oi.product_id is not null
       and p.stock is not null
     group by oi.product_id
  loop
    update public.commerce_products
       set stock = stock - v_rec.need
     where id = v_rec.product_id
       and stock >= v_rec.need;

    if not found then
      raise exception 'out_of_stock' using errcode = 'P0001';
    end if;
  end loop;

  update public.commerce_orders
     set metadata = metadata || jsonb_build_object('inventory_decremented', true)
   where id = _order;
end;
$$;

revoke execute on function public.decrement_commerce_stock_atomic(uuid) from public, anon, authenticated;
grant execute on function public.decrement_commerce_stock_atomic(uuid) to service_role;

comment on function public.decrement_commerce_stock_atomic(uuid) is
  'Atomic per-order stock decrement for paid commerce orders. Decrements the VARIANT stock for variant-selected items, else the PRODUCT stock; skips untracked (null) rows; raises out_of_stock (P0001) on insufficient stock; idempotent via metadata.inventory_decremented. service_role only. Etsy-Grade Phase 2 (supersedes ADR-39X product-only).';
