import { createHash } from 'node:crypto'

const refuse = message => { throw Error(message) }
const literal = value => `'${String(value).replaceAll("'", "''")}'`
export const migrationDigest = value => createHash('sha256').update(value).digest('hex')

// Split only at SQL-level semicolons. Quotes, nested comments and dollar-quoted PL/pgSQL
// bodies remain opaque. Ambiguous/unsupported input refuses rather than guessing.
export function migrationStatements(sql) {
  if (typeof sql !== 'string' || !sql.trim() || sql.includes('\0') || Buffer.byteLength(sql) > 2_000_000) refuse('Unsupported SQL input')
  const statements = []; let statement = '', mode = '', depth = 0, dollar = ''
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i], next = sql[i + 1]
    if (mode === 'line') { if (c === '\n' || c === '\r') { mode = ''; statement += '\n' }; continue }
    if (mode === 'comment') {
      if (c === '/' && next === '*') { depth++; i++ }
      else if (c === '*' && next === '/') { if (--depth === 0) { mode = ''; statement += ' ' }; i++ }
      continue
    }
    if (mode === 'dollar') {
      if (sql.startsWith(dollar, i)) { statement += dollar; i += dollar.length - 1; mode = '' }
      else statement += c
      continue
    }
    if (mode === 'single' || mode === 'double') {
      statement += c
      const quote = mode === 'single' ? "'" : '"'
      if (c === '\\' && mode === 'single') { refuse('Backslash string escapes are unsupported') }
      if (c === quote) { if (next === quote) { statement += next; i++ } else mode = '' }
      continue
    }
    if (c === '-' && next === '-') { mode = 'line'; i++; continue }
    if (c === '/' && next === '*') { mode = 'comment'; depth = 1; i++; continue }
    if (c === "'" || c === '"') { mode = c === "'" ? 'single' : 'double'; statement += c; continue }
    const tag = c === '$' ? /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))?.[0] : null
    // PostgreSQL permits dollars inside unquoted identifiers. Treating a$tag$ as
    // a string would hide an executable COMMIT from us. Refuse every ambiguous $
    // and accept tags only after a small, explicit set of ASCII separators.
    if (c === '$') {
      if (!tag || (i > 0 && !/[ \t\r\n\f\v(,=]/.test(sql[i - 1]))) refuse('Ambiguous SQL dollar token')
      mode = 'dollar'; dollar = tag; statement += tag; i += tag.length - 1; continue
    }
    if (c === '\\') refuse('psql metacommands are unsupported')
    if (c === ';') { if (statement.trim()) statements.push(statement.trim()); statement = '' } else statement += c
  }
  if (mode && mode !== 'line') refuse('Unterminated SQL quote or comment')
  if (statement.trim()) statements.push(statement.trim())
  if (!statements.length) refuse('Empty migration')
  return statements
}

export function migrationBody(sql) {
  const statements = migrationStatements(sql)
  if (/^begin$/i.test(statements[0])) {
    if (!/^commit$/i.test(statements.at(-1))) refuse('Outer transaction is incomplete')
    statements.shift(); statements.pop()
  }
  if (!statements.length) refuse('Empty migration body')
  const forbidden = /^(?:begin|commit|end|abort|rollback|savepoint|release|start\s+transaction|set|reset|discard|prepare\s+transaction|vacuum|copy|alter\s+system)\b/i
  for (const statement of statements) {
    if (forbidden.test(statement) || /^create\s+(?:unique\s+)?index\s+concurrently\b/i.test(statement)) refuse('Unsupported top-level SQL control')
  }
  return statements.join(';\n') + ';'
}

export function normalizedLedger(rows) {
  if (!Array.isArray(rows) || rows.length < 400) refuse('Unknown production ledger')
  const normalized = rows.map(row => {
    if (!/^\d{14}$/.test(row?.version) || !/^[A-Za-z0-9_.-]+$/.test(row?.name)) refuse('Malformed production ledger')
    return [row.version, row.name]
  }).sort((a, b) => a[0].localeCompare(b[0]))
  if (new Set(normalized.map(row => row[0])).size !== normalized.length) refuse('Duplicate production ledger version')
  return normalized
}

export function migrationTransaction({ sql, version, name, sha256, ledger }) {
  if (!/^\d{14}$/.test(version) || !/^[A-Za-z0-9_.-]+$/.test(name) || !/^[a-f0-9]{64}$/.test(sha256) || migrationDigest(sql) !== sha256) refuse('Migration binding mismatch')
  const expected = normalizedLedger(ledger)
  if (expected.some(row => row[0] === version)) refuse('Version already recorded')
  const body = migrationBody(sql)
  // A table lock also serializes manual/legacy ledger writers that do not take our advisory lock.
  return `begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';
select pg_advisory_xact_lock(hashtextextended('frequency-reviewed-migration-apply', 0));
lock table supabase_migrations.schema_migrations in exclusive mode;
do $frequency_ledger_guard$
declare actual jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_array(version, coalesce(name, '')) order by version), '[]'::jsonb)
    into actual from supabase_migrations.schema_migrations;
  if actual is distinct from ${literal(JSON.stringify(expected))}::jsonb then
    raise exception 'Production migration ledger changed';
  end if;
end;
$frequency_ledger_guard$;
${body}
insert into supabase_migrations.schema_migrations(version, name) values (${literal(version)}, ${literal(name)});
commit;`
}
