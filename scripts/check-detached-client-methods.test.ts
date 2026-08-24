import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// THE GATE THAT NOTICES (backlog LIVE-053). A Supabase client method stored as a bare value and
// then called — `const rpc = admin.rpc as unknown as Fn; await rpc(…)` — loses `this`. Under ESM
// strict mode `this` is then `undefined`, and SupabaseClient.from/schema/rpc all begin by reading
// `this.rest`, so the call throws:
//
//     TypeError: Cannot read properties of undefined (reading 'rest')
//
// That exact error ran in production from 2026-07-09 to 2026-08-19 out of
// app/(main)/messages/popover-actions.ts, invisible because the only caller that could see it
// (prefetchDockSummary) swallowed it in a bare `catch {}`. Ten sites shared the shape.
//
// The FIX is to bind at the alias: `admin.rpc.bind(admin)` (the pattern lib/analytics/insights-read.ts
// already used correctly). This guard fails the build if the unbound shape comes back. Calling the
// method inline — `(supabase.rpc as unknown as Fn)('…')` — keeps `this` (tsc/swc emit
// `supabase.rpc('…')`) and is deliberately NOT flagged.

const ROOTS = ['app', 'lib', 'components']
const REPO = join(__dirname, '..')

/** Receivers that are (or return) a Supabase client. Narrow on purpose: `.from` is a common
 *  property name on unrelated objects (a rest window, a gradient), and a guard that cries wolf
 *  gets routed around. */
const CLIENT_RECEIVER =
  /(?:^|[^\w$.])(?:[\w$]*(?:supabase|admin|client|db|sb)|create[\w$]*Client\(\)|db\(\))$/i

/** …AND the names this FILE binds to a client, however they are spelled. The heuristic above is a
 *  guess from the identifier; this is a fact from the assignment, so it closes the gap the guess
 *  leaves without widening the guess. Measured 2026-08-24: every variable in the tree assigned from
 *  a client factory, tested against CLIENT_RECEIVER alone —
 *      matched     admin(775)  db(308)  supabase(223)  client(1)
 *      MISSED      q(4)  dbc(4)  dbh(2)  ub(2)  d(2)  base(2)  cfg(1)  handle(1)
 *  Eight real client-holding names over 18 sites that the guess cannot see. None was detached, so
 *  this fixes no bug — it fixes the gate, which is the point: a fail-safe that cannot notice the
 *  next occurrence reads as coverage without being coverage (ADR-970). */
const FACTORY_ASSIGN =
  /(?:^|[^\w$.])(?:const|let|var)\s+([\w$]+)\s*=\s*(?:await\s+)?create[\w$]*Client\s*\(/g

/** Local names this source binds to a Supabase client. File-scoped on purpose: `base` is a client
 *  in one file and a URL string in another, so a repo-wide name list would re-admit exactly the
 *  false positives CLIENT_RECEIVER is narrow to avoid. */
export function clientBoundNames(source: string): Set<string> {
  const names = new Set<string>()
  for (const m of source.matchAll(FACTORY_ASSIGN)) names.add(m[1])
  return names
}

/** `= <receiver>.rpc|from|schema` NOT immediately invoked and NOT bound. */
const ALIAS = /=\s*([\w$.()]*?)\.(rpc|from|schema)(?![\w$(<.])/g

export function detachedClientMethods(source: string): Array<{ line: number; text: string }> {
  const hits: Array<{ line: number; text: string }> = []
  const local = clientBoundNames(source)
  source.split('\n').forEach((text, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(text)) return
    for (const m of text.matchAll(ALIAS)) {
      const receiver = m[1]
      if (!receiver || !(CLIENT_RECEIVER.test(receiver) || local.has(receiver))) continue
      // `.bind(` / `.call(` / `.apply(` are the correct rebindings and are excluded by the
      // negative lookahead above; anything left is a bare method reference.
      hits.push({ line: i + 1, text: text.trim() })
    }
  })
  return hits
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('supabase client methods are never detached from their client', () => {
  it('fires on the shape that actually broke production', () => {
    expect(detachedClientMethods('  const rpc = admin.rpc as unknown as Fn')).toHaveLength(1)
    expect(detachedClientMethods('  const q = createAdminClient().from')).toHaveLength(1)
    expect(detachedClientMethods('  const rpcAll = supabase.rpc as unknown as (')).toHaveLength(1)
  })

  it('fires on a client whose NAME the heuristic cannot guess, because the file assigns it', () => {
    // The eight names measured outside CLIENT_RECEIVER on 2026-08-24. None was detached; this
    // proves the gate would SEE one if it appeared, which is the whole point of widening.
    for (const name of ['q', 'dbc', 'dbh', 'ub', 'd', 'base', 'cfg', 'handle']) {
      const src = `const ${name} = createAdminClient()\nconst f = ${name}.from as unknown as Fn`
      expect(detachedClientMethods(src), `${name} must be seen once assigned from a factory`).toHaveLength(1)
    }
  })

  it('keeps the name file-scoped, so `base` is only a client where it IS one', () => {
    // The reason this resolves per file instead of collecting a repo-wide name list: `base` is a
    // client in one file and a URL string in another. A global list re-admits the false positives
    // CLIENT_RECEIVER is deliberately narrow to avoid.
    expect(detachedClientMethods('const base = siteUrl()\nconst f = base.from')).toEqual([])
    expect(clientBoundNames('const dbc = createAdminClient()')).toEqual(new Set(['dbc']))
    expect(clientBoundNames('const base = siteUrl()')).toEqual(new Set())
  })

  it('does not fire on a bound alias, an inline call, or an unrelated `.from`', () => {
    expect(detachedClientMethods('  return db.rpc.bind(db) as unknown as UntypedRpc')).toEqual([])
    expect(detachedClientMethods("  const { data } = await (supabase.rpc as unknown as Fn)('x')")).toEqual([])
    expect(detachedClientMethods('  const start = rest.from')).toEqual([])
    expect(detachedClientMethods('  const cols = [style.gradient.from, style.gradient.to]')).toEqual([])
  })

  it('finds none in the tree', () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of walk(join(REPO, root))) {
        for (const hit of detachedClientMethods(readFileSync(file, 'utf8'))) {
          offenders.push(`${relative(REPO, file)}:${hit.line}  ${hit.text}`)
        }
      }
    }
    expect(offenders, `bind the alias to its client (\`x.rpc.bind(x)\`):\n${offenders.join('\n')}`).toEqual([])
  })
})
