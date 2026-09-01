import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// ── ONE HAND-WRITTEN ROW TYPE, SEVERAL SELECTS, AND ONE BRANCH FORGOT A COLUMN ──────────────────
//
// 🔴 THE DEFECT THIS CLOSES, found 2026-09-01 and it DESTROYED DATA. `/admin/circles` builds its
// list from four role-scoped queries — janitor, host, guide, mentor — and casts all four to one
// hand-written `CircleRow`. The janitor and host branches selected `image_url, city, neighborhood,
// resonance_public, featured_at`. The guide branch omitted the first four; the mentor branch omitted
// all five. TypeScript could not see it: this repo casts the payload rather than regenerating
// database.types (ADR-246), so a missing column is `undefined` at runtime, not a type error.
//
// The consequence was not a blank field. `circles-client.tsx` prefills its form with
// `initial?.image_url ?? ''`, `handleSubmit` then `fd.set`s all four UNCONDITIONALLY, and
// `updateCircle` guards with `fd.has(...)` — which is always true once the form set them. So a guide
// or mentor who opened a circle, changed only its name, and saved, wrote
// `image_url: null, city: null, neighborhood: null, resonance_public: false` over live data. The
// action's own comment states the invariant that broke: "Optional fields are only written when
// present in the form, so a partial form never clears image/location/resonance it didn't show."
//
// The same file's `featured_at` miss is quieter and still wrong: for a mentor every
// `c.featured_at != null` was false, so a featured circle rendered unstarred and `FeatureStar`'s
// toggle always sent `act(true)` — a mentor could feature a circle and could never unfeature one.
// `/admin/events` had the identical shape: the directly-hosted branch of `load-events.ts` omitted
// `featured_at` while the circle-scoped branch selected it, and both merge into one `AdminEvent[]`.
//
// ── WHY THIS IS AN AST WALK AND NOT A REGEX (HYG-039) ───────────────────────────────────────────
//
// ⚠️ THE RULE THAT LOOKS RIGHT IS NOT. "All selects on the same table in one file must request the
// same columns" was written and MEASURED FIRST: it fires on **346 files**, almost all legitimate,
// because a count query and a detail query on one table are supposed to differ. Divergence is a
// defect only when the branches feed ONE ROW TYPE, and that relation — select ⟶ cast — is what makes
// it a bug rather than a difference. A gate with a 346-file false-positive rate earns an allowlist
// and then reads as coverage (ADR-970).
//
// 🔴 AND THE CHEAP VERSION OF THE RIGHT RULE IS ALSO NOT SOUND. This guard shipped pinned to two
// hand-listed pairs, resolving the cast by scanning ~400 characters after each select for
// `as unknown as <Type>`. Generalising that regex across app/ + lib/ was measured on 2026-09-01 and
// produced **13 failures of which at least 3 were pure artefact**, each a different way the text
// layer lies about the code:
//
//   1. TWO BLOCK-SCOPED TYPES SHARING A NAME.  `hubs/admin-actions.ts` declares `type Row` inside
//      two different functions — `{id,name,slug,status,member_count,member_cap,host}` in one,
//      `{member_count,status}` in the other. Matching the declaration by name merges them and then
//      reports the second select as "omitting id, name, slug, member_cap". `nexuses/admin-actions.ts`
//      has the identical shape. Scope resolution is the only thing that separates them.
//   2. A LOOKAHEAD CROSSES A `Promise.all`.  `event-stats.ts` issues three selects on three
//      different tables inside one array; the cast after the last is credited to all three, so
//      `select('status')` on `event_rsvps` reads as `TicketRow` "omitting amount_cents, qty".
//   3. `select('*')` READS AS OMITTING EVERYTHING.  Five types (`ShareRow`, `VenueHoldRow`,
//      `CollaborationRow`, `WalkthroughRow`, …) select every column and were reported as missing
//      every column.
//
// So the walk below resolves the type NAME through lexical scope, and admits a select ⟶ cast edge
// only when it can PROVE the flow: the select is syntactically inside the asserted expression, or
// the asserted expression names a local binding whose initializer contains it. Anything it cannot
// prove is NOT CLAIMED — a select whose result reaches its cast through several hops is outside
// this guard, and the corpus floor below is what notices if that set ever collapses.
//
// ⚪ OPTIONAL KEYS ARE EXEMPT, and that is the second half of the rule. `TopicalChannel.pillar_id`
// is declared `?: string | null` and only the branch that filters on it selects it. A `?` is the
// type saying "may be absent"; a REQUIRED key missing from one branch is the bug. Without this
// distinction the rule fires on correct code.

