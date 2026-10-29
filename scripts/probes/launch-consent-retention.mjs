#!/usr/bin/env node
// LIVE-1775: consent evidence for an imported list survives deletion of its Launch or source.
//
// Fails until the forward migration exists with its guarantees (launch_id detaches on delete, original
// ids kept, source bound to its Launch, evidence immutable, service_role cannot update or delete) and
// lib/database.types.ts carries launch_ref and source_ref, which only happens once it is applied.
import { readFileSync, readdirSync } from 'node:fs'

const bad = []
const file = readdirSync('supabase/migrations').find((f) => f.endsWith('_launch_consent_retention.sql'))
if (!file) bad.push('no launch_consent_retention migration')
const sql = file ? readFileSync(`supabase/migrations/${file}`, 'utf8') : ''
const has = (re, why) => { if (!re.test(sql)) bad.push(why) }
has(/alter column launch_id drop not null/, 'launch_id is still NOT NULL')
has(/launch_list_attestations_launch_id_fkey\s+foreign key \(launch_id\) references public\.space_launch\(id\) on delete set null/, 'deleting a Launch still cascades to its evidence')
has(/add column if not exists launch_ref uuid/, 'the original launch id is not kept')
has(/add column if not exists source_ref uuid/, 'the original source id is not kept')
has(/s\.launch_id = new\.launch_id/, 'a source is not bound to its Launch')
has(/consent evidence cannot be edited/, 'evidence fields can be rewritten')
has(/consent evidence cannot be deleted/, 'evidence can be deleted')
has(/revoke update, delete, truncate, trigger, references on table public\.launch_list_attestations from service_role/, 'service_role can still update or delete evidence')

const types = readFileSync('lib/database.types.ts', 'utf8')
const block = types.slice(types.indexOf('launch_list_attestations: {'), types.indexOf('launch_sources: {'))
if (!/launch_ref/.test(block) || !/source_ref/.test(block)) bad.push('lib/database.types.ts lacks launch_ref / source_ref (apply the migration, then regenerate)')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ launch consent evidence is retained, bound and immutable')
