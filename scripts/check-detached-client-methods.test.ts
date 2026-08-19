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

/** `= <receiver>.rpc|from|schema` NOT immediately invoked and NOT bound. */
const ALIAS = /=\s*([\w$.()]*?)\.(rpc|from|schema)(?![\w$(<.])/g

export function detachedClientMethods(source: string): Array<{ line: number; text: string }> {
  const hits: Array<{ line: number; text: string }> = []
  source.split('\n').forEach((text, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(text)) return
    for (const m of text.matchAll(ALIAS)) {
      const receiver = m[1]
      if (!receiver || !CLIENT_RECEIVER.test(receiver)) continue
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
