#!/usr/bin/env node
// SCHEMA <-> CODE CONTRACT GUARD (scan 2, 2026-09-05, lane PE-1; the finding is L1-01, the fix ADR-1207).
//
// WHY THIS EXISTS. Every state change on the campaign approval spine wrote `updated_at` to
// `campaigns`, a column that does not exist. PostgREST rejects the whole UPDATE (PGRST204), so
// markReady / approve / pause / cancel / armPhase all failed, the approval queue showed an error
// toast on every button, and 12 live campaigns sat in `draft` for good. The compiler could not see
// it: the spine addresses its tables through the hand-written untyped builder in lib/outbound/db.ts
// (`TABLE[ref.type]`, a dynamic table name), and the only test beside it was a pure policy test.
//
// WHAT IT DOES. Parses lib/database.types.ts with the TypeScript compiler API (the generated
// contract: tables, views, functions, enums, foreign keys), then walks every `.from('<table>')` and
// `.rpc('<fn>')` chain in app/, lib/, components/, scripts/ and supabase/functions/ and checks:
//   * the table / view exists                        * every select column, incl. embedded relations
//   * every filter column (eq/in/order/.or()/...)     * every insert / update / upsert literal key
//   * every rpc name and literal argument name        * enum literal values on enum-typed columns
// It follows constants and one import hop, object maps like `TABLE[ref.type]`, literal-union
// parameters, `let q = ...; q = q.eq(...)` continuations and helper builders that return a chain,
// which is how it reaches the untyped paths the compiler cannot.
//
// WHAT IT CANNOT SEE, so nobody mistakes green here for safe: column TYPES and nullability, a
// runtime-built payload (`update(patch)`), a table name that is a function parameter with no
// literal-union type, raw SQL inside migrations. Every one of those is COUNTED and printed as a
// skip with its reason; none of them is a crash and none of them is a pass.
//
// THREE EXITS, and the third is the one this file is really about:
//   0  the tree matches the contract
//   1  at least one phantom table / column / rpc, printed as file:line and the name
//   2  the guard saw nothing: fewer files or chains than a repo this size can have. A guard that
//      reports "0 phantoms" over an empty walk is the vacuous pass ADR-970 names; this exit keeps
//      "I looked and it was fine" distinct from "I never looked".
//
// ALLOWLIST. A phantom the guard flags that cannot be fixed in the same change gets ONE named,
// dated entry in ALLOWLIST below with the reason. An entry that no longer matches anything FAILS
// the guard (exit 1) so the list can only shrink. It is empty as of 2026-09-05: the live tree is
// clean, and the one production phantom that motivated this guard was fixed by ADR-1207.
//
// Usage: `node scripts/check-schema-contract.mjs [--root <dir>] [--json]` (or `pnpm
// check:schema-contract`). No network; reads only lib/database.types.ts and the source tree.
// The planted-violation self-test lives in scripts/check-schema-contract.test.ts.

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')

export const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const TYPES_REL = 'lib/database.types.ts'
export const SCAN_DIRS = ['app', 'lib', 'components', 'scripts', 'supabase/functions']
const EXT = new Set(['.ts', '.tsx', '.mjs', '.js', '.cjs', '.mts'])

// ── NON-TRIVIALITY FLOORS ────────────────────────────────────────────────────────────────────
// Measured on main at f760ddf, 2026-09-05: 3,482 files walked, 4,160 `.from()` chains, 105 `.rpc()`
// calls. The floors sit at roughly 70% of those so ordinary churn never trips them, while a walk
// that lost a directory, a regex that stopped matching `.from(`, or a run from the wrong cwd all
// do. Raise them only when the real counts move, never to make a red run green.
export const MIN_FILES = 2500
export const MIN_CHAINS = 3000
export const MIN_RPC_CALLS = 60

/** Known phantoms the guard must tolerate for now. One entry per site, named and dated, with the
 *  reason and the row or ADR that owns the fix. Shape:
 *    { file: 'lib/x.ts', table: 'campaigns', column: 'updated_at', kind: 'update',
 *      added: '2026-09-05', reason: 'why it cannot be fixed in this change', owner: 'SCAN-xxx' }
 *  `kind` is optional (matches any). An entry that matches nothing fails the guard. */
export const ALLOWLIST = []