const ROOT = path.join(import.meta.dirname, '..')

/** Every `.ts`/`.tsx` file under `abs`. `withFileTypes` keeps the walk free of a check-then-use race (ADR-1185). */
function tsFilesUnder(abs: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full)
    }
  }
  walk(abs)
  return out
}

const each = (n: ts.Node, fn: (n: ts.Node) => void): void => { fn(n); n.forEachChild((c) => each(c, fn)) }
const contains = (root: ts.Node, target: ts.Node): boolean => {
  let hit = false
  each(root, (n) => { if (n === target) hit = true })
  return hit
}

type SelectCall = { node: ts.CallExpression; cols: string }

/** The `.select('…')` calls in a file, with their literal column string. */
function selectCalls(sf: ts.SourceFile): SelectCall[] {
  const out: SelectCall[] = []
  each(sf, (n) => {
    if (!ts.isCallExpression(n)) return
    const e = n.expression
    if (!ts.isPropertyAccessExpression(e) || e.name.text !== 'select') return
    const a = n.arguments[0]
    if (!a || !ts.isStringLiteralLike(a)) return
    out.push({ node: n, cols: a.text })
  })
  return out
}

const statementsOf = (n: ts.Node): readonly ts.Statement[] | null => {
  if (ts.isSourceFile(n) || ts.isBlock(n) || ts.isModuleBlock(n)) return n.statements
  return null
}

/**
 * Resolve a type NAME to its declaration through LEXICAL SCOPE, innermost first.
 * File-wide name matching merges two `type Row`s in two functions — see failure mode 1 above.
 */
export function resolveTypeDecl(
  from: ts.Node,
  name: string,
): ts.TypeAliasDeclaration | ts.InterfaceDeclaration | null {
  for (let s: ts.Node | undefined = from; s; s = s.parent) {
    const stmts = statementsOf(s)
    if (!stmts) continue
    for (const st of stmts) {
      if ((ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) && st.name.text === name) return st
    }
  }
  return null
}

/**
 * The REQUIRED, scalar, non-method members of a row type — the columns every feeding branch owes.
 * Optional (`?`) members are exempt; embedded joins and function members are not columns.
 */
export function requiredScalarKeys(
  decl: ts.TypeAliasDeclaration | ts.InterfaceDeclaration,
): string[] | null {
  const members = ts.isInterfaceDeclaration(decl)
    ? decl.members
    : ts.isTypeLiteralNode(decl.type)
      ? decl.type.members
      : null
  if (!members) return null
  const out: string[] = []
  for (const m of members) {
    if (!ts.isPropertySignature(m) || !m.name || !ts.isIdentifier(m.name) || !m.type) continue
    if (m.questionToken) continue
    let embedded = false
    each(m.type, (n) => { if (ts.isTypeLiteralNode(n) || ts.isFunctionTypeNode(n)) embedded = true })
    if (embedded) continue
    out.push(m.name.text)
  }
  return out
}

const ALL = Symbol('select *')

/** The column names a select string requests. `alias:table!fk ( a, b )` contributes only `alias`. */
export function columnsOf(cols: string): Set<string> | typeof ALL {
  if (cols.trim() === '*') return ALL
  const flat = cols
    .replace(/([a-z_]+)\s*:\s*[a-z_]+(?:![a-z_]+)?\s*\([^)]*\)/gi, '$1')
    .replace(/([a-z_]+)\s*\([^)]*\)/gi, '$1')
  return new Set(
    flat.split(',').map((c) => c.trim().split(/[\s:]/)[0]).filter((c) => /^[a-z_][a-z0-9_]*$/.test(c)),
  )
}

export type ParityEdge = {
  decl: ts.TypeAliasDeclaration | ts.InterfaceDeclaration
  name: string
  selects: SelectCall[]
}

