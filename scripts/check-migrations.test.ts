import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  LEDGER_ENV,
  ledgerCheck,
  menuWritesMissingNote,
  parseArgs,
  resolveLedgerSource,
  stripSqlComments,
} from './check-migrations.mjs'
import { MIN_ROWS } from './maintenance/ledger-parity.mjs'

// The MENU CACHE rule (ADR-973). All 18 Menu Manager mutations end with
// `revalidatePath('/', 'layout')`; raw SQL cannot. `app/(marketing)/layout.tsx` reads the header
// and footer menus while deliberately avoiding cookies()/getUser() so those pages stay STATIC, so
// a menu reseed leaves them holding the old rail until ISR rolls (revalidate = 3600).
//
// A gate cannot make a .sql file call a Next.js cache API. It can refuse a migration that does not
// state its own consequence, which is what this rule does.

const read = (map: Record<string, string>) => (f: string) => map[f] ?? ''

describe('menuWritesMissingNote', () => {
  it('flags a menu write with no note', () => {
    const files = { 'a.sql': "insert into menu_items (label) values ('X');" }
    expect(menuWritesMissingNote(Object.keys(files), read(files))).toEqual(['a.sql'])
  })

  it('accepts one that carries the note', () => {
    const files = { 'a.sql': "-- MENU CACHE: deploy after applying.\ninsert into menu_items (label) values ('X');" }
    expect(menuWritesMissingNote(Object.keys(files), read(files))).toEqual([])
  })

  it('covers update and delete, not just insert', () => {
    const files = {
      'u.sql': "update public.menus set label = 'X';",
      'd.sql': 'delete from menu_categories where id = 1;',
    }
    expect(menuWritesMissingNote(Object.keys(files), read(files)).sort()).toEqual(['d.sql', 'u.sql'])
  })

  it('covers every seeded menu table', () => {
    const tables = ['menus', 'menu_items', 'menu_categories', 'menu_settings', 'menu_rail_cards']
    for (const t of tables) {
      const files = { 'x.sql': `insert into ${t} (a) values (1);` }
      expect(menuWritesMissingNote(Object.keys(files), read(files)), t).toEqual(['x.sql'])
    }
  })

  it('does not count a menu write inside a rollback comment', () => {
    // Migrations here carry DOWN scripts in comments. A write that cannot run is not a write --
    // the same blind spot check-grants.mjs hit with a commented-out DROP TABLE (ADR-965).
    const files = {
      'a.sql': "-- ROLLBACK:\n-- delete from menu_items where id = 1;\ncreate table x (id int);",
      'b.sql': "/* down:\n  insert into menus (label) values ('X');\n*/\ncreate table y (id int);",
    }
    expect(menuWritesMissingNote(Object.keys(files), read(files))).toEqual([])
  })

  it('ignores a migration that does not touch menus at all', () => {
    const files = { 'a.sql': 'create table profiles (id uuid);' }
    expect(menuWritesMissingNote(Object.keys(files), read(files))).toEqual([])
  })

  it('does not match a table that merely starts with a menu table name', () => {
    // `menu_items_archive` is a different table; the word boundary is what keeps this honest.
    const files = { 'a.sql': 'insert into menu_items_archive (a) values (1);' }
    expect(menuWritesMissingNote(Object.keys(files), read(files))).toEqual([])
  })
})

describe('stripSqlComments', () => {
  it('preserves length, so nothing shifts', () => {
    const src = "-- a\ninsert into menu_items (x) values (1);\n/* b */\n"
    expect(stripSqlComments(src)).toHaveLength(src.length)
  })

  it('blanks both comment forms', () => {
    expect(stripSqlComments('-- x\n/* y */')).not.toMatch(/[xy]/)
  })
})

// ── Rule 4: the LEDGER HEAD comparison. ────────────────────────────────────────────────────────
//
// Owner ruling: repo/DB divergence must fail this guard DIRECTLY, instead of depending on
// hand-refrozen digests in scripts/maintenance/ledger-parity.test.ts. That pin had to be
// re-frozen three times in a day, and a digest re-read from the repo only ever asserts that the
// repo agrees with itself.
//
// The happy path is the cheap half. What earns this suite its keep is the other three:
//   · it FAILS when the two sides disagree, on both the extra-row and orphan-pair shapes;
//   · it SKIPS LOUDLY, never silently, when there is no database (CI's normal state);
//   · every way of NOT being able to look — half-armed credentials, an HTTP error, an error
//     payload, a collapsed read — is a FAILURE and not a fallback to the skip.
//
// No live database: the fetch and the readdir are both injected seams.

type Row = { version: string; name: string }
const row = (version: string, name: string): Row => ({ version, name })

