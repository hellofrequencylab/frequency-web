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

// ⚠️ `scripts` and `supabase` were added 2026-08-25 and they find NOTHING today, which is the honest
// reason to add them rather than an argument against it. Measured: supabase/functions/embed/index.ts
// is the only non-test .ts under either root and it holds no client at all; the two scripts/*.mjs
// files that mention `createAdminClient` are GUARDS matching their own regex text, and `.mjs` is not
// scanned anyway. The next edge function that queries would have been invisible here, and a root
// nobody added until something broke in it is the 2026-08-11 incident's shape.
const ROOTS = ['app', 'lib', 'components', 'scripts', 'supabase']
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

/**
 * `<prefix> <receiver>.rpc|from|schema` NOT immediately invoked and NOT bound.
 *
 * ⚠️ THE PREFIX USED TO BE JUST `=`, and that was the blind spot. An assignment is only ONE of the
 * ways a method gets detached from its client; every one of these loses `this` identically:
 *
 *     const rpc = admin.rpc          // assignment      — the only shape the old pattern saw
 *     doThing(supabase.from)         // callback arg
 *     return supabase.rpc            // returned
 *     { rpc: db.rpc }                // object property
 *     () => supabase.from            // arrow body
 *     [db.from, db.rpc]              // array element
 *
 * All five of the non-assignment shapes were swept on 2026-08-25 and the tree was clean, so this
 * widening fixes no bug. It fixes the GATE: a fail-safe that cannot notice the next occurrence reads
 * as coverage without being coverage (ADR-970), and "we only ever wrote it as an assignment" is a
 * habit, not an invariant.
 *
 * The negative lookahead is what keeps this from crying wolf: `(` excludes an inline call, `.`
 * excludes `.bind(x)` and any further chaining, `<` excludes a generic. What is left is a bare
 * reference, which is the only thing that can be detached.
 */
