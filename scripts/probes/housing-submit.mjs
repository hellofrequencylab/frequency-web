import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { loadProbeModule } from '../lib/probe-module.mjs'

const root = 'app/(main)/(marketplace)/housing/new/'
const source = ts.createSourceFile('housing-form.tsx', readFileSync(root + 'housing-form.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let forms = 0, submits = 0
function visit(node) {
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === 'form') forms++
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === 'HousingSubmit') {
    submits++
    let parent = node.parent
    while (parent && !(ts.isJsxElement(parent) && parent.openingElement.tagName.getText(source) === 'form')) parent = parent.parent
    assert.ok(parent, 'The pending-aware submit must render inside its form')
  }
  ts.forEachChild(node, visit)
}
visit(source)
assert.equal(forms, 1)
assert.equal(submits, 1)
const utils = loadProbeModule('lib/utils.ts')
const { Button } = loadProbeModule('components/ui/button.tsx', {
  react: React, 'react/jsx-runtime': jsx,
  '@/lib/utils': utils, '@/lib/theme/design': { SITE_DESIGN: 'frequency' },
})
for (const pending of [false, true]) {
  const { HousingSubmit } = loadProbeModule(root + 'submit.tsx', {
    'react/jsx-runtime': jsx,
    'react-dom': { useFormStatus: () => ({ pending }) },
    '@/components/ui/button': { Button },
  })
  const html = renderToStaticMarkup(React.createElement(HousingSubmit, null, 'List housing'))
  assert.match(html, /type="submit"/)
  assert.match(html, /List housing/)
  assert.equal(/disabled=""/.test(html), pending)
  assert.equal(/aria-busy="true"/.test(html), pending)
}
console.log('Actual housing leaf and shared button disable repeated submits while pending, inside the real form')