/** Every (row type declaration ⟶ feeding selects) edge in one file, admitted only when the flow is provable. */
export function parityEdges(sf: ts.SourceFile): ParityEdge[] {
  const selects = selectCalls(sf)
  if (!selects.length) return []
  const byDecl = new Map<ts.Node, ParityEdge>()

  each(sf, (n) => {
    if (!ts.isAsExpression(n)) return
    // `as unknown as T[]` — the OUTER assertion carries the row type; unwrap array and union forms.
    let tn: ts.TypeNode = n.type
    while (ts.isArrayTypeNode(tn)) tn = tn.elementType
    if (ts.isUnionTypeNode(tn)) {
      const named = tn.types.find((t) => ts.isTypeReferenceNode(t))
      if (!named) return
      tn = named
    }
    if (!ts.isTypeReferenceNode(tn) || !ts.isIdentifier(tn.typeName)) return
    const decl = resolveTypeDecl(n, tn.typeName.text)
    if (!decl) return

    const operand = n.expression
    const feeding: SelectCall[] = []
    // (a) the select is syntactically inside what is being asserted
    for (const s of selects) if (contains(operand, s.node)) feeding.push(s)
    // (b) the asserted expression names a local binding whose initializer holds the select
    if (!feeding.length) {
      each(operand, (o) => {
        if (!ts.isIdentifier(o)) return
        for (let sc: ts.Node | undefined = n; sc; sc = sc.parent) {
          const stmts = statementsOf(sc)
          if (!stmts) continue
          for (const st of stmts) {
            if (!ts.isVariableStatement(st)) continue
            for (const d of st.declarationList.declarations) {
              if (!d.initializer) continue
              const binds = ts.isIdentifier(d.name)
                ? d.name.text === o.text
                : ts.isObjectBindingPattern(d.name) &&
                  d.name.elements.some((el) => ts.isIdentifier(el.name) && el.name.text === o.text)
              if (!binds) continue
              for (const s of selects) if (contains(d.initializer, s.node) && !feeding.includes(s)) feeding.push(s)
            }
          }
        }
      })
    }
    if (!feeding.length) return
    const edge = byDecl.get(decl) ?? { decl, name: tn.typeName.text, selects: [] }
    for (const s of feeding) if (!edge.selects.includes(s)) edge.selects.push(s)
    byDecl.set(decl, edge)
  })
  return [...byDecl.values()]
}