const ALIAS = /(=>|[=(,[:]|\breturn\b)\s*([\w$.()]*?)\.(rpc|from|schema)(?![\w$(<.])/g

/**
 * The ONE shape a `(` prefix must not flag: a parenthesized cast that is then invoked.
 *
 *     const { data } = await (supabase.rpc as unknown as Fn)('x')
 *
 * `this` SURVIVES that — tsc and swc both emit `supabase.rpc('x')` — and the codebase uses it
 * deliberately for untyped RPCs. Widening the prefix to catch a callback argument
 * (`doThing(supabase.from)`) pulled this idiom in with it, and it is the only collision: in argument
 * position a bare reference is a detach, while a CAST in argument position is this idiom.
 *
 * So `(` plus a following `as` is excused, and nothing else is. The residue is that
 * `doThing(db.from as Fn)` — a cast passed as a real callback — goes unseen. That is the direction to
 * err in: a guard that cries wolf gets routed around, and this one is the last line on a defect that
 * already cost six weeks of silent production errors.
 */
const PAREN_CAST = /^\s*as\b/

export function detachedClientMethods(source: string): Array<{ line: number; text: string }> {
  const hits: Array<{ line: number; text: string }> = []
  const local = clientBoundNames(source)
  // ⚠️ SCANNED AS ONE STRING, not line by line, and that is the second blind spot this closes.
  // `ALIAS` separates the prefix from the receiver with `\s*`, and `\s` matches a NEWLINE — but only
  // if the regex is ever shown one. A per-line pass could not see the shape a formatter produces
  // the moment the line gets long:
  //
  //     const rpcAll =
  //       admin.rpc as unknown as Fn
  //
  // which is the exact defect that ran in production for six weeks, one prettier wrap away from
  // invisible. Comments are blanked first (below) so the whole-source pass cannot read an example
  // in a doc comment as real code — including the examples in THIS file's own header.
  const code = blankComments(source)
  const lineStarts = lineStartOffsets(source)
  for (const m of code.matchAll(ALIAS)) {
    // ⚠️ The receiver class contains `(` — it has to, so `createAdminClient().from` resolves — which
    // means the receiver can SWALLOW the opening paren of a cast, leaving the matched prefix as
    // whatever came before it (a `,` in an argument list). Normalise here, or the PAREN_CAST excuse
    // below silently stops applying to exactly the wrapped multi-line casts it exists for.
    const raw = m[2] ?? ''
    const parenthesized = m[1] === '(' || raw.startsWith('(')
    const receiver = raw.replace(/^\(+/, '')
    if (!receiver || !(CLIENT_RECEIVER.test(receiver) || local.has(receiver))) continue
    // A parenthesized cast that gets invoked keeps `this`; see PAREN_CAST.
    if (parenthesized && PAREN_CAST.test(code.slice((m.index ?? 0) + m[0].length))) continue
    // `.bind(` / `.call(` / `.apply(` are the correct rebindings and are excluded by the
    // negative lookahead above; anything left is a bare method reference.
    //
    // Report the line the RECEIVER is on rather than the one the prefix is on: on a wrapped
    // assignment those differ, and the receiver is the half a reader needs to go look at.
    const at = (m.index ?? 0) + m[0].length
    const line = lineOf(lineStarts, at)
    hits.push({ line, text: (source.split('\n')[line - 1] ?? '').trim() })
  }
  return hits
}

/**
 * Replace every comment body with spaces, preserving LENGTH so every offset still maps to its
 * original line. Blanking rather than deleting is the whole trick: a whole-source scan needs the
 * indices to stay true, and a `source.replace(/\/\/.*$/gm, '')` would shift every match after it.
 *
 * Not a full JS lexer — a `//` inside a string literal is blanked too. That direction is SAFE: it can
 * only make the guard miss a detach written inside a string, which is not executable code anyway.
 * The opposite error, treating a comment as code, is the one that produces false positives, and
 * false positives are what get a guard routed around (ADR-970).
 */
export function blankComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

/** Byte offset where each line starts, so a match index resolves to a line number. PURE. */
function lineStartOffsets(source: string): number[] {
  const starts = [0]
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1)
  return starts
}

/** 1-based line number containing `offset`. Binary search; PURE. */
function lineOf(starts: number[], offset: number): number {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return lo + 1
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

  // ── The three blind spots closed on 2026-08-25, each with the arm that proves it fires ────────
  //
  // All three were EMPTY when they were closed, so none of this fixed a bug. That is precisely why
  // the arms matter: a widening whose new reach is never exercised is indistinguishable from no
  // widening at all, and it reads as coverage either way (ADR-970).

  it('sees a detach that is NOT an assignment', () => {
    // Every one of these loses `this` exactly as the assignment shape does. Before this widening the
    // pattern required a literal `=` and saw none of them.
    expect(detachedClientMethods('  doThing(supabase.from)'), 'callback argument').toHaveLength(1)
    expect(detachedClientMethods('  return supabase.rpc'), 'returned').toHaveLength(1)
    expect(detachedClientMethods('  const o = { rpc: db.rpc }'), 'object property').toHaveLength(1)
    expect(detachedClientMethods('  const f = () => supabase.from'), 'arrow body').toHaveLength(1)
    expect(detachedClientMethods('  const fns = [db.from, admin.rpc]'), 'array element').toHaveLength(2)
  })

  it('sees a detach the formatter WRAPPED, which a per-line scan cannot', () => {
    // One prettier wrap away from invisible. This is the exact shape of the defect that ran in
    // production for six weeks, with the line break a long generic would have forced.
    expect(detachedClientMethods('const rpcAll =\n  admin.rpc as unknown as Fn')).toHaveLength(1)
    // And the line reported is the RECEIVER's, not the prefix's — that is the line to go look at.
    expect(detachedClientMethods('const rpcAll =\n  admin.rpc as unknown as Fn')[0].line).toBe(2)
  })

  it('still excuses the parenthesized cast that is invoked, wrapped or not', () => {
    // `this` survives these: tsc emits `supabase.rpc('x')`. The one-line form was already covered;
    // the WRAPPED form is the collision the widened prefix introduced, and the reason the receiver
    // has its leading parens stripped before the excuse is applied.
    expect(detachedClientMethods("  await (supabase.rpc as unknown as Fn)('x')")).toEqual([])
    expect(
      detachedClientMethods('  const [a, b] = await Promise.all([\n    q,\n    (supabase.rpc as unknown as (\n      fn: string,\n    ) => Promise<void>)(\'x\', {}),\n  ])'),
      'a cast wrapped across lines inside an argument list',
    ).toEqual([])
  })

  it('does not read its own documentation as code', () => {
    // The header of this file and the ALIAS doc comment both contain literal detach examples. A
    // whole-source scan that did not blank comments would flag every guard that documents itself,
    // which is how a guard earns a reputation for crying wolf.
    expect(detachedClientMethods('// const rpc = admin.rpc as unknown as Fn')).toEqual([])
    expect(detachedClientMethods('/**\n * const rpc = admin.rpc\n */')).toEqual([])
    // Blanking preserves LENGTH, so offsets after a comment still resolve to the right line.
    expect(blankComments('// hi\nconst x = 1').length).toBe('// hi\nconst x = 1'.length)
    expect(detachedClientMethods('/* pad */\nconst rpc = admin.rpc as Fn')[0].line).toBe(2)
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
