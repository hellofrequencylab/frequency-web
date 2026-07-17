import { describe, it, expect } from 'vitest'
import { allowedOpsForType, opLabel, clampOp } from './field-ops'

// The Segment Builder's op-constraint core (ADR-630): categorical field types (boolean,
// enum, string) may only be compared for equality; ordered types (number, timestamp) get
// the full comparison set. Pure — no React, no DB.

describe('allowedOpsForType', () => {
  it('gives ordered types the full comparison set', () => {
    expect(allowedOpsForType('number')).toEqual(['eq', 'neq', 'gt', 'gte', 'lt', 'lte'])
    expect(allowedOpsForType('timestamp')).toEqual(['eq', 'neq', 'gt', 'gte', 'lt', 'lte'])
  })

  it('restricts categorical types to equality only', () => {
    expect(allowedOpsForType('boolean')).toEqual(['eq', 'neq'])
    expect(allowedOpsForType('enum')).toEqual(['eq', 'neq'])
    expect(allowedOpsForType('string')).toEqual(['eq', 'neq'])
  })

  it('falls back to the full set for an unknown/absent type', () => {
    expect(allowedOpsForType(undefined)).toEqual(['eq', 'neq', 'gt', 'gte', 'lt', 'lte'])
  })
})

describe('opLabel', () => {
  it('reads timestamps in time words', () => {
    expect(opLabel('gt', 'timestamp')).toBe('after')
    expect(opLabel('gte', 'timestamp')).toBe('on or after')
    expect(opLabel('lt', 'timestamp')).toBe('before')
  })

  it('uses the numeric labels for other ordered types', () => {
    expect(opLabel('gte', 'number')).toBe('at least')
    expect(opLabel('lte', 'number')).toBe('at most')
    expect(opLabel('eq', 'boolean')).toBe('is')
  })
})

describe('clampOp', () => {
  it('keeps an operator the type allows', () => {
    expect(clampOp('gte', 'number')).toBe('gte')
    expect(clampOp('neq', 'boolean')).toBe('neq')
  })

  it('drops a relational op to equality when the type went categorical', () => {
    // The row-switch trap: a number field set to "at least", then re-pointed at a boolean.
    expect(clampOp('gte', 'boolean')).toBe('eq')
    expect(clampOp('lt', 'enum')).toBe('eq')
  })
})