/** A corpus comfortably above MIN_ROWS, so the floor never fires on a parity case. */
function corpus(n = MIN_ROWS + 50): Row[] {
  return Array.from({ length: n }, (_, i) => row(String(20250101000000 + i * 100), `migration_${i}`))
}
const files = (rows: Row[]) => rows.map((r) => `${r.version}_${r.name}.sql`)

/** Drive ledgerCheck with a synthetic repo tree and a synthetic ledger payload. */
const run = (repo: Row[], ledger: unknown, extra: Record<string, unknown> = {}) =>
  ledgerCheck({
    env: { [LEDGER_ENV.TOKEN]: 'tok', [LEDGER_ENV.REF]: 'ref' },
    argv: [],
    total: repo.length,
    io: {
      repo: { readdir: () => files(repo) },
      fetch: async () => ({ ok: true, json: async () => ledger, text: async () => '' }),
    },
    ...extra,
  })

describe('resolveLedgerSource — what "no ledger" is allowed to mean', () => {
  it('no credentials at all resolves to a skippable absence', () => {
    expect(resolveLedgerSource({ env: {}, argv: [] }).kind).toBe('none')
  })

  it('both credentials resolve to a live read', () => {
    const s = resolveLedgerSource({
      env: { [LEDGER_ENV.TOKEN]: 'tok', [LEDGER_ENV.REF]: 'ref' },
      argv: [],
    })
    expect(s).toMatchObject({ kind: 'api', token: 'tok', ref: 'ref' })
  })

  it('HALF the credentials is its own state, not an absence', () => {
    // The distinction is the whole point: someone armed this and it silently stopped comparing.
    // Collapsing it into `none` would turn a config bug into a permanent, invisible skip.
    expect(resolveLedgerSource({ env: { [LEDGER_ENV.TOKEN]: 'tok' }, argv: [] })).toMatchObject({
      kind: 'partial',
      present: LEDGER_ENV.TOKEN,
      missing: LEDGER_ENV.REF,
    })
    expect(resolveLedgerSource({ env: { [LEDGER_ENV.REF]: 'ref' }, argv: [] })).toMatchObject({
      kind: 'partial',
      present: LEDGER_ENV.REF,
      missing: LEDGER_ENV.TOKEN,
    })
  })

  it('a pre-fetched payload wins over credentials, from either the flag or the env var', () => {
    const env = { [LEDGER_ENV.TOKEN]: 'tok', [LEDGER_ENV.REF]: 'ref' }
    expect(resolveLedgerSource({ env, argv: ['--ledger', 'l.json'] })).toMatchObject({
      kind: 'file',
      path: 'l.json',
    })
    expect(resolveLedgerSource({ env: { ...env, [LEDGER_ENV.FILE]: 'e.json' }, argv: [] })).toMatchObject({
      kind: 'file',
      path: 'e.json',
    })
  })

  it('parses the flags it is given and nothing it is not', () => {
    expect(parseArgs([])).toEqual({ ledgerFile: undefined, requireLedger: false, noLedger: false })
    expect(parseArgs(['--require-ledger', '--no-ledger', '--ledger', 'x.json'])).toEqual({
      ledgerFile: 'x.json',
      requireLedger: true,
      noLedger: true,
    })
  })
})

describe('with NO database, it skips LOUDLY — never silently, never vacuously', () => {
  it('reports skipped, exits clean, and says so at the top of the message', async () => {
    const r = await ledgerCheck({ env: {}, argv: [], total: 605 })
    expect(r.status).toBe('skipped')
    expect(r.ok).toBe(true)
    expect(r.lines.join('\n')).toContain('LEDGER COMPARISON SKIPPED')
  })

  it('states what it DID prove and what it did NOT, so the line cannot be misread either way', async () => {
    // A bare "skipped" reads as either "the guard is broken" or "the database was checked".
    // Naming both halves is what makes it actionable rather than noise to scroll past.
    const out = (await ledgerCheck({ env: {}, argv: [], total: 605 })).lines.join('\n')
    expect(out).toContain('PROVED from the tree: 605 migration(s)')
    expect(out).toContain('NOT PROVED')
    expect(out).toContain(LEDGER_ENV.TOKEN)
    expect(out).toContain(LEDGER_ENV.REF)
    expect(out).toContain('--require-ledger')
  })

  it('--require-ledger turns the skip into a FAILURE', async () => {
    // For any environment that is supposed to have a database and must prove it.
    const r = await ledgerCheck({ env: {}, argv: ['--require-ledger'], total: 605 })
    expect(r.status).toBe('error')
    expect(r.ok).toBe(false)
  })

  it('--no-ledger is a deliberate opt-out, and contradicting it is an error', async () => {
    expect((await ledgerCheck({ env: {}, argv: ['--no-ledger'], total: 605 })).status).toBe('skipped')
    const r = await ledgerCheck({ env: {}, argv: ['--no-ledger', '--require-ledger'], total: 605 })
    expect(r.status).toBe('error')
    expect(r.ok).toBe(false)
  })
})

