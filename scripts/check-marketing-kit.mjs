#!/usr/bin/env node
// check:marketing-kit — public route files compose the Frequency page kit; section markup lives in the kit.
//
// The route guard is intentionally AST-based. A section moved into an imported helper, or a layout
// class assembled in a JSX expression, must not disappear from the contract just because the source
// stopped matching a line-oriented regex. Editor-authored page blocks are a separate, explicit content
// renderer; their implementation is not treated as application-owned page composition here.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import ts from 'typescript'
import { invokedDirectly } from './lib/invoked-directly.mjs'

const ROOTS = ['app/(marketing)', 'app/for', 'app/privacy', 'app/terms']
const LEGACY = new Set(readFileSync('scripts/marketing-kit-baseline.txt', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')))
const STRUCTURAL_TAGS = new Set(['section', 'main', 'header', 'footer'])
const LEGAL_CONTENT_TAGS = new Set(['section', 'div', 'h2', 'h3', 'p', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'br'])
const LEGAL_ROUTES = new Set(['app/privacy/page.tsx', 'app/terms/page.tsx'])
const CANONICAL_SECTION_PREFIXES = [
  'components/frequency/site/pages/',
  'components/frequency/site/shell/',
]
const CONTENT_RENDERER = 'lib/page-editor/block-render.tsx'
const ROOT = resolve('.')

function toRepoPath(file) {
  return relative(ROOT, resolve(file)).split(sep).join('/')
}

function pages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) return pages(file)
    return entry.name === 'page.tsx' ? [toRepoPath(file)] : []
  })
}

function sourceFile(file, source) {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

function componentModuleSpecifiers(ast) {
  const imported = new Map()
  const found = []
  for (const statement of ast.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteralLike(statement.moduleSpecifier)) {
      const clause = statement.importClause
      if (!clause) continue
      if (clause.name) imported.set(clause.name.text, statement.moduleSpecifier.text)
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const binding of clause.namedBindings.elements) imported.set(binding.name.text, statement.moduleSpecifier.text)
      }
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        imported.set(clause.namedBindings.name.text, statement.moduleSpecifier.text)
      }
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)) {
      found.push(statement.moduleSpecifier.text)
    }
  }
  const used = new Set()
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName
      const rootName = ts.isIdentifier(tag) ? tag.text : ts.isPropertyAccessExpression(tag) ? tag.expression.getText(ast) : ''
      if (rootName && imported.has(rootName)) used.add(imported.get(rootName))
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteralLike(node.arguments[0])) {
      found.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return [...new Set([...found, ...used])]
}

function jsxTagName(node, ast) {
  const tag = node.tagName
  return ts.isIdentifier(tag) ? tag.text : tag.getText(ast)
}

function importsLegalPage(ast, file, resolveLocalImport) {
  const imported = ast.statements.some((statement) => ts.isImportDeclaration(statement)
    && statement.importClause?.namedBindings
    && ts.isNamedImports(statement.importClause.namedBindings)
    && statement.importClause.namedBindings.elements.some((binding) => binding.name.text === 'LegalPage'
      && resolveLocalImport(file, statement.moduleSpecifier.text) === 'components/legal/legal-page.tsx'))
  if (!imported) return false
  let rendered = false
  const visit = (node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && node.tagName.text === 'LegalPage') rendered = true
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return rendered
}

/**
 * Inspect one public route and the local TS/TSX modules it composes.
 * `readSource` and `resolveLocalImport` are injectable so fixtures exercise the same AST contract.
 */
