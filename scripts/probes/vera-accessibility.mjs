import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const mode = process.argv[2]
assert.ok(['transcripts', 'overlays'].includes(mode))
function walk(node, action) { action(node); ts.forEachChild(node, child => walk(child, action)) }
function tree(file) { return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) }
function tags(ast) {
  const found = []
  walk(ast, n => { if (ts.isJsxElement(n)) found.push([n.openingElement, n]); else if (ts.isJsxSelfClosingElement(n)) found.push([n, n]) })
  return found
}
function props(tag) {
  return new Map(tag.attributes.properties.filter(ts.isJsxAttribute).map(p => [p.name.getText(), p.initializer && ts.isStringLiteral(p.initializer) ? p.initializer.text : p.initializer?.getText() ?? true]))
}
if (mode === 'transcripts') {
  for (const file of ['components/vera/vera-chat.tsx', 'components/onboarding/vera-lightbox.tsx']) {
    const ast = tree(file), logs = tags(ast).filter(([tag]) => props(tag).get('role') === 'log')
    assert.equal(logs.length, 1, `${file}: one actual transcript live region`)
    const [tag, region] = logs[0], attributes = props(tag)
    assert.equal(attributes.get('aria-live'), 'polite')
    assert.equal(attributes.get('aria-relevant'), 'additions')
    assert.equal(attributes.get('aria-atomic'), 'false')
    assert.ok(typeof attributes.get('aria-label') === 'string' && attributes.get('aria-label').trim().length > 0)
    assert.equal(tags(region).some(([child]) => ['input', 'textarea'].includes(child.tagName.getText(ast))), false, 'Composer stays outside announced transcript')
  }
  for (const [file, component] of [['components/vera/vera-launcher.tsx', 'VeraChat'], ['app/(main)/feed/page.tsx', 'VeraLightbox']]) assert.ok(tags(tree(file)).some(([tag]) => tag.tagName.getText() === component), `${component} remains wired`)
} else {
  for (const file of ['app/join/(induction)/induction.tsx', 'components/sidebar/invite-friend-button.tsx', 'components/feed/capture-launcher.tsx', 'components/onboarding/vera-lightbox.tsx']) {
    const ast = tree(file)
    assert.ok(ast.statements.some(n => ts.isImportDeclaration(n) && n.moduleSpecifier.text === '@/components/ui/dialog' && n.importClause?.namedBindings?.elements?.some(e => e.name.text === 'Dialog')), `${file}: canonical Dialog import`)
    const dialogs = tags(ast).filter(([tag]) => tag.tagName.getText(ast) === 'Dialog')
    assert.ok(dialogs.length, `${file}: actual shared Dialog`)
    for (const [tag] of dialogs) assert.ok(props(tag).has('ariaLabel') || props(tag).has('ariaLabelledBy'), `${file}: named dialog`)
    assert.equal(tags(ast).some(([tag]) => props(tag).get('role') === 'dialog'), false, `${file}: no hand-rolled modal`)
  }
}
console.log(`Current Vera ${mode} source contracts pass; client rendering and focus behavior remain covered separately by existing tests. Retired concierge, chores overlay and TeaserGate are not active surfaces.`)
