-- =============================================================================
-- Covering B-tree indexes for unindexed foreign keys (PUBLIC schema, Frequency).
--
-- The `unindexed_foreign_keys` performance advisor flags FK columns that have no
-- backing index: every such FK forces a sequential scan on the referencing table
-- whenever the referenced row is updated or deleted (and on FK-keyed joins), so
-- the advisor surfaces them as a latency / lock-contention risk. This migration
-- adds one covering single-column B-tree index per flagged FK to clear them.
--
-- SCOPE: PUBLIC-schema Frequency tables ONLY. The FKs belonging to the
-- `resonance` DJ-app schema (and the `onesky` / `energetics` app schemas) are
-- intentionally EXCLUDED here -- those apps are being extracted separately and
-- own their own indexing. Note that public.resonance_matches below is the
-- Frequency matching engine living in the PUBLIC schema (NOT the `resonance` DJ
-- schema), so indexing it here is correct.
--
-- ADDITIVE + idempotent: every statement is `create index if not exists`, so the
-- migration is SAFE to re-run and creates nothing twice. Plain (non-concurrent)
-- index builds are used deliberately because this migration runs inside a
-- transaction; `create index concurrently` cannot run in a transaction block.
--
-- NOTE (owner): this repo migration does not touch the LIVE database. It will be
-- applied separately to production via Supabase MCP. No em or en dashes above.
-- =============================================================================

-- commerce_order_items
create index if not exists commerce_order_items_product_id_idx on public.commerce_order_items (product_id);
create index if not exists commerce_order_items_variant_id_idx on public.commerce_order_items (variant_id);

-- commerce_orders
create index if not exists commerce_orders_entity_id_idx on public.commerce_orders (entity_id);

-- commerce_products
create index if not exists commerce_products_booking_space_id_idx on public.commerce_products (booking_space_id);
create index if not exists commerce_products_entity_id_idx on public.commerce_products (entity_id);

-- listing_saves
create index if not exists listing_saves_listing_id_idx on public.listing_saves (listing_id);

-- listings
create index if not exists listings_entity_id_idx on public.listings (entity_id);

-- marketplace_reports
create index if not exists marketplace_reports_reporter_id_idx on public.marketplace_reports (reporter_id);

-- menu_settings
create index if not exists menu_settings_updated_by_idx on public.menu_settings (updated_by);

-- playbook_runs
create index if not exists playbook_runs_actor_profile_id_idx on public.playbook_runs (actor_profile_id);

-- pricing_feature_gates
create index if not exists pricing_feature_gates_updated_by_idx on public.pricing_feature_gates (updated_by);

-- pricing_settings
create index if not exists pricing_settings_updated_by_idx on public.pricing_settings (updated_by);

-- pricing_stripe_prices
create index if not exists pricing_stripe_prices_updated_by_idx on public.pricing_stripe_prices (updated_by);

-- resonance_matches (Frequency matching engine, public schema -- not the DJ app)
create index if not exists resonance_matches_b_pid_idx on public.resonance_matches (b_pid);

-- space_function_type_defaults
create index if not exists space_function_type_defaults_updated_by_idx on public.space_function_type_defaults (updated_by);
