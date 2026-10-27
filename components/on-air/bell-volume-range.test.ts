// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { coerceBellVolume } from '@/lib/on-air'

function bellRange() {
  const source = ts.createSourceFile('session.tsx', readFileSync('components/on-air/session.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let range: HTMLInputElement | undefined
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'input') {
      const props = new Map(node.attributes.properties.filter(ts.isJsxAttribute).map(p => [p.name.getText(source), p.initializer]))
      if (props.get('aria-label')?.getText(source) === '"Bell volume"') {
        range = document.createElement('input'); range.type = 'range'
        for (const key of ['min', 'max', 'step']) {
          const prop = props.get(key)
          if (!prop || !ts.isJsxExpression(prop) || !prop.expression || !ts.isNumericLiteral(prop.expression)) throw new Error(`Missing numeric ${key}`)
          range.setAttribute(key, prop.expression.text)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!range) throw new Error('Missing bell volume range')
  return range
}

describe('bell volume accessibility matches the displayed saved preference', () => {
  it.each(['quiet', 'medium', 'loud', 0.38, 0, 1])('represents %s without a step mismatch', (stored) => {
    const input = bellRange()
    const displayed = Math.round(coerceBellVolume(stored) * 100)
    input.value = String(displayed)
    expect(input.valueAsNumber).toBe(displayed)
    expect(input.validity.stepMismatch).toBe(false)
  })
  it('rejects the old five-percent step for the migrated quiet preference', () => {
    const input = bellRange(); input.step = '5'; input.value = String(Math.round(coerceBellVolume('quiet') * 100))
    expect(input.validity.stepMismatch).toBe(true)
  })
})