export function inspectMarketingPage(entry, { readSource, resolveLocalImport }) {
  const problems = []
  const legacy = LEGACY.has(entry)
  const entrySource = readSource(entry)
  if (entrySource == null) return [`${entry}: page source could not be read`]
  const entryAst = sourceFile(entry, entrySource)
  const legal = LEGAL_ROUTES.has(entry) && importsLegalPage(entryAst, entry, resolveLocalImport)
  const visited = new Set()
  let legacyStillOwnsPresentation = false

  const inspectRouteMarkup = () => {
    const visit = (node, insideLegalSlot = false) => {
      const legalScope = legal && (insideLegalSlot || (ts.isJsxElement(node) && ts.isIdentifier(node.openingElement.tagName)
        && node.openingElement.tagName.text === 'LegalPage'))
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName)) {
        const tag = jsxTagName(node, entryAst)
        if (/^[a-z]/.test(tag)) {
          const className = node.attributes.properties.find((property) => ts.isJsxAttribute(property)
            && property.name.getText(entryAst) === 'className')
          legacyStillOwnsPresentation = true
          const allowedLegalClass = legal && tag === 'div' && className?.initializer
            && ts.isStringLiteral(className.initializer) && className.initializer.text === 'lg-note'

          if (!legacy && !legal) {
            problems.push(`${entry}: route markup owns <${tag}>; compose a Frequency page/section component`)
          }
          if (legal && !legacy && !insideLegalSlot) {
            problems.push(`${entry}: legal page markup must stay inside its shared LegalPage content slot`)
          }
          if (legal && insideLegalSlot && !LEGAL_CONTENT_TAGS.has(tag)) {
            problems.push(`${entry}: <${tag}> is not an approved legal content element`)
          }
          if (legal && className && !allowedLegalClass) {
            problems.push(`${entry}: legal content has an unapproved className on <${tag}>; use the shared LegalPage reading styles`)
          }
        }
      }
      ts.forEachChild(node, (child) => visit(child, legalScope))
    }
    visit(entryAst)
  }

  const isCanonicalSection = (file) => CANONICAL_SECTION_PREFIXES.some((prefix) => file.startsWith(prefix))
  const inspectImportedSections = (file) => {
    if (visited.has(file) || file === CONTENT_RENDERER) return
    visited.add(file)
    const source = readSource(file)
    if (source == null) return
    const ast = sourceFile(file, source)
    let hasSectionSurface = false
    const visit = (node) => {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName)) {
        const tag = jsxTagName(node, ast)
        const hasScreenLabel = node.attributes.properties.some((property) => ts.isJsxAttribute(property)
          && property.name.getText(ast) === 'data-screen-label')
        if (/^[a-z]/.test(tag) && (STRUCTURAL_TAGS.has(tag) || hasScreenLabel)) hasSectionSurface = true
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
    if (hasSectionSurface && !isCanonicalSection(file) && file !== 'components/legal/legal-page.tsx') {
      problems.push(`${file}: imported page section is outside the Frequency site page/shell kit`)
    }
    for (const specifier of componentModuleSpecifiers(ast)) {
      const dependency = resolveLocalImport(file, specifier)
      if (dependency) inspectImportedSections(dependency)
    }
  }

  inspectRouteMarkup()
  if (legacy && legacyStillOwnsPresentation) problems.push(`${entry}: legacy route markup remains on its shrinking baseline`)
  for (const specifier of componentModuleSpecifiers(entryAst)) {
    const dependency = resolveLocalImport(entry, specifier)
    if (dependency) inspectImportedSections(dependency)
  }
  return [...new Set(problems)]
}

function main() {
  const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile)
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  const compilerOptions = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT).options
  const readSource = (file) => {
    const absolute = resolve(ROOT, file)
    return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null
  }
  const resolveLocalImport = (from, specifier) => {
    const resolved = ts.resolveModuleName(specifier, resolve(ROOT, from), compilerOptions, ts.sys).resolvedModule?.resolvedFileName
    if (!resolved || !/\.tsx?$/.test(resolved)) return null
    const path = toRepoPath(resolved)
    return path.startsWith('../') || path.startsWith('node_modules/') ? null : path
  }

  const routes = ROOTS.flatMap((root) => { try { return pages(root) } catch { return [] } })
  const findings = routes.flatMap((route) => inspectMarketingPage(route, { readSource, resolveLocalImport }))
  const offenders = [...new Set(findings.map((finding) => finding.split(':')[0]))].sort()
  const fresh = offenders.filter((path) => !LEGACY.has(path))
  const healed = [...LEGACY].filter((path) => !offenders.includes(path))

  if (fresh.length || healed.length) {
    console.error('✗ marketing-kit: public pages must compose shared Frequency page sections; route markup cannot own layout or presentation.\n')
    for (const finding of findings) console.error(`    - ${finding}`)
    if (healed.length) {
      console.error('\n  Remove legacy route entries that no longer need the exception:')
      for (const path of healed) console.error(`    - ${path}`)
    }
    process.exit(1)
  }
  console.log(`✓ marketing-kit: ${offenders.length} legacy page(s) on the baseline; imported sections and route markup comply.`)
}

if (invokedDirectly(import.meta.url)) main()