describe('with a database, divergence FAILS the guard', () => {
  it('passes when the two sides are the same set', async () => {
    const repo = corpus()
    const r = await run(repo, { result: repo })
    expect(r.status).toBe('parity')
    expect(r.ok).toBe(true)
    expect(r.lines.join('\n')).toContain('✅')
  })

  it('FAILS on a ledger row the repo does not record — the live 2026-08-12 shape', async () => {
    // Exactly what production looked like when this rule was written: 605 repo files, 606 applied
    // rows, the extra one applied through MCP and never committed. check:migrations was green.
    const repo = corpus()
    const ledger = [...repo, row('20270224000100', 'revoke_friendships_freeze_identity_execute')]
    const r = await run(repo, { result: ledger })
    expect(r.status).toBe('drift')
    expect(r.ok).toBe(false)
    expect(r.result!.unpairedLedger.map((x) => x.version)).toEqual(['20270224000100'])
    expect(r.lines.join('\n')).toContain('the repo DOES NOT RECORD')
  })

  it('FAILS on a repo file that was never applied', async () => {
    const base = corpus()
    const r = await run([...base, row('20270301000000', 'authored_never_applied')], { result: base })
    expect(r.status).toBe('drift')
    expect(r.lines.join('\n')).toContain('authored but NEVER APPLIED')
  })

  it('FAILS on the wall-clock ORPHAN PAIR, where both counts still match', async () => {
    // The defect that has recurred four times. Counts are equal on both sides, which is precisely
    // why a count-only comparison — or a re-frozen digest — misses it.
    const base = corpus()
    const NAME = 'fk_indexes_and_billing_policy_merge'
    const r = await run([...base, row('20270220000000', NAME)], {
      result: [...base, row('20260811003019', NAME)],
    })
    expect(r.status).toBe('drift')
    expect(r.result!.repoCount).toBe(r.result!.ledgerCount)
    expect(r.lines.join('\n')).toContain('ORPHAN PAIR')
    expect(r.lines.join('\n')).toContain("set version = '20270220000000'")
  })

  it('FAILS on a name-only difference, where the version sets are identical', async () => {
    const base = corpus()
    const r = await run([...base, row('20270220000000', 'add_billing_policy')], {
      result: [...base, row('20270220000000', 'add_billing_policies')],
    })
    expect(r.status).toBe('drift')
    expect(r.lines.join('\n')).toContain('applied under a DIFFERENT NAME')
  })

  it('needs no pinned count or digest to detect any of it', async () => {
    // The regression this rule replaces. The old guard compared the repo against numbers a human
    // re-froze by hand after every apply; this one reads both sides at run time, so growing the
    // corpus by one is not an edit to a test file.
    const grown = corpus(MIN_ROWS + 400)
    expect((await run(grown, { result: grown })).status).toBe('parity')
    expect((await run(grown, { result: grown.slice(0, -1) })).status).toBe('drift')
  })
})

describe('every way of not being able to LOOK is a failure, never a skip', () => {
  it('half-armed credentials fail rather than degrading to the skip path', async () => {
    const r = await ledgerCheck({ env: { [LEDGER_ENV.TOKEN]: 'tok' }, argv: [], total: 605 })
    expect(r.status).toBe('error')
    expect(r.ok).toBe(false)
    expect(r.lines.join('\n')).toContain('HALF-ARMED')
    expect(r.lines.join('\n')).not.toContain('SKIPPED')
  })

  it('an HTTP error from the Management API fails', async () => {
    const repo = corpus()
    const r = await run(repo, null, {
      io: {
        repo: { readdir: () => files(repo) },
        fetch: async () => ({ ok: false, status: 401, text: async () => 'invalid access token' }),
      },
    })
    expect(r.status).toBe('error')
    expect(r.lines.join('\n')).toContain('401')
  })

  it('an error PAYLOAD fails instead of parsing as an empty ledger', async () => {
    // An empty ledger is the one input that would sail through compare() looking clean.
    const r = await run(corpus(), { message: 'invalid access token' })
    expect(r.status).toBe('error')
    expect(r.lines.join('\n')).toContain('ledger query failed')
  })

  it('a collapsed read on either side fails on the floor rather than reporting parity', async () => {
    expect((await run(corpus(), { result: [] })).status).toBe('error')
    expect((await run([], { result: corpus() })).status).toBe('error')
  })

  it('a thrown fetch fails', async () => {
    const repo = corpus()
    const r = await run(repo, null, {
      io: {
        repo: { readdir: () => files(repo) },
        fetch: async () => {
          throw new Error('ECONNREFUSED')
        },
      },
    })
    expect(r.status).toBe('error')
    expect(r.lines.join('\n')).toContain('could not RUN')
  })

  it('never answers "fine" when it could not look', async () => {
    // The one invariant that matters: no unreachable-database path may return ok === true with a
    // status that reads as a comparison having happened.
    const repo = corpus()
    const broken = [
      run(repo, { message: 'boom' }),
      run(repo, { result: [] }),
      ledgerCheck({ env: { [LEDGER_ENV.REF]: 'ref' }, argv: [], total: 605 }),
    ]
    for (const p of broken) {
      const r = await p
      expect(r.ok).toBe(false)
      expect(['parity', 'skipped']).not.toContain(r.status)
    }
  })
})

