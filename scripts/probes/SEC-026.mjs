#!/usr/bin/env node
// SEC-026: a member cannot write the privileged columns of their own profiles row. On 2026-11-19 an
// ordinary member set web_role = 'admin' through "profiles: self update" (rolled-back test, 1 row).
// Passes when a migration attaches a BEFORE UPDATE guard on profiles that freezes the staff role,
// plan, Stripe, suspension and founding columns for caller roles.
import { readdirSync, readFileSync } from 'node:fs'

const dir = new URL('../../supabase/migrations/', import.meta.url)
const guards = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(new URL(f, dir), 'utf8'))
  .filter((sql) => /create trigger \w+\s+before update on public\.profiles\s+for each row execute function public\.guard_profile_privileged_columns\(\)/.test(sql))

const must = ['web_role', 'membership_tier', 'stripe_account_id', 'stripe_charges_enabled', 'suspended_at', 'suspended_until', 'is_founding_member', 'verified_at']
const sql = guards.join('\n')
const missing = must.filter((c) => !new RegExp(`new\\.${c}\\s+is distinct from old\\.${c}`).test(sql))
if (guards.length === 0 || missing.length > 0 || !/security invoker/.test(sql)) {
  console.error(`SEC-026 FAIL: no SECURITY INVOKER update guard on profiles freezes ${missing.length ? missing.join(', ') : 'the privileged columns'}, so a member can make themselves staff from the browser`)
  process.exit(1)
}
console.log('SEC-026 ok: profiles privileged columns are frozen for caller roles')
