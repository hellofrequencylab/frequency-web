// HYG-190: cheap source binding guard, paired with actual rendered interaction tests.
// This establishes selection attributes read the same state as the existing setter,
// not browser/assistive-technology acceptance.
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import assert from 'node:assert/strict'

const parse = (file) => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const compact = (text) => text.replace(/\s+/g, '')
function openings(source) {
  const result = []
  function walk(node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === 'button') result.push(node)
    ts.forEachChild(node, walk)
  }
  walk(source)
  return result
}
function attribute(button, name) {
  return button.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText() === name)?.initializer
}
for (const [file, setter, predicate] of [
  ['components/admin/page-settings/status-editor.tsx', 'setStatus(s)', 'status===s'],
  ['components/admin/crm/tasks-workspace.tsx', 'setTab(t.key)', 'tab===t.key'],
  ['components/elements/previews.tsx', 'setSort(s)', 'sort===s'],
]) {
  const source = parse(file)
  const button = openings(source).find(b => compact(attribute(b, 'onClick')?.getText(source) ?? '').includes(setter))
  assert.ok(button, `${file}: expected actual selection control`)
  assert.equal(compact(attribute(button, 'aria-pressed')?.getText(source) ?? ''), `{${predicate}}`, `${file}: selected state must be announced`)
}
const source = parse('app/(main)/admin/content/practices/practices-table.tsx')
const master = openings(source).find(b => compact(attribute(b, 'onClick')?.getText(source) ?? '').includes('onToggle(!on)'))
assert.ok(master, 'expected actual public master switch')
assert.equal(attribute(master, 'role')?.text, 'switch')
assert.equal(compact(attribute(master, 'aria-checked')?.getText(source) ?? ''), '{on}')
assert.equal(compact(attribute(master, 'aria-label')?.getText(source) ?? ''), '{`All${label}`}')
console.log('Admin selection state bindings pass (source contract; rendered tests run in CI).')