export function parse(file: string, src: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

/** The findings in one already-parsed source: a row type fed by >1 select where a branch omits a required column. */
export function findingsInSource(sf: ts.SourceFile): Array<{ type: string; omits: string[] }> {
  const out: Array<{ type: string; omits: string[] }> = []
  for (const edge of parityEdges(sf)) {
    if (edge.selects.length < 2) continue
    const keys = requiredScalarKeys(edge.decl)
    // Under three required scalar columns it is a projection, not a row type.
    if (!keys || keys.length < 3) continue
    for (const s of edge.selects) {
      const got = columnsOf(s.cols)
      if (got === ALL) continue
      const omits = keys.filter((k) => !got.has(k))
      if (omits.length) out.push({ type: edge.name, omits })
    }
  }
  return out
}

/** Row types fed by MORE THAN ONE select across the given roots, with every omission found. */
export function parityFindings(roots: string[]): {
  pairs: number
  findings: Array<{ file: string; type: string; omits: string[] }>
} {
  const findings: Array<{ file: string; type: string; omits: string[] }> = []
  let pairs = 0
  for (const root of roots) {
    for (const full of tsFilesUnder(path.join(ROOT, root))) {
      const src = readFileSync(full, 'utf8')
      if (!src.includes('.select(')) continue
      const sf = parse(full, src)
      for (const edge of parityEdges(sf)) {
        if (edge.selects.length < 2) continue
        const keys = requiredScalarKeys(edge.decl)
        if (!keys || keys.length < 3) continue
        pairs++
      }
      for (const f of findingsInSource(sf)) {
        findings.push({ file: path.relative(ROOT, full), type: f.type, omits: f.omits })
      }
    }
  }
  return { pairs, findings }
}

const ROOTS = ['app', 'lib']

describe('a row type fed by several selects gets every column from every branch', () => {
  const measured = parityFindings(ROOTS)

  it('no branch omits a required column of the row type it feeds', () => {
    expect(
      measured.findings.map((f) => `${f.file} :: ${f.type} omits ${f.omits.join(', ')}`),
      'a branch feeding this type omits a required column — the form prefills undefined and can write it back as null',
    ).toEqual([])
  })

  it('discovers a real corpus of multi-select row types, so an empty walk cannot pass as compliance', () => {
    // The floor. This replaced two HAND-LISTED pairs (HYG-039); if discovery breaks, the green
    // above means nothing. Reading on 2026-09-01: 12, including both originally-bled pairs
    // (CircleRow, 4 selects · AdminEvent, 2).
    expect(measured.pairs).toBeGreaterThanOrEqual(8)
  })

  // ── controls. Each runs the detector against a source string with a KNOWN answer. ──
  const findingsIn = (src: string) =>
    findingsInSource(parse('/x/probe.ts', src)).map((f) => `${f.type}:${f.omits.join(',')}`)

  it('FIRES on the shape that destroyed data (positive control)', () => {
    expect(
      findingsIn(`
        type CircleRow = { id: string; name: string; image_url: string | null; city: string | null }
        async function load(sb: any) {
          const a = (await sb.from('circles').select('id, name, image_url, city')).data as unknown as CircleRow[]
          const b = (await sb.from('circles').select('id, name')).data as unknown as CircleRow[]
          return [...a, ...b]
        }
      `),
    ).toEqual(['CircleRow:image_url,city'])
  })

  it('does NOT fire on an OPTIONAL column a branch skips', () => {
    expect(
      findingsIn(`
        type T = { id: string; name: string; slug: string; pillar_id?: string | null }
        async function load(sb: any) {
          const a = (await sb.from('t').select('id, name, slug, pillar_id')).data as T[]
          const b = (await sb.from('t').select('id, name, slug')).data as T[]
          return [...a, ...b]
        }
      `),
    ).toEqual([])
  })

  it('does NOT fire on `select("*")`', () => {
    expect(
      findingsIn(`
        type T = { id: string; name: string; slug: string }
        async function load(sb: any) {
          const a = (await sb.from('t').select('id, name, slug')).data as T[]
          const b = (await sb.from('t').select('*')).data as T[]
          return [...a, ...b]
        }
      `),
    ).toEqual([])
  })

  it('does NOT merge two BLOCK-SCOPED types that share a name (failure mode 1)', () => {
    // Exactly the hubs/nexuses shape. Merging these reports the second select as omitting the
    // first type's columns — a finding with no defect behind it.
    expect(
      findingsIn(`
        async function detail(sb: any) {
          type Row = { id: string; name: string; slug: string; member_cap: number }
          const r = (await sb.from('c').select('id, name, slug, member_cap')).data as unknown as Row[]
          const r2 = (await sb.from('c').select('id, name, slug, member_cap')).data as unknown as Row[]
          return [...r, ...r2]
        }
        async function stats(sb: any) {
          type Row = { member_count: number; status: string; kind: string }
          const r = (await sb.from('c').select('member_count, status, kind')).data as Row[]
          const r2 = (await sb.from('c').select('member_count, status, kind')).data as Row[]
          return [...r, ...r2]
        }
      `),
    ).toEqual([])
  })

  it('does NOT credit one cast to selects on other tables in the same Promise.all (failure mode 2)', () => {
    // The event-stats shape: three selects, three tables, one cast at the end.
    expect(
      findingsIn(`
        type TicketRow = { amount_cents: number; qty: number; status: string }
        async function stats(sb: any) {
          const [ev, tickets, rsvps] = await Promise.all([
            sb.from('events').select('capacity, currency, price_cents').maybeSingle(),
            sb.from('event_tickets').select('amount_cents, qty, status'),
            sb.from('event_rsvps').select('status'),
          ])
          const rows = (tickets.data ?? []) as TicketRow[]
          return { ev, rows, rsvps }
        }
      `),
    ).toEqual([])
  })

  it('reads an embedded join by its ALIAS, not by the columns inside it', () => {
    expect(
      findingsIn(`
        type T = { id: string; name: string; slug: string }
        async function load(sb: any) {
          const a = (await sb.from('t').select('id, name, slug, host:profiles!host_id ( display_name )')).data as T[]
          const b = (await sb.from('t').select('id, name, slug')).data as T[]
          return [...a, ...b]
        }
      `),
    ).toEqual([])
  })
})
