import { describe, expect, it } from 'vitest'
import { reviewedFindings } from './sentinel-sweep.mjs'

describe('Sentinel findings validation', () => {
  const paths = new Set(['lib/example.ts'])
  const candidate = { path: 'lib/example.ts', severity: 'high', title: 'Missing author check', impact: 'Any member can edit.', fix: 'Check the author.' }

  it('filters unreviewed, duplicate, incomplete and low-severity findings', () => {
    expect(reviewedFindings([candidate, candidate, null, { ...candidate, fix: '' }, { ...candidate, severity: 'low' }, { ...candidate, path: 'lib/outside.ts' }], paths)).toEqual([candidate])
  })

  it('rejects malformed output and removes mentions and raw markup', () => {
    expect(() => reviewedFindings({}, paths)).toThrow('must be an array')
    expect(reviewedFindings([{ ...candidate, title: '@someone <script>\nHere' }], paths)[0].title).toBe('someone script Here')
  })
})
