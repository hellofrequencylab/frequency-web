// The status read-back of the three fallback workflows, run the way db-paths.test.ts runs its
// sibling: the real shell from the workflow file, under bash, against a stub GitHub. A fallback
// that reads once went red on pull requests whose status had landed (SCAN-1247).
import { describe, expect, it } from 'vitest'
import { READBACK_WORKFLOWS, runReadBack } from './lib/status-readback-harness.mjs'

describe.each(READBACK_WORKFLOWS)('$file read-back', (workflow) => {
  it('passes when the context shows on the third read, and stops reading there', () => {
    const r = runReadBack(workflow, { seenFrom: 3 })
    expect(r).toMatchObject({ ok: true, status: 0, reads: 3 })
  })

  it('fails loudly, inside a minute, when the context never shows', () => {
    const r = runReadBack(workflow, { seenFrom: 0 })
    if (!r.ok) throw new Error(r.reason)
    expect(r.status).not.toBe(0)
    expect(r.output).toMatch(/::error::Posted .*context is absent/)
    expect(r.output).not.toContain('READBACK-PASSED')
    expect(r.slept).toBeLessThan(60)
  })

  it('fails on a failed HTTP read without polling past it', () => {
    const r = runReadBack(workflow, { httpFail: true })
    if (!r.ok) throw new Error(r.reason)
    expect(r.status).not.toBe(0)
    expect(r.reads).toBe(1)
  })
})
