// HYG-197: retire only the unreachable generative Journey prompt; preserve live coaching.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'
export const JOURNEY_COACHING_MODULES = ['journey-spark', 'journey-edit', 'journey-composition', 'journey-slot-coaching']
export function retiredJourneyPrimer({ exists = existsSync, read = (p) => readFileSync(p, 'utf8') } = {}) {
  assert.equal(exists('lib/ai/journey-shape.ts'), false, 'unused generative Journey primer returned')
  for (const name of JOURNEY_COACHING_MODULES) {
    const source = read(`lib/ai/${name}.ts`)
    assert.doesNotMatch(source, /journey-shape|withJourneyShape|JOURNEY_TEMPLATE_PRIMER/, `${name}: retired prompt reattached`)
    assert.match(source, /writingCoachingSpec/, `${name}: actual coaching contract missing`)
  }
  const spark = read('lib/ai/journey-spark.ts')
  assert.match(spark, /Never generate names, promises, overviews, weekly arcs or steps/, 'Journey Spark authoring boundary lost')
  assert.match(spark, /maxTokens: 600/, 'bounded Journey coaching budget remains')
  return true
}
if (invokedDirectly(import.meta.url)) {
  retiredJourneyPrimer()
  console.log('Unreachable generative Journey primer retired; actual bounded question-only coaching retained')
}
