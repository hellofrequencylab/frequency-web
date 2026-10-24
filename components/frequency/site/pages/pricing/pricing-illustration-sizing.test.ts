import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Exercise the component's actual measurement callback. The dimensions below
// reproduce the two mobile states observed in the release screenshots/browser.
const source = readFileSync('components/frequency/site/pages/pricing/pricing-calculator.tsx', 'utf8')
const file = ts.createSourceFile('pricing-calculator.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const callbacks: ts.ArrowFunction[] = []
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'measure' &&
    node.initializer && ts.isArrowFunction(node.initializer)) callbacks.push(node.initializer)
  ts.forEachChild(node, visit)
}
visit(file)

function measurement(width: number, height: number, mobile: boolean) {
  expect(callbacks).toHaveLength(1)
  const compiled = ts.transpileModule(`const measure = ${callbacks[0]!.getText(file)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  let size: number | undefined
  const measure = new Function('visRef', 'getComputedStyle', 'setVisS', 'naturalFlow', `${compiled}; return measure`)(
    { current: { clientWidth: width, clientHeight: height } },
    () => ({ paddingLeft: '4px', paddingRight: '4px', paddingTop: '4px', paddingBottom: '40px' }),
    (value: number) => { size = value },
    () => mobile,
  ) as () => void
  measure()
  return size
}

describe('Pricing illustration sizing', () => {
  it('restores the same mobile size from either observed height', () => {
    expect(measurement(358, 394, true)).toBe(350)
    expect(measurement(358, 180, true)).toBe(350)
  })

  it('recovers after a temporary capture-size viewport without retaining its smaller size', () => {
    expect(measurement(1, 1, true)).toBe(120)
    expect(measurement(358, 180, true)).toBe(350)
  })

  it('keeps desktop sizing bounded by both available dimensions', () => {
    expect(measurement(358, 180, false)).toBe(136)
    expect(measurement(454, 600, false)).toBe(446)
    expect(measurement(700, 300, false)).toBe(256)
  })
})
