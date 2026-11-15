import { pathToFileURL } from 'node:url'
export const PROJECT = 'azsqfeonabsbmemvddqd'
export const METADATA = `select current_user::text as role, current_setting('transaction_read_only') = 'on' as transaction_read_only,
(select count(*)::int from supabase_migrations.schema_migrations) as ledger_count,
exists(select 1 from supabase_migrations.schema_migrations where version='20270346050000') as target_recorded,
to_regclass('public.analytics_experiments') is not null as experiments_exist,
to_regclass('public.analytics_experiment_assignments') is not null as assignments_exist,
has_schema_privilege(current_user,'public','CREATE') as public_create,
has_schema_privilege(current_user,'supabase_migrations','USAGE') as ledger_schema_usage,
has_table_privilege(current_user,'supabase_migrations.schema_migrations','INSERT') as ledger_insert,
has_table_privilege(current_user,'supabase_migrations.schema_migrations','UPDATE') as ledger_update,
has_table_privilege(current_user,'supabase_migrations.schema_migrations','DELETE') as ledger_delete,
has_table_privilege(current_user,'public.consent_records','TRIGGER') as consent_trigger,
exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='supabase_migrations' and c.relname='schema_migrations' and pg_has_role(current_user,c.relowner,'USAGE')) as ledger_owner,
exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='consent_records' and pg_has_role(current_user,c.relowner,'USAGE')) as consent_owner`
export const MULTI = 'begin read only; select 1 as diagnostic_value; rollback;'
const BOOLS = ['transaction_read_only','target_recorded','experiments_exist','assignments_exist','public_create','ledger_schema_usage','ledger_insert','ledger_update','ledger_delete','consent_trigger','ledger_owner','consent_owner']
export function safeResult(status, body) {
  if (status < 200 || status >= 300) {
    const knownState = /^(?:02|08|0A|22|23|25|28|2D|3D|3F|40|42|53|54|55|57|58|XX)[0-9A-Z]{3}$/
    const messages = [body?.message, body?.error?.message].filter(value => typeof value === 'string').map(value => value.slice(0, 8192)).join(' ')
    const fields = [body?.code, body?.error?.code]
    const code = fields.find(value => typeof value === 'string' && knownState.test(value)) ?? (messages.match(/\b(?:02|08|0A|22|23|25|28|2D|3D|3F|40|42|53|54|55|57|58|XX)[0-9A-Z]{3}\b/)?.[0] ?? null)
    const permission = status === 401 || status === 403 || code === '42501' || code?.startsWith('28') || /permission denied|not authorized/i.test(messages)
    return { httpStatus: status, sqlState: code, category: permission ? 'permission' : code ? 'database' : 'provider' }
  }
  const first = Array.isArray(body) ? body[0] : null
  if (!first || typeof first !== 'object') return { httpStatus: status, category: 'success_no_metadata' }
  const result = { httpStatus: status, category: 'success' }
  if (typeof first.role === 'string' && /^[a-z_][a-z0-9_]{0,62}$/.test(first.role)) result.role = first.role
  if (Number.isSafeInteger(first.ledger_count) && first.ledger_count >= 0 && first.ledger_count < 100000) result.ledgerCount = first.ledger_count
  for (const key of BOOLS) if (typeof first[key] === 'boolean') result[key] = first[key]
  if (first.diagnostic_value === 1) result.multiStatementSelect = true
  return result
}
export async function diagnose(env, fetcher = fetch) {
  if (env.SUPABASE_PROJECT_REF !== PROJECT || !env.SUPABASE_ACCESS_TOKEN) throw Error('Canonical diagnostic configuration missing')
  const results = []
  for (const [name, query, readOnly] of [['metadata_readonly',METADATA,true],['metadata_transport_false',METADATA,false],['multi_statement_readonly',MULTI,true],['multi_statement_transport_false',MULTI,false]]) {
    try {
      const response = await fetcher(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, { method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only:readOnly}),redirect:'error',signal:AbortSignal.timeout(30000) })
      let body;try { body=await response.json() } catch { body=null }
      results.push({name,...safeResult(response.status,body)})
    } catch { results.push({name,category:'transport_unavailable'}) }
  }
  return results
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await diagnose(process.env))) } catch { console.error('Read-only diagnostic configuration refused');process.exitCode=1 }
}
