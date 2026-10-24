import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Evaluate the real pure helper and actual config declarations, without loading
// the Sentry build plugin or spawning a second test runner from the ledger.
const helper = ts.transpileModule(readFileSync('lib/observability/sentry-csp.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const exports = {}
new Function('exports', helper)(exports)
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
const evaluate = new Function('process', 'sentryCspSource', `${body}; return csp`)
const policy = dsn => evaluate({ env: { NODE_ENV: 'production', NEXT_PUBLIC_SENTRY_DSN: dsn } }, exports.sentryCspSource)
const configured = policy('https://public-key@o123.ingest.us.sentry.io/456')
assert.ok(configured.split(';').find(d => d.trim().startsWith('connect-src ')).split(/\s+/).includes('https://o123.ingest.us.sentry.io'))
for (const secret of ['public-key', '/456', '*.sentry.io', "'unsafe-eval'"]) assert.ok(!configured.includes(secret), secret)
for (const directive of ["object-src 'none'", "frame-ancestors 'self'", "base-uri 'self'"]) assert.ok(configured.includes(directive))
for (const input of ['', 'not-a-dsn', 'javascript:alert(1)', 'http://example.test/1']) {
  assert.equal(exports.sentryCspSource(input), '')
  assert.ok(!policy(input).includes('sentry.io'))
}
assert.ok(evaluate({ env: { NODE_ENV: 'production', SENTRY_DSN: 'https://public-key@self-hosted.example.test/1' } }, exports.sentryCspSource).includes('https://self-hosted.example.test'))
console.log('Configured HTTPS telemetry origin is reachable in the actual CSP; credentials, paths, wildcards and unsafe schemes are excluded.')