describe('the guard is read-only against production', () => {
  it('sends LEDGER_QUERY and nothing else', async () => {
    const repo = corpus()
    const sent: string[] = []
    await ledgerCheck({
      env: { [LEDGER_ENV.TOKEN]: 'tok', [LEDGER_ENV.REF]: 'ref' },
      argv: [],
      total: repo.length,
      io: {
        repo: { readdir: () => files(repo) },
        fetch: async (_url: string, init: { body: string }) => {
          sent.push(JSON.parse(init.body).query)
          return { ok: true, json: async () => ({ result: repo }), text: async () => '' }
        },
      },
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].trim().toLowerCase().startsWith('select ')).toBe(true)
    expect(sent[0]).not.toMatch(/\b(insert|update|delete|drop|alter|create|truncate)\b/i)
    expect(sent[0]).toContain('supabase_migrations.schema_migrations')
  })
})

// ── the workflow half: the guard must never be half-armed BY THE PLATFORM ──────────────────────
//
// On 2026-08-17 every Dependabot PR (#2144 actions/checkout, #2145 codeql-action, #2146 the
// minor-and-patch group) failed this guard, and the message accused a maintainer of arming
// SUPABASE_PROJECT_REF while leaving SUPABASE_ACCESS_TOKEN unset. No maintainer had done anything:
// GitHub withholds `secrets.*` from Dependabot and fork runs and does NOT withhold `vars.*`, so the
// pair arrives split on those runs by design. The guard's tri-state was right; its INPUT was wrong.
//
// The rule below reads the real ci.yml and proves the consequence, not the wording: under a run
// with no secrets, the ref resolves EMPTY and the guard reaches `skipped` rather than a failure.
describe('ci.yml arms the ledger pair all-or-nothing (Dependabot + fork runs)', () => {
  const CI = readFileSync(join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8')

  /** Resolve one `NAME: ${{ … }}` env line the way Actions would on a run with NO secrets.
   *  Only the two shapes ci.yml actually uses are understood; anything else throws rather than
   *  guessing, so a future rewrite into an unrecognised expression fails here instead of silently
   *  re-splitting the pair. */
  function resolveWithoutSecrets(expr: string): string {
    const body = expr.trim().replace(/^\$\{\{/, '').replace(/\}\}$/, '').trim()
    if (/^secrets\.[A-Za-z_][A-Za-z0-9_]*$/.test(body)) return '' // withheld on these runs
    const gated = body.match(
      /^secrets\.[A-Za-z_][A-Za-z0-9_]*\s*!=\s*''\s*&&\s*vars\.[A-Za-z_][A-Za-z0-9_]*\s*\|\|\s*''$/,
    )
    if (gated) return '' // the secret is empty, so the whole conjunction is
    throw new Error(
      `Unrecognised env expression in ci.yml: ${expr}\n` +
        'Gate the var on the secret — `${{ secrets.TOKEN != \'\' && vars.REF || \'\' }}` — so a run\n' +
        'without secrets reads as NEITHER set. See the block comment above this test.',
    )
  }

  function ciEnv(name: string): string {
    const m = CI.match(new RegExp(`^\\s*${name}:\\s*(\\$\\{\\{.*\\}\\})\\s*$`, 'm'))
    expect(m, `${name} is not set in .github/workflows/ci.yml`).toBeTruthy()
    return resolveWithoutSecrets(m![1])
  }

  it('resolves BOTH to empty when secrets are withheld, not one of each', () => {
    expect(ciEnv('SUPABASE_ACCESS_TOKEN')).toBe('')
    expect(ciEnv('SUPABASE_PROJECT_REF')).toBe('')
  })

  it('and that pair reaches a loud SKIP, which is what unblocks Dependabot', async () => {
    const r = await ledgerCheck({
      env: {
        [LEDGER_ENV.TOKEN]: ciEnv('SUPABASE_ACCESS_TOKEN'),
        [LEDGER_ENV.REF]: ciEnv('SUPABASE_PROJECT_REF'),
      },
      argv: [],
      total: MIN_ROWS,
      io: {
        repo: { readdir: () => [] },
        fetch: async () => {
          throw new Error('a skipped run must not reach the network')
        },
      },
    })
    expect(r.status).toBe('skipped')
    expect(r.ok).toBe(true)
  })
})
