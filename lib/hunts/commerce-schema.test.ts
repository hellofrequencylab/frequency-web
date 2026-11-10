// FH-036..047 source-shape guard for supabase/migrations/20270346041000_hunt_commerce.sql. It cannot prove
// the SQL runs; it proves a later edit has not dropped what the money storage exists for.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join('supabase', 'migrations', '20270346041000_hunt_commerce.sql'), 'utf8')
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').toLowerCase()

const TABLES = [
  'hunt_commerce_state', 'hunt_commerce_audit', 'hunt_pass_bindings', 'hunt_store_offers', 'hunt_entitlements',
  'hunt_entitlement_events', 'hunt_refund_cases', 'hunt_commerce_intents', 'hunt_reconciliation',
  'hunt_donation_asks', 'hunt_donation_gifts', 'hunt_sponsor_agreements', 'hunt_sponsor_snapshots', 'hunt_sponsor_settlements',
]

describe('Hunt commerce schema', () => {
  it.each(TABLES)('%s exists and is service role only', (t) => {
    expect(code).toContain(`create table if not exists public.${t} (`)
    expect(code).toContain(`alter table public.${t} enable row level security;`)
    expect(code).toContain(`revoke all on table public.${t} from public, anon, authenticated;`)
    expect(code).toContain(`grant all on public.${t} to service_role;`)
  })
  it('revokes browser roles and creates no policy', () => {
    expect(code).not.toContain('create policy')
  })
  it('one benefit per source, unit and code', () => {
    expect(code).toContain('unique (source_type, source_id, unit_key, benefit_code)')
    expect(code).toContain('unique (semantic_key)')
  })
  it('consume and reverse take the row lock, so they serialize', () => {
    const consume = code.slice(code.indexOf('function public.hunt_entitlement_consume'), code.indexOf('function public.hunt_entitlement_reverse'))
    expect(consume).toContain('for update')
    const reverse = code.slice(code.indexOf('function public.hunt_entitlement_reverse'), code.indexOf('function public.hunt_commerce_set_sales'))
    expect(reverse).toContain('for update')
  })
  it('an older paid delivery cannot reopen a revoked benefit', () => {
    expect(code).toContain("if r.state = 'revoked' then return 'refused_revoked'")
  })
  it('a consumed benefit opens a case and is never reopened', () => {
    expect(code).toContain("if r.state = 'consumed' then")
    expect(code).toContain('insert into public.hunt_refund_cases')
  })
  it('a binding is frozen and one pass per tier', () => {
    expect(code).toContain('hunt_pass_binding_freeze')
    expect(code).toContain('create unique index if not exists hunt_pass_bindings_one_active_tier')
  })
  it('the sponsor snapshot and settlement are once-only', () => {
    expect(code).toMatch(/hunt_sponsor_snapshots[\s\S]*?unique \(agreement_id\)/)
    expect(code).toMatch(/hunt_sponsor_settlements[\s\S]*?unique \(snapshot_id\)/)
    expect(code).toContain('unique (hunt_id)') // one cap per Hunt
  })
  it('the donation ask and sponsor agreement need an approver before they can be live', () => {
    expect(code).toContain('check (not enabled or (approved_at is not null and approved_by is not null))')
    expect(code).toContain("status <> 'active' or (approved_at is not null and approved_by is not null)")
  })
  it('does not touch a ticket, an order or a donation', () => {
    expect(code).not.toMatch(/(insert into|update|delete from) public\.(event_tickets|commerce_orders|space_donations|event_rsvps)/)
  })
})