/** Walk `root` against `typesFile` and return the raw report. Pure: no exit, no console. */
export function scanSchemaContract({ root = REPO_ROOT, typesFile } = {}) {
  const ROOT = path.resolve(root)
  const TYPES_FILE = typesFile ? path.resolve(typesFile) : path.join(ROOT, TYPES_REL)
  if (!fs.existsSync(TYPES_FILE)) throw new Error(`schema contract not found: ${TYPES_FILE}`)

  // ---------------------------------------------------------------- schema
  function parseSchema() {
    const src = fs.readFileSync(TYPES_FILE, 'utf8')
    const sf = ts.createSourceFile(TYPES_FILE, src, ts.ScriptTarget.Latest, true)
    let dbType = null
    sf.forEachChild((n) => {
      if (ts.isTypeAliasDeclaration(n) && n.name.text === 'Database') dbType = n.type
    })
    if (!dbType) throw new Error('Database type not found')
    const member = (tl, name) => tl.members.find((m) => ts.isPropertySignature(m) && propName(m.name) === name)
    const pub = member(dbType, 'public').type
    const tablesT = member(pub, 'Tables').type
    const viewsT = member(pub, 'Views').type
    const fnsT = member(pub, 'Functions').type
    const enumsT = member(pub, 'Enums').type
    const enums = {}
    for (const m of enumsT.members) {
      const name = propName(m.name)
      const parts = ts.isUnionTypeNode(m.type) ? m.type.types : [m.type]
      enums[name] = new Set(parts.filter((t) => ts.isLiteralTypeNode(t)).map((t) => t.literal.text))
    }
  
    const tables = {}
    const views = {}
    const fks = {} // fkName -> { table, columns, referencedRelation, referencedColumns }
    for (const m of tablesT.members) {
      const name = propName(m.name)
      const t = m.type
      const row = keysOf(member(t, 'Row')?.type)
      const colEnum = enumColsOf(member(t, 'Row')?.type)
      const insert = keysOf(member(t, 'Insert')?.type)
      const update = keysOf(member(t, 'Update')?.type)
      const rels = []
      const relT = member(t, 'Relationships')?.type
      if (relT && ts.isTupleTypeNode(relT)) {
        for (const el of relT.elements) {
          const r = {}
          for (const rm of el.members) {
            const k = propName(rm.name)
            const v = rm.type
            if (ts.isLiteralTypeNode(v)) r[k] = v.literal.text
            else if (ts.isTupleTypeNode(v)) r[k] = v.elements.map((e) => e.literal.text)
          }
          r.table = name
          rels.push(r)
          fks[r.foreignKeyName] = r
        }
      }
      tables[name] = { name, row, insert, update, rels, kind: 'table', colEnum }
    }
    for (const m of viewsT.members) {
      const name = propName(m.name)
      const t = m.type
      const rels = []
      const relT = member(t, 'Relationships')?.type
      if (relT && ts.isTupleTypeNode(relT)) {
        for (const el of relT.elements) {
          const r = {}
          for (const rm of el.members) {
            const k = propName(rm.name)
            const v = rm.type
            if (ts.isLiteralTypeNode(v)) r[k] = v.literal.text
            else if (ts.isTupleTypeNode(v)) r[k] = v.elements.map((e) => e.literal.text)
          }
          r.table = name
          rels.push(r)
          fks[r.foreignKeyName] = r
        }
      }
      views[name] = { name, row: keysOf(member(t, 'Row')?.type), colEnum: enumColsOf(member(t, 'Row')?.type), insert: null, update: null, rels, kind: 'view' }
    }
    const functions = {}
    for (const m of fnsT.members) {
      const name = propName(m.name)
      const overloads = ts.isUnionTypeNode(m.type) ? m.type.types : [m.type]
      const sigs = []
      for (const o of overloads) {
        if (!ts.isTypeLiteralNode(o)) continue
        const argsT = member(o, 'Args')?.type
        const retT = member(o, 'Returns')?.type
        let args = null
        if (argsT && ts.isTypeLiteralNode(argsT)) {
          args = {}
          for (const a of argsT.members) args[propName(a.name)] = !a.questionToken
        } else if (argsT && argsT.kind === ts.SyntaxKind.NeverKeyword) args = {}
        sigs.push({ args, returns: describeReturns(retT) })
      }
      functions[name] = sigs
    }
    return { tables, views, functions, fks, enums }
  }
  function describeReturns(t) {
    if (!t) return { kind: 'unknown' }
    if (ts.isArrayTypeNode(t)) {
      const inner = describeReturns(t.elementType)
      return { ...inner, array: true }
    }
    if (ts.isTypeLiteralNode(t)) return { kind: 'object', keys: keysOf(t) }
    if (ts.isIndexedAccessTypeNode(t)) {
      const txt = t.getText()
      const m = /Tables"\]\["([a-z_0-9]+)"\]\["Row"\]/.exec(txt)
      if (m) return { kind: 'table', table: m[1] }
    }
    return { kind: 'other', text: t.getText().slice(0, 40) }
  }
  function propName(n) {
    if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text
    return n.getText()
  }
  function enumColsOf(tl) {
    const m = {}
    if (!tl || !ts.isTypeLiteralNode(tl)) return m
    for (const mem of tl.members) {
      const txt = mem.type ? mem.type.getText() : ''
      const mm = /Enums"\]\["([a-z_0-9]+)"\]/.exec(txt)
      if (mm) m[propName(mem.name)] = mm[1]
    }
    return m
  }
  function keysOf(tl) {
    if (!tl || !ts.isTypeLiteralNode(tl)) return null
    const s = new Set()
    for (const m of tl.members) s.add(propName(m.name))
    return s
  }
  
  // ---------------------------------------------------------------- files
  function listFiles() {
    const out = []
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name.startsWith('.')) continue
          walk(p)
        } else if (EXT.has(path.extname(e.name))) {
          if (/\.test\.|\.spec\.|\.d\.ts$/.test(e.name)) continue
          if (p === TYPES_FILE) continue
          out.push(p)
        }
      }
    }
    for (const d of SCAN_DIRS) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d))
    return out
  }
  const sfCache = new Map()
  function sourceFile(p) {
    if (sfCache.has(p)) return sfCache.get(p)
    const src = fs.readFileSync(p, 'utf8')
    const kind = p.endsWith('.tsx') ? ts.ScriptKind.TSX : p.endsWith('.ts') || p.endsWith('.mts') ? ts.ScriptKind.TS : ts.ScriptKind.JS
    const sf = ts.createSourceFile(p, src, ts.ScriptTarget.Latest, true, kind)
    sfCache.set(p, sf)
    return sf
  }
  
  // ---------------------------------------------------------------- constant resolution
  // Map of top-level (and nested) `const NAME = <expr>` per file, plus imports.
  const constCache = new Map()
  function fileConsts(sf) {
    if (constCache.has(sf.fileName)) return constCache.get(sf.fileName)
    const consts = new Map() // name -> initializer node | 'AMBIGUOUS'
    const imports = new Map() // localName -> { from, imported }
    const visit = (n) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        const isConst = n.parent && ts.isVariableDeclarationList(n.parent) && (n.parent.flags & ts.NodeFlags.Const)
        if (isConst) {
          if (consts.has(n.name.text)) consts.set(n.name.text, 'AMBIGUOUS')
          else consts.set(n.name.text, n.initializer)
        }
      }
      if (ts.isImportDeclaration(n) && n.importClause?.namedBindings && ts.isNamedImports(n.importClause.namedBindings)) {
        const from = n.moduleSpecifier.text
        for (const el of n.importClause.namedBindings.elements) {
          imports.set(el.name.text, { from, imported: (el.propertyName || el.name).text })
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
    const res = { consts, imports }
    constCache.set(sf.fileName, res)
    return res
  }
  function resolveImportFile(fromFile, spec) {
    let base
    if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2))
    else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec)
    else return null
    for (const ext of ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx']) {
      const p = base + ext
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
    }
    return null
  }
  function unwrap(e) {
    while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression?.(e) || ts.isTypeAssertionExpression?.(e) || ts.isNonNullExpression(e))) e = e.expression
    return e
  }
  // Resolve an expression to a node (following identifiers/imports one hop, property access on object literals).
  function resolveNode(e, sf, depth = 0) {
    e = unwrap(e)
    if (!e || depth > 6) return null
    if (ts.isIdentifier(e)) {
      const { consts, imports } = fileConsts(sf)
      const c = consts.get(e.text)
      if (c && c !== 'AMBIGUOUS') return resolveNode(c, sf, depth + 1)
      if (c === 'AMBIGUOUS') return null
      const imp = imports.get(e.text)
      if (imp) {
        const f = resolveImportFile(sf.fileName, imp.from)
        if (f) {
          const isf = sourceFile(f)
          const ic = fileConsts(isf).consts.get(imp.imported)
          if (ic && ic !== 'AMBIGUOUS') return resolveNode(ic, isf, depth + 1)
        }
      }
      return null
    }
    if (ts.isPropertyAccessExpression(e)) {
      const obj = resolveNode(e.expression, sf, depth + 1)
      if (obj && ts.isObjectLiteralExpression(obj)) {
        const p = obj.properties.find((pr) => pr.name && propName(pr.name) === e.name.text)
        if (p && ts.isPropertyAssignment(p)) return resolveNode(p.initializer, sf, depth + 1)
      }
      return null
    }
    return e
  }
  // Resolve to a string; unresolvable dynamic parts become __DYN__.
  function resolveString(e, sf, depth = 0) {
    e = unwrap(e)
    if (!e || depth > 8) return null
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text
    if (ts.isTemplateExpression(e)) {
      let s = e.head.text
      for (const span of e.templateSpans) {
        const v = resolveString(span.expression, sf, depth + 1)
        s += (v == null ? '__DYN__' : v) + span.literal.text
      }
      return s
    }
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const a = resolveString(e.left, sf, depth + 1)
      const b = resolveString(e.right, sf, depth + 1)
      return (a ?? '__DYN__') + (b ?? '__DYN__')
    }
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'join') {
      const arr = resolveNode(e.expression.expression, sf, depth + 1)
      const sep = e.arguments[0] ? resolveString(e.arguments[0], sf, depth + 1) : ','
      if (arr && ts.isArrayLiteralExpression(arr)) {
        const asf = arr.getSourceFile()
        const parts = []
        for (const el of arr.elements) {
          if (ts.isSpreadElement(el)) { const inner = resolveNode(el.expression, asf, depth + 1); if (inner && ts.isArrayLiteralExpression(inner)) parts.push(...inner.elements.map((x) => resolveString(x, inner.getSourceFile(), depth + 1) ?? '__DYN__')); else parts.push('__DYN__') }
          else parts.push(resolveString(el, asf, depth + 1) ?? '__DYN__')
        }
        return parts.join(sep ?? ',')
      }
      return null
    }
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'replace' && e.arguments.length === 2) {
      const base = resolveString(e.expression.expression, sf, depth + 1)
      const pat = unwrap(e.arguments[0]), rep = resolveString(e.arguments[1], sf, depth + 1)
      if (base != null && rep != null) {
        if (ts.isRegularExpressionLiteral(pat)) { const m = /^\/(.*)\/([a-z]*)$/s.exec(pat.text); if (m) try { return base.replace(new RegExp(m[1], m[2]), rep) } catch { return null } }
        const ps = resolveString(pat, sf, depth + 1); if (ps != null) return base.replace(ps, rep)
      }
      return null
    }
    if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) {
      const n = resolveNode(e, sf, depth + 1)
      if (n && n !== e) return resolveString(n, n.getSourceFile(), depth + 1)
      return null
    }
    return null
  }
  // Resolve an expression to a SET of candidate strings (conditionals, literal-union params, object maps, for-of arrays).
  function resolveCandidates(e, sf, depth = 0) {
    e = unwrap(e)
    if (!e || depth > 8) return null
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text]
    if (ts.isConditionalExpression(e)) {
      const a = resolveCandidates(e.whenTrue, sf, depth + 1), b = resolveCandidates(e.whenFalse, sf, depth + 1)
      return a && b ? [...new Set([...a, ...b])] : null
    }
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      const a = resolveCandidates(e.left, sf, depth + 1), b = resolveCandidates(e.right, sf, depth + 1)
      return a && b ? [...new Set([...a, ...b])] : null
    }
    if (ts.isElementAccessExpression(e)) {
      const obj = resolveNode(e.expression, sf, depth + 1)
      if (obj && ts.isObjectLiteralExpression(obj)) {
        const out = []
        for (const p of obj.properties) { if (ts.isPropertyAssignment(p)) { const c = resolveCandidates(p.initializer, sf, depth + 1); if (!c) return null; out.push(...c) } else return null }
        return out
      }
      if (obj && ts.isArrayLiteralExpression(obj)) {
        const out = []
        for (const el of obj.elements) { const c = resolveCandidates(el, sf, depth + 1); if (!c) return null; out.push(...c) }
        return out
      }
      return null
    }
    if (ts.isIdentifier(e)) {
      const { consts } = fileConsts(sf)
      const c = consts.get(e.text)
      if (c && c !== 'AMBIGUOUS') { const r = resolveCandidates(c, c.getSourceFile(), depth + 1); if (r) return r }
      // declaration lookup: parameter / variable with literal-union type, for-of over array literal, let with conditional init
      const decls = declarationsNamed(sf, e.text)
      if (decls.length === 1) {
        const d = decls[0]
        if (d.type) { const u = literalUnion(d.type, sf); if (u) return u }
        if (ts.isVariableDeclaration(d)) {
          const list = d.parent
          if (list && ts.isVariableDeclarationList(list) && list.parent && ts.isForOfStatement(list.parent)) {
            const arr = resolveNode(list.parent.expression, sf, depth + 1)
            if (arr && ts.isArrayLiteralExpression(arr)) { const out = []; for (const el of arr.elements) { const c = resolveCandidates(el, sf, depth + 1); if (!c) return null; out.push(...c) } return out }
            if (arr && ts.isCallExpression(arr) && ts.isPropertyAccessExpression(arr.expression) && ['keys', 'values'].includes(arr.expression.name.text) && ts.isIdentifier(arr.expression.expression) && arr.expression.expression.text === 'Object') {
              const obj = resolveNode(arr.arguments[0], sf, depth + 1)
              if (obj && ts.isObjectLiteralExpression(obj)) {
                if (arr.expression.name.text === 'keys') return obj.properties.map((p) => p.name && propName(p.name)).filter(Boolean)
                const out = []; for (const p of obj.properties) { if (!ts.isPropertyAssignment(p)) return null; const c = resolveCandidates(p.initializer, sf, depth + 1); if (!c) return null; out.push(...c) } return out
              }
            }
            return null
          }
          if (d.initializer) return resolveCandidates(d.initializer, sf, depth + 1)
        }
      }
      const r = resolveString(e, sf, depth + 1)
      return r == null ? null : [r]
    }
    if (ts.isPropertyAccessExpression(e)) {
      // obj.prop where obj is a param typed as a literal-union-valued object? fall back to string resolution
      const r = resolveString(e, sf, depth + 1)
      return r == null ? null : [r]
    }
    const r = resolveString(e, sf, depth + 1)
    return r == null ? null : [r]
  }
  function literalUnion(typeNode, sf) {
    if (ts.isParenthesizedTypeNode(typeNode)) typeNode = typeNode.type
    const parts = ts.isUnionTypeNode(typeNode) ? typeNode.types : [typeNode]
    const out = []
    for (const t of parts) {
      if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) out.push(t.literal.text)
      else if (ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName)) {
        const alias = typeAliasNamed(sf, t.typeName.text)
        if (!alias) return null
        const u = literalUnion(alias.type, sf); if (!u) return null; out.push(...u)
      } else if (ts.isTypeOperatorNode(t) && t.operator === ts.SyntaxKind.KeyOfKeyword && ts.isTypeQueryNode(t.type) && ts.isIdentifier(t.type.exprName)) {
        const obj = resolveNode(t.type.exprName, sf)
        if (obj && ts.isObjectLiteralExpression(obj)) out.push(...obj.properties.map((p) => p.name && propName(p.name)).filter(Boolean)); else return null
      } else if (ts.isIndexedAccessTypeNode(t) && ts.isTypeQueryNode(t.objectType) && ts.isIdentifier(t.objectType.exprName) && ts.isTypeOperatorNode(t.indexType)) {
        // (typeof OBJ)[keyof typeof OBJ] -> values
        const obj = resolveNode(t.objectType.exprName, sf)
        if (obj && ts.isObjectLiteralExpression(obj)) { for (const p of obj.properties) { if (!ts.isPropertyAssignment(p)) return null; const c = resolveCandidates(p.initializer, sf); if (!c) return null; out.push(...c) } } else return null
      } else return null
    }
    return out.length ? out : null
  }
  const declCache = new Map()
  function declarationsNamed(sf, name) {
    let idx = declCache.get(sf.fileName)
    if (!idx) {
      idx = new Map()
      const visit = (n) => {
        if ((ts.isParameter(n) || ts.isVariableDeclaration(n)) && ts.isIdentifier(n.name)) { const a = idx.get(n.name.text) || []; a.push(n); idx.set(n.name.text, a) }
        if (ts.isParameter(n) && ts.isObjectBindingPattern(n.name)) {
          // destructured param { kind }: { kind: 'a' | 'b' } -> look up the type literal member
          for (const el of n.name.elements) if (ts.isIdentifier(el.name) && n.type && ts.isTypeLiteralNode(n.type)) {
            const mem = n.type.members.find((m) => ts.isPropertySignature(m) && propName(m.name) === (el.propertyName ? propName(el.propertyName) : el.name.text))
            if (mem) { const a = idx.get(el.name.text) || []; a.push({ type: mem.type, kind: 'destructured' }); idx.set(el.name.text, a) }
          }
        }
        ts.forEachChild(n, visit)
      }
      visit(sf)
      declCache.set(sf.fileName, idx)
    }
    return idx.get(name) || []
  }
  function typeAliasNamed(sf, name) {
    let found = null
    const visit = (n) => { if (!found && ts.isTypeAliasDeclaration(n) && n.name.text === name) found = n; else ts.forEachChild(n, visit) }
    visit(sf)
    if (found) return found
    // one import hop
    const { imports } = fileConsts(sf)
    const imp = imports.get(name)
    if (imp) { const f = resolveImportFile(sf.fileName, imp.from); if (f) return typeAliasNamed(sourceFile(f), imp.imported) }
    return null
  }
  function objectKeys(e, sf) {
    // returns { keys: [...], spread: bool } or null
    e = unwrap(e)
    if (!e) return null
    if (ts.isObjectLiteralExpression(e)) {
      const keys = []
      const values = {}
      let spread = false
      for (const p of e.properties) {
        if (ts.isSpreadAssignment(p)) {
          const inner = objectKeys(p.expression, sf)
          if (inner) { keys.push(...inner.keys); Object.assign(values, inner.values || {}); if (inner.spread) spread = true } else spread = true
          continue
        }
        if (!p.name || ts.isComputedPropertyName(p.name)) { spread = true; continue }
        keys.push(propName(p.name))
        if (ts.isPropertyAssignment(p)) { const c = resolveCandidates(p.initializer, sf); if (c) values[propName(p.name)] = c }
      }
      return { keys, spread, values }
    }
    if (ts.isArrayLiteralExpression(e)) {
      const keys = new Set()
      let spread = false
      const values = {}
      for (const el of e.elements) {
        const r = objectKeys(el, sf)
        if (!r) { spread = true; continue }
        r.keys.forEach((k) => keys.add(k))
        for (const [k, v] of Object.entries(r.values || {})) values[k] = [...(values[k] || []), ...v]
        if (r.spread) spread = true
      }
      return { keys: [...keys], spread, values }
    }
    if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) {
      const n = resolveNode(e, sf)
      if (n && n !== e) return objectKeys(n, n.getSourceFile())
    }
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'map') {
      // rows.map(r => ({...}))
      const fn = e.arguments[0]
      if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
        let body = fn.body
        if (ts.isBlock(body)) {
          const ret = body.statements.find((s) => ts.isReturnStatement(s))
          body = ret?.expression
        }
        if (body) return objectKeys(body, sf)
      }
    }
    return null
  }
  
  // ---------------------------------------------------------------- select parser (PostgREST)
  function parseSelect(s) {
    // returns list of items: { name, alias, hint, nested: items|null, spread, agg, dyn }
    s = s.replace(/\s+/g, '')
    let i = 0
    function parseList() {
      const items = []
      while (i < s.length && s[i] !== ')') {
        items.push(parseItem())
        if (s[i] === ',') i++
      }
      return items
    }
    function readUntil(stops) {
      let start = i
      let depth = 0
      while (i < s.length) {
        const c = s[i]
        if (depth === 0 && stops.includes(c)) break
        i++
      }
      return s.slice(start, i)
    }
    function parseItem() {
      const it = { spread: false, alias: null, name: '', hint: [], nested: null, cast: null, agg: null }
      if (s.startsWith('...', i)) { it.spread = true; i += 3 }
      let tok = readUntil([',', '(', ')'])
      // alias
      const colon = tok.indexOf(':')
      if (colon > 0 && !tok.startsWith('::') && tok.indexOf('::') !== colon) {
        it.alias = tok.slice(0, colon)
        tok = tok.slice(colon + 1)
      }
      // cast
      const castIdx = tok.indexOf('::')
      if (castIdx >= 0) { it.cast = tok.slice(castIdx + 2); tok = tok.slice(0, castIdx) }
      // hints
      const parts = tok.split('!')
      tok = parts[0]
      it.hint = parts.slice(1)
      // aggregate: col.sum / col.count etc (followed by ())
      const aggM = /^(.*)\.(count|sum|avg|min|max)$/.exec(tok)
      if (s[i] === '(' && aggM) { it.name = aggM[1]; it.agg = aggM[2] }
      else it.name = tok
      if (s[i] === '(') {
        i++
        if (it.agg || it.name === 'count') { // aggregate parens: count() / col.sum()
          readUntil([')']); i++
          if (!it.agg) it.agg = 'count'
        } else {
          it.nested = parseList()
          i++ // ')'
        }
      }
      it.dyn = tok.includes('__DYN__') || (it.alias || '').includes('__DYN__')
      return it
    }
    return parseList()
  }
  
  // ---------------------------------------------------------------- or() filter parser
  function orColumns(s) {
    // returns list of column strings referenced in an .or() / .and() string
    const cols = []
    s = s.replace(/\s+/g, '')
    let i = 0
    function parseGroup() {
      while (i < s.length && s[i] !== ')') {
        let tok = ''
        // read until , or ( or ) at depth 0
        const start = i
        while (i < s.length && s[i] !== ',' && s[i] !== '(' && s[i] !== ')') i++
        tok = s.slice(start, i)
        if (s[i] === '(') {
          const head = tok.replace(/^not\./, '')
          if (head === 'and' || head === 'or') { i++; parseGroup(); if (s[i] === ')') i++ }
          else { // e.g. col.in.(a,b)  -> skip the paren group as value
            let depth = 0
            do { if (s[i] === '(') depth++; else if (s[i] === ')') depth--; i++ } while (i < s.length && depth > 0)
            cols.push(tok)
          }
        } else cols.push(tok)
        if (s[i] === ',') i++
      }
    }
    parseGroup()
    return cols.filter(Boolean).map((t) => {
      t = t.replace(/^not\./, '')
      // col.op.value: column is first segment; but allow rel.col.op.value
      const segs = t.split('.')
      return { col: segs[0], rest: segs.slice(1), raw: t }
    })
  }
  
  // ---------------------------------------------------------------- chain walking
  const FILTER_METHODS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'likeAllOf', 'likeAnyOf', 'ilikeAllOf', 'ilikeAnyOf', 'is', 'in', 'contains', 'containedBy', 'rangeGt', 'rangeGte', 'rangeLt', 'rangeLte', 'rangeAdjacent', 'overlaps', 'textSearch', 'not', 'filter', 'order'])
  const IGNORE_METHODS = new Set(['delete', 'single', 'maybeSingle', 'limit', 'range', 'throwOnError', 'csv', 'returns', 'overrideTypes', 'abortSignal', 'explain', 'head', 'then', 'catch', 'finally', 'geojson', 'rollback', 'setHeader', 'maxAffected'])
  const BUILTIN_FROM = new Set(['Array', 'Buffer', 'Uint8Array', 'Float32Array', 'Int32Array', 'Uint16Array', 'Int16Array', 'Int8Array', 'Uint8ClampedArray', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'Object', 'Promise', 'Observable', 'Set', 'Map', 'Readable', 'Writable', 'Duplex', 'ReadableStream', 'stream'])
  
  function collectChain(rootCall) {
    // rootCall: the CallExpression of .from()/.rpc() or an Identifier reference; walk up.
    const steps = []
    let cur = rootCall
    while (cur.parent && ts.isPropertyAccessExpression(cur.parent) && cur.parent.expression === cur && cur.parent.parent && ts.isCallExpression(cur.parent.parent) && cur.parent.parent.expression === cur.parent) {
      const call = cur.parent.parent
      steps.push({ method: cur.parent.name.text, args: call.arguments, node: call })
      cur = call
    }
    return { steps, end: cur }
  }
  function enclosingScope(n) {
    let p = n.parent
    while (p && !(ts.isBlock(p) || ts.isFunctionLike(p) || ts.isSourceFile(p) || ts.isCaseClause(p))) p = p.parent
    return p
  }
  function continuationsFor(endNode) {
    // If the chain is assigned to a variable, gather later `var.method(...)` chains in the same scope.
    const extra = []
    let p = endNode.parent
    while (p && (ts.isParenthesizedExpression(p) || ts.isAwaitExpression(p) || ts.isAsExpression(p))) p = p.parent
    let varName = null
    if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && p.initializer) varName = p.name.text
    else if (p && ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(p.left)) varName = p.left.text
    if (!varName) return extra
    const scope = enclosingScope(endNode)
    const visit = (n) => {
      if (ts.isIdentifier(n) && n.text === varName && n.pos > endNode.end && n.parent && ts.isPropertyAccessExpression(n.parent) && n.parent.expression === n) {
        const { steps } = collectChain(n)
        if (steps.length) extra.push(...steps)
      }
      ts.forEachChild(n, visit)
    }
    visit(scope)
    return extra
  }
  function line(sf, node) { return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 }
  function isStorageChain(fromCall) {
    const obj = fromCall.expression.expression
    const txt = obj.getText()
    return /\bstorage\b/.test(txt)
  }
  function rootObjectName(fromCall) {
    let o = fromCall.expression.expression
    o = unwrap(o)
    if (ts.isIdentifier(o)) return o.text
    return null
  }
  
  // ---------------------------------------------------------------- checks
  const schema = parseSchema()
  const relationOf = (name) => schema.tables[name] || schema.views[name] || null
  
  function resolveRelation(fromTable, item, ctx) {
    // fromTable: table def or null; item: select item with nested
    const T = fromTable
    const name = item.name
    const hints = item.hint.filter((h) => h !== 'inner' && h !== 'left')
    const hint = hints[0]
    if (hint) {
      const fk = schema.fks[hint]
      if (fk) {
        if (T && fk.table === T.name) return relationOf(fk.referencedRelation)
        if (T && fk.referencedRelation === T.name) return relationOf(fk.table)
        // hint fk on some other table; use the side that is not the current
        return relationOf(fk.referencedRelation === (T && T.name) ? fk.table : fk.referencedRelation)
      }
      // hint is a column name (fk column) on T or on the target table
      if (T) {
        const r = T.rels.find((r) => r.columns.includes(hint))
        if (r) return relationOf(r.referencedRelation)
      }
      const target = relationOf(name)
      if (target) return target
      ctx.notes.push(`unresolved hint '${hint}' on relation '${name}'`)
      return null
    }
    if (relationOf(name)) return relationOf(name)
    if (schema.fks[name]) {
      const fk = schema.fks[name]
      return relationOf(T && fk.table === T.name ? fk.referencedRelation : fk.table)
    }
    if (T) {
      const r = T.rels.find((r) => r.columns.includes(name))
      if (r) return relationOf(r.referencedRelation)
    }
    ctx.notes.push(`unresolved relation '${name}'`)
    return null
  }
  function checkSelect(items, T, ctx, pathPrefix = '') {
    for (const it of items) {
      if (it.dyn) { ctx.unresolved.push(`dynamic select item ${pathPrefix}${it.name || it.alias}`); continue }
      if (it.nested) {
        const target = resolveRelation(T, it, ctx)
        if (!target) continue
        if (!pathPrefix && ctx.aliases) ctx.aliases.set(it.alias || it.name, target)
        checkSelect(it.nested, target, ctx, pathPrefix + (it.alias || it.name) + '.')
        continue
      }
      if (it.agg === 'count' && (it.name === 'count' || it.name === '')) continue
      if (it.name === 'count' && pathPrefix) continue // rel(count) aggregate on an embedded relation
      let col = it.name
      if (col === '*' || col === '') continue
      col = col.split('->')[0]
      if (!T) continue
      STATS.selectCols++
      if (!T.row.has(col)) ctx.bad.push({ kind: 'select', column: pathPrefix + col, table: T.name })
    }
  }
  function checkEnumValue(T, col, values, ctx, method) {
    if (!T || !T.colEnum) return
    const en = T.colEnum[col]
    if (!en) return
    const allowed = schema.enums[en]
    if (!allowed) return
    for (const v of values) {
      if (v == null || v.includes('__DYN__')) continue
      STATS.enumValues++
      if (!allowed.has(v)) ctx.bad.push({ kind: `${method}-enum-value`, column: col, table: T.name, raw: `${v} not in ${en}` })
    }
  }
  function literalValues(e, sf) {
    e = unwrap(e)
    if (!e) return null
    if (ts.isArrayLiteralExpression(e)) { const out = []; for (const el of e.elements) { const c = resolveCandidates(el, sf); if (!c) return null; out.push(...c) } return out }
    if (ts.isNullKeyword?.(e) || e.kind === ts.SyntaxKind.NullKeyword || e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword || ts.isNumericLiteral(e)) return null
    return resolveCandidates(e, sf)
  }
  function checkFilterColumn(colRaw, T, ctx, method) {
    if (colRaw == null) { ctx.unresolved.push(`dynamic ${method} column`); return }
    if (colRaw.includes('__DYN__')) { ctx.unresolved.push(`dynamic ${method} column '${colRaw}'`); return }
    let col = colRaw.split('->')[0]
    // rel.col or rel.rel.col
    if (col.includes('.')) {
      const segs = col.split('.')
      let cur = T
      for (let i = 0; i < segs.length - 1; i++) {
        const aliased = ctx.aliases && ctx.aliases.get(segs[i])
        cur = aliased || (cur ? resolveRelation(cur, { name: segs[i], hint: [] }, ctx) : relationOf(segs[i]))
        if (!cur) return null
      }
      STATS.filterCols++
      if (!cur.row.has(segs[segs.length - 1])) ctx.bad.push({ kind: method, column: colRaw, table: cur.name })
      return { T: cur, col: segs[segs.length - 1] }
    }
    if (!T) return null
    STATS.filterCols++
    if (!T.row.has(col)) ctx.bad.push({ kind: method, column: colRaw, table: T.name })
    return { T, col }
  }
  
  const STATS = { enumValues: 0, selectCols: 0, filterCols: 0, orCols: 0, writeKeys: 0, rpcArgs: 0, helperChains: 0, continuationSteps: 0 }
  const results = [] // per chain
  const rpcResults = []
  const unknownTables = []
  const unknownFns = []
  const files = listFiles()
  
  for (const f of files) {
    const sf = sourceFile(f)
    const rel = path.relative(ROOT, f)
    const visit = (n) => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        const m = n.expression.name.text
        if (m === 'from' && n.arguments.length === 1) handleFrom(n, sf, rel)
        else if (m === 'rpc' && n.arguments.length >= 1) handleRpc(n, sf, rel)
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  
  function handleFrom(call, sf, rel, extraSteps = null, tableArgOverride = null, callerSf = null) {
    if (isStorageChain(call)) return
    const rootName = rootObjectName(call)
    if (rootName && BUILTIN_FROM.has(rootName)) return
    const ln = line(sf, call)
    const cands = tableArgOverride ? resolveCandidates(tableArgOverride, callerSf || sf) : resolveCandidates(call.arguments[0], sf)
    const ctx = { file: rel, line: ln, table: cands ? cands.join('|') : null, bad: [], unresolved: [], notes: [], methods: [], untypedClient: /as unknown as \{\s*from|=> any \}/.test(sf.text), aliases: new Map() }
    if (!cands || cands.some((c) => c.includes('__DYN__'))) {
      ctx.unresolved.push(`dynamic table name: ${(tableArgOverride || call.arguments[0]).getText(sf).slice(0, 60)}`)
      results.push(ctx)
      return
    }
    const { steps, end } = collectChain(call)
    const cont = continuationsFor(end); STATS.continuationSteps += cont.length
    steps.push(...cont)
    if (extraSteps) { steps.push(...extraSteps); STATS.helperChains++ }
    for (const tableName of cands) {
      const T = relationOf(tableName)
      if (!T) { unknownTables.push({ file: rel, line: ln, table: tableName, candidates: cands.length > 1 ? cands : undefined }); continue }
      T.name = tableName
      ctx.aliases = new Map()
      // pass 1: aliases from select strings
      for (const st of steps) if (st.method === 'select' && st.args[0]) { const s0 = resolveString(st.args[0], st.sf || sf); if (s0) try { checkSelect(parseSelect(s0), T, { bad: [], unresolved: [], notes: [], aliases: ctx.aliases }) } catch {} }
      checkChain(T, steps, ctx, sf)
    }
    results.push(ctx)
  }
  function checkChain(T, steps, ctx, sf0) {
    for (const st of steps) {
      const sf = st.sf || sf0
      ctx.methods.push(st.method)
      const a0 = st.args[0]
      if (st.method === 'select') {
        const s = a0 ? resolveString(a0, sf) : '*'
        if (s == null) { ctx.unresolved.push(`select(${a0.getText(sf).slice(0, 50)})`); continue }
        try { checkSelect(parseSelect(s), T, ctx) } catch { ctx.unresolved.push(`select parse error: ${s.slice(0, 60)}`) }
      } else if (FILTER_METHODS.has(st.method)) {
        const cols = a0 ? resolveCandidates(a0, sf) : null
        if (!cols) { ctx.unresolved.push(`dynamic ${st.method} column: ${a0 ? a0.getText(sf).slice(0, 50) : ''}`); continue }
        for (const col of cols) {
          // order(col, { referencedTable }) / order('rel(col)')
          if (st.method === 'order' && st.args[1] && ts.isObjectLiteralExpression(unwrap(st.args[1]))) {
            const ref = unwrap(st.args[1]).properties.find((p) => p.name && ['referencedTable', 'foreignTable'].includes(propName(p.name)))
            if (ref && ts.isPropertyAssignment(ref)) {
              const rt = resolveString(ref.initializer, sf)
              checkFilterColumn(rt ? `${rt}.${col}` : null, T, ctx, 'order')
              continue
            }
          }
          if (st.method === 'order' && /\(/.test(col)) {
            const mm = /^([\w.]+)\(([\w.]+)\)/.exec(col)
            if (mm) { checkFilterColumn(`${mm[1]}.${mm[2]}`, T, ctx, 'order'); continue }
          }
          const hit = checkFilterColumn(col, T, ctx, st.method)
          if (hit && ['eq', 'neq', 'in', 'is', 'contains', 'containedBy', 'overlaps'].includes(st.method) && st.args[1]) {
            const vals = literalValues(st.args[1], sf)
            if (vals) checkEnumValue(hit.T, hit.col, vals, ctx, st.method)
          }
          if (hit && (st.method === 'not' || st.method === 'filter') && st.args[2]) {
            const vals = literalValues(st.args[2], sf)
            if (vals) checkEnumValue(hit.T, hit.col, vals.map((v) => v.replace(/^\(|\)$/g, '')).flatMap((v) => v.split(',')).map((v) => v.trim().replace(/^"|"$/g, '')).filter((v) => v && !v.includes('__DYN__')), ctx, st.method)
          }
        }
      } else if (st.method === 'match') {
        const ok = objectKeys(a0, sf)
        if (!ok) { ctx.unresolved.push('match(dynamic)'); continue }
        for (const k of ok.keys) { const hit = checkFilterColumn(k, T, ctx, 'match'); if (hit && ok.values[k]) checkEnumValue(hit.T, hit.col, ok.values[k], ctx, 'match') }
      } else if (st.method === 'or' || st.method === 'and') {
        const s = a0 ? resolveString(a0, sf) : null
        if (s == null) { ctx.unresolved.push(`${st.method}(${a0 ? a0.getText(sf).slice(0, 50) : ''})`); continue }
        let scopeT = T
        if (st.args[1] && ts.isObjectLiteralExpression(unwrap(st.args[1]))) {
          const ref = unwrap(st.args[1]).properties.find((p) => p.name && ['referencedTable', 'foreignTable'].includes(propName(p.name)))
          if (ref && ts.isPropertyAssignment(ref)) {
            const rt = resolveString(ref.initializer, sf)
            scopeT = rt ? (ctx.aliases.get(rt) || resolveRelation(T, { name: rt, hint: [] }, ctx)) : null
          }
        }
        for (const c of orColumns(s)) {
          if (c.col.includes('__DYN__')) { ctx.unresolved.push(`dynamic or column '${c.raw.slice(0, 40)}'`); continue }
          const col = c.col.split('->')[0]
          if (!scopeT) continue
          STATS.orCols++
          let hitT = null, hitCol = null, rest = c.rest
          if (scopeT.row.has(col)) { hitT = scopeT; hitCol = col }
          else {
            const relT = ctx.aliases.get(c.col) || resolveRelation(scopeT, { name: c.col, hint: [] }, { notes: [] })
            if (relT && c.rest.length >= 2 && relT.row.has(c.rest[0].split('->')[0])) { hitT = relT; hitCol = c.rest[0].split('->')[0]; rest = c.rest.slice(1) }
            else ctx.bad.push({ kind: st.method, column: c.col, table: scopeT.name, raw: c.raw.slice(0, 60) })
          }
          if (hitT && rest.length >= 2 && !c.col.includes('->')) {
            const op = rest[0], val = rest.slice(1).join('.')
            const clean = (v) => v.trim().replace(/^"|"$/g, '')
            if (['eq', 'neq'].includes(op)) checkEnumValue(hitT, hitCol, [clean(val)].filter((v) => v && !v.includes('__DYN__')), ctx, st.method)
            else if (op === 'in') checkEnumValue(hitT, hitCol, val.replace(/^\(|\)$/g, '').split(',').map(clean).filter((v) => v && !v.includes('__DYN__')), ctx, st.method)
          }
        }
      } else if (st.method === 'insert' || st.method === 'upsert' || st.method === 'update') {
        const ok = a0 ? objectKeys(a0, sf) : null
        if (T.kind === 'view') { ctx.bad.push({ kind: st.method, column: '(view is not writable via types)', table: T.name }); }
        if (!ok) { ctx.unresolved.push(`${st.method}(${a0 ? a0.getText(sf).slice(0, 40) : ''})`); continue }
        const target = st.method === 'update' ? T.update : T.insert
        if (!target) continue
        for (const k of ok.keys) { STATS.writeKeys++; if (!target.has(k)) ctx.bad.push({ kind: st.method, column: k, table: T.name }); else if (ok.values[k]) checkEnumValue(T, k, ok.values[k], ctx, st.method) }
        if (ok.spread) ctx.notes.push(`${st.method} has spread/computed keys (partial check)`)
        if (st.method === 'upsert' && st.args[1] && ts.isObjectLiteralExpression(unwrap(st.args[1]))) {
          const oc = unwrap(st.args[1]).properties.find((p) => p.name && propName(p.name) === 'onConflict')
          if (oc && ts.isPropertyAssignment(oc)) {
            const s = resolveString(oc.initializer, sf)
            if (s) for (const c of s.split(',')) { const cc = c.trim(); if (cc && !cc.includes('__DYN__') && !T.row.has(cc)) ctx.bad.push({ kind: 'onConflict', column: cc, table: T.name }) }
          }
        }
      } else if (IGNORE_METHODS.has(st.method)) {
        // nothing
      } else {
        ctx.notes.push(`unknown method .${st.method}()`)
      }
    }
  }
  
  function handleRpc(call, sf, rel) {
    const ln = line(sf, call)
    const name = resolveString(call.arguments[0], sf)
    const ctx = { file: rel, line: ln, fn: name, bad: [], unresolved: [], notes: [], missingRequired: [] }
    if (name == null || name.includes('__DYN__')) { ctx.unresolved.push('dynamic rpc name'); rpcResults.push(ctx); return }
    // not a supabase rpc? (e.g. other libs): check existence
    const sigs = schema.functions[name]
    if (!sigs) { unknownFns.push({ file: rel, line: ln, fn: name, text: call.getText(sf).slice(0, 80) }); rpcResults.push(ctx); return }
    const a1 = call.arguments[1]
    if (a1) {
      const ok = objectKeys(a1, sf)
      if (!ok) ctx.unresolved.push(`args: ${a1.getText(sf).slice(0, 50)}`)
      else {
        const allArgs = new Set()
        for (const s of sigs) if (s.args) Object.keys(s.args).forEach((k) => allArgs.add(k))
        for (const k of ok.keys) { STATS.rpcArgs++; if (!allArgs.has(k)) ctx.bad.push({ kind: 'rpc-arg', column: k, fn: name }) }
        // required args satisfied by at least one overload?
        const given = new Set(ok.keys)
        const satisfied = sigs.some((s) => s.args && Object.entries(s.args).every(([k, req]) => !req || given.has(k)))
        if (!satisfied && !ok.spread) {
          ctx.missingRequired = sigs.map((s) => s.args ? Object.entries(s.args).filter(([k, req]) => req && !given.has(k)).map(([k]) => k) : [])
        }
      }
    } else {
      const satisfied = sigs.some((s) => s.args && Object.values(s.args).every((req) => !req))
      if (!satisfied) ctx.missingRequired = sigs.map((s) => s.args ? Object.entries(s.args).filter(([, r]) => r).map(([k]) => k) : [])
    }
    // chained select/filters on rpc results
    const { steps, end } = collectChain(call)
    steps.push(...continuationsFor(end))
    const ret = sigs[0]?.returns
    let T = null
    if (ret?.kind === 'table') T = relationOf(ret.table)
    else if (ret?.kind === 'object') T = { name: `${name}()`, row: ret.keys, rels: [], kind: 'fn' }
    for (const st of steps) {
      const a0 = st.args[0]
      if (st.method === 'select') {
        const s = a0 ? resolveString(a0, sf) : '*'
        if (s == null) { ctx.unresolved.push('select(dynamic)'); continue }
        if (T) try { checkSelect(parseSelect(s), T, ctx) } catch { ctx.unresolved.push('select parse error') }
      } else if (FILTER_METHODS.has(st.method)) {
        const col = a0 ? resolveString(a0, sf) : null
        if (T) checkFilterColumn(col, T, ctx, st.method)
      }
    }
    rpcResults.push(ctx)
  }
  
  // ---------------------------------------------------------------- helper builders: fn() { return db.from('x') } then fn().select(...)
  // For each function whose returned expression is a .from('<literal>') chain, treat every call `fn(...)` as a chain root.
  const HELPER_INDEX = new Map()
  for (const f of files) {
    const sf = sourceFile(f)
    const rel = path.relative(ROOT, f)
    const helpers = new Map() // name -> fromCall
    const visit = (n) => {
      let name = null, body = null
      if (ts.isFunctionDeclaration(n) && n.name && n.body) { name = n.name.text; body = n.body }
      else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(unwrap(n.initializer)) || ts.isFunctionExpression(unwrap(n.initializer)))) { name = n.name.text; body = unwrap(n.initializer).body }
      if (name && body) {
        let retExpr = null
        if (ts.isBlock(body)) { const rets = body.statements.filter((s) => ts.isReturnStatement(s) && s.expression); if (rets.length === 1) retExpr = rets[0].expression }
        else retExpr = body
        retExpr = retExpr && unwrap(retExpr)
        if (retExpr) {
          // find chain root
          let cur = retExpr
          const steps = []
          while (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression) && cur.expression.name.text !== 'from') {
            steps.unshift({ method: cur.expression.name.text, args: cur.arguments, node: cur })
            cur = unwrap(cur.expression.expression)
          }
          if (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression) && cur.expression.name.text === 'from' && cur.arguments.length === 1 && !isStorageChain(cur)) {
            const tn = resolveString(cur.arguments[0], sf)
            if (tn && !tn.includes('__DYN__')) helpers.set(name, { fromCall: cur, prefix: steps })
            else {
              const arg = unwrap(cur.arguments[0])
              const fnNode = ts.isFunctionDeclaration(n) ? n : unwrap(n.initializer)
              if (ts.isIdentifier(arg) && fnNode.parameters) {
                const idx = fnNode.parameters.findIndex((pp) => ts.isIdentifier(pp.name) && pp.name.text === arg.text)
                if (idx >= 0) helpers.set(name, { fromCall: cur, prefix: steps, paramIndex: idx })
              }
            }
          }
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
    if (!helpers.size) continue
    HELPER_INDEX.set(f, helpers)
    // callers in this file
    const visit2 = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && helpers.has(n.expression.text)) {
        const h = helpers.get(n.expression.text)
        const { steps, end } = collectChain(n)
        const cont = continuationsFor(end)
        if (steps.length || cont.length) {
          // synthesize: run handleFrom on the helper's from-call but with the caller's steps
          const saved = results.length
          handleFrom(h.fromCall, sf, rel, [...h.prefix, ...steps, ...cont], h.paramIndex != null ? n.arguments[h.paramIndex] : null)
          const r = results[results.length - 1]
          if (results.length > saved) { r.line = line(sf, n); r.viaHelper = n.expression.text }
        }
      }
      ts.forEachChild(n, visit2)
    }
    visit2(sf)
  }
  
  // cross-file callers of exported helpers (one import hop)
  for (const f of files) {
    const sf = sourceFile(f)
    const rel = path.relative(ROOT, f)
    const { imports } = fileConsts(sf)
    const local = new Map()
    for (const [localName, imp] of imports) {
      const target = resolveImportFile(f, imp.from)
      if (target && HELPER_INDEX.has(target) && HELPER_INDEX.get(target).has(imp.imported)) local.set(localName, { ...HELPER_INDEX.get(target).get(imp.imported), file: target })
    }
    if (!local.size) continue
    const visit = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && local.has(n.expression.text)) {
        const h = local.get(n.expression.text)
        const { steps, end } = collectChain(n)
        const cont = continuationsFor(end)
        if (steps.length || cont.length) {
          const saved = results.length
          handleFrom(h.fromCall, sourceFile(h.file), rel, [...h.prefix, ...steps.map((x) => ({ ...x, sf })), ...cont.map((x) => ({ ...x, sf }))], h.paramIndex != null ? n.arguments[h.paramIndex] : null, sf)
          const r = results[results.length - 1]
          if (results.length > saved) { r.line = line(sf, n); r.viaHelper = n.expression.text + ' (imported)'; r.file = rel }
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  

  // ---------------------------------------------------------------- report
  const skipped = { dynamicTable: 0, dynamicPayload: 0, dynamicColumn: 0, dynamicFilter: 0, dynamicSelect: 0, dynamicRpc: 0, other: 0 }
  const skippedSites = []
  const classify = (s) => {
    if (s.startsWith('dynamic table name')) return 'dynamicTable'
    if (/^(insert|update|upsert)\(|^match\(dynamic\)/.test(s)) return 'dynamicPayload'
    if (/^dynamic \w+ column/.test(s)) return 'dynamicColumn'
    if (/^(or|and)\(|^dynamic or column/.test(s)) return 'dynamicFilter'
    if (/^select\(|^select parse error|^dynamic select item/.test(s)) return 'dynamicSelect'
    if (/^dynamic rpc name|^args:/.test(s)) return 'dynamicRpc'
    return 'other'
  }
  for (const r of [...results, ...rpcResults]) {
    for (const s of r.unresolved) {
      const k = classify(s)
      skipped[k]++
      skippedSites.push({ file: r.file, line: r.line, reason: k, detail: s.slice(0, 80) })
    }
  }

  return {
    meta: {
      root: ROOT,
      typesFile: TYPES_FILE,
      filesScanned: files.length,
      fromChains: results.length,
      rpcCalls: rpcResults.length,
      tables: Object.keys(schema.tables).length,
      views: Object.keys(schema.views).length,
      functions: Object.keys(schema.functions).length,
      stats: STATS,
    },
    unknownTables,
    unknownFunctions: unknownFns,
    columnFindings: results
      .filter((r) => r.bad.length)
      .map((r) => ({ file: r.file, line: r.line, table: r.table, viaHelper: r.viaHelper, bad: r.bad })),
    rpcFindings: rpcResults
      .filter((r) => r.bad.length || r.missingRequired.length)
      .map((r) => ({ file: r.file, line: r.line, fn: r.fn, bad: r.bad, missingRequired: r.missingRequired })),
    skipped,
    skippedSites,
  }
}

/** Flatten a report into one violation per phantom, each with a file:line. */
export function violationsOf(report) {
  const out = []
  for (const u of report.unknownTables) {
    out.push({ file: u.file, line: u.line, kind: 'table', table: u.table, column: null, message: `unknown table or view '${u.table}'` })
  }
  for (const u of report.unknownFunctions) {
    out.push({ file: u.file, line: u.line, kind: 'rpc', table: u.fn, column: null, message: `unknown rpc '${u.fn}'` })
  }
  for (const f of report.columnFindings) {
    for (const b of f.bad) {
      out.push({
        file: f.file,
        line: f.line,
        kind: b.kind,
        table: b.table,
        column: b.column,
        message: `${b.table}.${b.column} (${b.kind}${b.raw ? `: ${b.raw}` : ''}${f.viaHelper ? `, via ${f.viaHelper}` : ''})`,
      })
    }
  }
  for (const f of report.rpcFindings) {
    for (const b of f.bad) {
      out.push({ file: f.file, line: f.line, kind: 'rpc-arg', table: f.fn, column: b.column, message: `rpc ${f.fn}() has no argument '${b.column}'` })
    }
    if (f.missingRequired.length) {
      const need = f.missingRequired.map((m) => m.join(', ')).filter(Boolean).join(' | ')
      out.push({ file: f.file, line: f.line, kind: 'rpc-missing-arg', table: f.fn, column: null, message: `rpc ${f.fn}() is missing required argument(s): ${need || '(see types)'}` })
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
}

/** Split violations into the ones that stand and the ones an ALLOWLIST entry covers; also report
 *  entries that matched nothing (stale, and a failure in their own right). */
export function applyAllowlist(violations, allowlist = ALLOWLIST) {
  const used = new Set()
  const remaining = []
  for (const v of violations) {
    const idx = allowlist.findIndex(
      (a) => a.file === v.file && a.table === v.table && (a.column ?? null) === (v.column ?? null) && (!a.kind || a.kind === v.kind),
    )
    if (idx >= 0) used.add(idx)
    else remaining.push(v)
  }
  const stale = allowlist.filter((_, i) => !used.has(i))
  return { remaining, allowed: violations.length - remaining.length, stale }
}

/** The floor, as a message rather than an exit, so the CLI and the test enforce the same numbers.
 *  Null when the corpus is real. */
export function floorFailure(report) {
  const { filesScanned, fromChains, rpcCalls } = report.meta
  if (filesScanned >= MIN_FILES && fromChains >= MIN_CHAINS && rpcCalls >= MIN_RPC_CALLS) return null
  return (
    `\n✗ check:schema-contract saw nothing it can vouch for, and a clean verdict over nothing is not a pass.\n` +
    `    files walked:    ${filesScanned} (floor ${MIN_FILES})\n` +
    `    .from() chains:  ${fromChains} (floor ${MIN_CHAINS})\n` +
    `    .rpc() calls:    ${rpcCalls} (floor ${MIN_RPC_CALLS})\n` +
    `  Either the source tree moved, the chain matcher stopped matching, or this ran from the wrong\n` +
    `  root (${report.meta.root}). All three are real problems. None of them is a pass.\n`
  )
}

export function formatSkips(report) {
  const s = report.skipped
  return (
    `skipped, counted, not crashed: ${s.dynamicTable} dynamic table name(s) (untyped builders such as ` +
    `lib/outbound/db.ts), ${s.dynamicPayload} runtime-built payload(s), ${s.dynamicColumn} dynamic column(s), ` +
    `${s.dynamicFilter} dynamic filter string(s), ${s.dynamicSelect} dynamic select(s), ${s.dynamicRpc} dynamic rpc(s)` +
    (s.other ? `, ${s.other} other` : '')
  )
}

function main() {
  const argv = process.argv.slice(2)
  const rootIdx = argv.indexOf('--root')
  const root = rootIdx >= 0 ? argv[rootIdx + 1] : REPO_ROOT
  const json = argv.includes('--json')

  let report
  try {
    report = scanSchemaContract({ root })
  } catch (e) {
    console.error(`✗ check:schema-contract could not read the contract: ${e.message}`)
    process.exit(2)
  }
  if (json) {
    process.stdout.write(JSON.stringify({ ...report, violations: violationsOf(report) }, null, 2))
  }

  // The allowlist names sites in THIS repo; a fixture root (the tests' planted trees) gets none, so a
  // stale-entry failure can never be caused by scanning somewhere the entries do not exist.
  const list = path.resolve(root) === path.resolve(REPO_ROOT) ? ALLOWLIST : []
  const { remaining, allowed, stale } = applyAllowlist(violationsOf(report), list)
  const m = report.meta
  const summary =
    `${m.filesScanned} files, ${m.fromChains} .from() chains, ${m.rpcCalls} .rpc() calls against ` +
    `${m.tables} tables, ${m.views} views, ${m.functions} functions ` +
    `(${m.stats.selectCols} select + ${m.stats.filterCols} filter + ${m.stats.orCols} or() columns, ` +
    `${m.stats.writeKeys} write keys, ${m.stats.rpcArgs} rpc args, ${m.stats.enumValues} enum values)`

  if (remaining.length || stale.length) {
    console.error(`\n✗ check:schema-contract: ${remaining.length} phantom reference(s) the generated types do not know.\n`)
    for (const v of remaining) console.error(`  ${v.file}:${v.line}  ${v.message}`)
    for (const a of stale) {
      console.error(`  ALLOWLIST entry matches nothing and must be removed: ${a.file} ${a.table}.${a.column ?? '*'} (added ${a.added})`)
    }
    console.error(
      `\n  A phantom column on an UNTYPED path is invisible to tsc and fails at runtime with PGRST204,\n` +
        `  which is how the campaign approval spine stuck 12 live campaigns in draft (ADR-1207). Fix the\n` +
        `  reference, regenerate lib/database.types.ts if the schema is ahead of the types, or add ONE\n` +
        `  named, dated ALLOWLIST entry in scripts/check-schema-contract.mjs with the reason.\n` +
        `\n  ${summary}\n  ${formatSkips(report)}\n`,
    )
    process.exit(1)
  }

  const floor = floorFailure(report)
  if (floor) {
    console.error(floor)
    process.exit(2)
  }

  console.log(`✓ Schema contract: ${summary}; 0 phantoms${allowed ? `, ${allowed} allowlisted` : ''}.`)
  console.log(`  ${formatSkips(report)}.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
