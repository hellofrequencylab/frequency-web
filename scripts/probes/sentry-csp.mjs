import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

import { loadProbeModule } from '../lib/probe-module.mjs'

// Evaluate actual canonical CSP declarations and resolver, without the build plugin.
const { resolveDesign } = loadProbeModule('lib/theme/design.ts')
const source = readFileSync('next.config.ts', 'utf8')
const ast = ts.createSourceFile('next.config.ts', source, ts.ScriptTarget.Latest, true)
const declarations = []
let found = false
for (const statement of ast.statements) {
  if (!ts.isVariableStatement(statement)) continue
  declarations.push(statement.getText(ast))
  if (statement.declarationList.declarations.some(d => d.name.getText(ast) === 'csp')) { found = true; break }
}
assert.ok(found, 'Actual CSP declaration must exist')
const body = ts.transpileModule(declarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const evaluate = new Function('process', 'resolveDesign', `${body}; return csp`)
const audited = 'https://o4512171150934016.ingest.us.sentry.io'
for (const dsn of ['', 'https://public-key@o4512171150934016.ingest.us.sentry.io/456', 'not-a-dsn', 'javascript:alert(1)', 'http://example.test/1', 'https://public-key@unrelated.ingest.us.sentry.io/456']) {
  const configured = evaluate({ env: { NODE_ENV: 'production', NEXT_PUBLIC_SENTRY_DSN: dsn } }, resolveDesign)
  const connect = configured.split(';').find(d => d.trim().startsWith('connect-src ')).trim().split(/\s+/).slice(1)
  assert.ok(connect.includes(audited), 'The canonical audited ingest origin must remain reachable')
  assert.deepEqual(connect.filter(source => /sentry\.io/.test(source)), [audited])
  for (const secret of ['public-key', '/456', '*.sentry.io', 'unrelated.ingest.us.sentry.io', 'example.test', "'unsafe-eval'"]) assert.ok(!configured.includes(secret), secret)
  for (const directive of ["object-src 'none'", "frame-ancestors 'self'", "base-uri 'self'"]) assert.ok(configured.includes(directive))
}
console.log('Actual canonical CSP permits only the audited Sentry organization and preserves restrictions; no unused dynamic resolver remains.')
