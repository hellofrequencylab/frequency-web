import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/frequency/site/shell/site-fx.tsx', 'utf8')
type Target = { classList: { add: (name: string) => void }; classes: string[] }
type Entry = { target: Target; isIntersecting: boolean }
type Observer = { callback: (entries: Entry[]) => void; observe: (target: Target) => void; unobserve: (target: Target) => void }
type Harness = { pio: Observer; pops: () => void }

// Extract the shipped declarations, including the real observer callback and reduced-motion/hash
// bypass. The test supplies only the clock, timers, DOM targets and native-observer transport.
function declarations(text: string) {
  const tree = ts.createSourceFile('site-fx.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const run = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'run')
  if (!run || !ts.isFunctionDeclaration(run) || !run.body) throw Error('SiteFx run function absent')
  return ['lastPop', 'pio', 'seen', 'pops'].map(name => {
    const statement = run.body!.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === name))
    if (!statement) throw Error(`Actual SiteFx declaration absent: ${name}`)
    return statement.getText(tree)
  }).join('\n')
}
function setup(text = source, reduced = false, hashTarget: Target | null = null) {
  let now = 10000
  const timers: { delay: number; callback: () => void }[] = []
  const observed: Target[] = [], unobserved: Target[] = [], targets: Target[] = []
  const options: unknown[] = []
  const context = {
    performance: { now: () => now },
    setTimeout: (callback: () => void, delay: number) => { timers.push({ callback, delay }); return timers.length },
    IntersectionObserver: class {
      callback: (entries: Entry[]) => void
      constructor(callback: (entries: Entry[]) => void, config: unknown) { this.callback = callback; options.push(config) }
      observe(target: Target) { observed.push(target) }
      unobserve(target: Target) { unobserved.push(target) }
    },
    RM: reduced, q: () => targets,
    location: { hash: hashTarget ? '#chosen' : '' }, d: { getElementById: () => hashTarget },
  }
  const sandbox = vm.createContext(context)
  const code = ts.transpileModule(`${declarations(text)}\nglobalThis.harness = { pio, pops };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInContext(code, sandbox)
  const harness = (sandbox as unknown as { harness: Harness }).harness
  const target = () => { const classes: string[] = []; const item = { classes, classList: { add: (name: string) => classes.push(name) } }; targets.push(item); return item }
  const burst = (count: number) => { const entries = Array.from({ length: count }, () => ({ target: target(), isIntersecting: true })); harness.pio.callback(entries); return entries }
  return { harness, target, targets, burst, timers, options, observed, unobserved, setNow: (value: number) => { now = value } }
}
const uncapped = source.replace('Math.min(1020, Math.max(0, lastPop + 170 - now))', 'Math.max(0, lastPop + 170 - now)')
function bounded(text: string) { const h = setup(text); h.burst(37); return Math.max(...h.timers.map(timer => timer.delay)) <= 1020 }

describe('actual SiteFx reveal callback', () => {
  it('demonstrates the uncapped 6120ms burst and bounds all 37 shipped reveals at1020ms', () => {
    expect(uncapped).not.toBe(source)
    const before = setup(uncapped); before.burst(37)
    expect(before.timers.map(t => t.delay)).toEqual(Array.from({ length: 37 }, (_, index) => index * 170))
    expect(Math.max(...before.timers.map(t => t.delay))).toBe(6120)
    const after = setup(); after.burst(37)
    expect(bounded(source)).toBe(true)
    expect(Math.max(...after.timers.map(t => t.delay))).toBe(1020)
    after.timers.forEach(timer => timer.callback())
    expect(after.targets.every(target => target.classes.join(',') === 'in')).toBe(true)
    expect(after.unobserved).toEqual(after.targets)
    expect(after.options).toEqual([{ threshold: 0.2, rootMargin: '0px 0px -6% 0px' }])
  })
  it.each([1, 3, 7])('preserves the exact170ms ordinary cadence for%d entries', count => {
    const before = setup(uncapped), after = setup(); before.burst(count); after.burst(count)
    expect(after.timers.map(t => t.delay)).toEqual(before.timers.map(t => t.delay))
  })
  it('bounds successive bursts and returns to immediate reveal after idle', () => {
    const h = setup(); h.burst(37); h.setNow(10100); h.burst(37)
    expect(Math.max(...h.timers.map(t => t.delay))).toBe(1020)
    h.setNow(20000); h.burst(1); expect(h.timers.at(-1)?.delay).toBe(0)
  })
  it('ignores non-intersecting entries without consuming their queue slots', () => {
    const h = setup(); const off = h.target(), on = h.target()
    h.harness.pio.callback([{ target: off, isIntersecting: false }, { target: on, isIntersecting: true }])
    expect(h.timers.map(t => t.delay)).toEqual([0]); expect(h.unobserved).toEqual([on])
  })
  it('keeps actual reduced-motion and hash-target bypasses immediate and observes each other target once', () => {
    const reduced = setup(source, true); reduced.target(); reduced.target(); reduced.harness.pops(); reduced.harness.pops()
    expect(reduced.targets.every(t => t.classes.join(',') === 'in')).toBe(true)
    expect(reduced.observed).toEqual([]); expect(reduced.timers).toEqual([])
    const chosen: Target = { classes: [], classList: { add: () => chosen.classes.push('in') } }
    const h = setup(source, false, chosen); h.targets.push(chosen); const other = h.target(); h.harness.pops(); h.harness.pops()
    expect(chosen.classes).toEqual(['in']); expect(h.observed).toEqual([other]); expect(h.timers).toEqual([])
  })
  it('rejects cap removal, changed cadence and missing reveal/unobserve mutations', () => {
    expect(bounded(uncapped)).toBe(false)
    const cadence = setup(source.replace('lastPop + 170', 'lastPop + 171')); cadence.burst(3)
    expect(cadence.timers.map(t => t.delay)).not.toEqual([0, 170, 340])
    const noReveal = setup(source.replace("el.classList.add('in'), delay", "undefined, delay")); noReveal.burst(1); noReveal.timers[0].callback()
    expect(noReveal.targets[0].classes).toEqual([])
    const noUnobserve = setup(source.replace('pio.unobserve(el)', 'void el')); noUnobserve.burst(1)
    expect(noUnobserve.unobserved).toEqual([])
  })
})
