import { describe, it, expect } from 'vitest'
import { diffAdvisors, findLints, formatReport } from './advisor-diff.mjs'

// Self-test for the stateful advisor diff (docs/MAINTENANCE-AUTOMATION.md Phase 2). Proves it
// silences the accepted-risk classes and surfaces genuinely new findings — so the weekly sweep
// stays quiet-by-default AND can never swallow a new WARN/ERROR.

const accepted = {
  acceptedByName: {
    extension_in_public: 'ADR-507',
    rls_enabled_no_policy: 'deny-all fail-closed',
    unused_index: 'pre-traffic noise',
  },
  acceptedByTarget: {
    rls_disabled_in_public: ['spatial_ref_sys'],
  },
}

const lint = (name, level, target) => ({ name, level, metadata: target ? { name: target } : {} })

describe('diffAdvisors', () => {
  it('silences accepted-by-name advisories', () => {
    const payload = { lints: [lint('extension_in_public', 'WARN'), lint('unused_index', 'INFO')] }
    const diff = diffAdvisors([payload], accepted)
    expect(diff.fresh).toEqual([])
    expect(diff.accepted).toBe(2)
    expect(diff.hasBlocking).toBe(false)
  })

  it('accepts a target-scoped advisory only for the listed target', () => {
    const payload = {
      lints: [
        lint('rls_disabled_in_public', 'ERROR', 'spatial_ref_sys'), // accepted (PostGIS)
        lint('rls_disabled_in_public', 'ERROR', 'brand_new_table'), // NEW — must surface
      ],
    }
    const diff = diffAdvisors([payload], accepted)
    expect(diff.fresh.map((l) => l.metadata.name)).toEqual(['brand_new_table'])
    expect(diff.hasBlocking).toBe(true)
  })

  it('surfaces a genuinely new finding and flags it blocking at WARN/ERROR', () => {
    const payload = { lints: [lint('auth_allow_anonymous_sign_ins', 'WARN')] }
    const diff = diffAdvisors([payload], accepted)
    expect(diff.fresh).toHaveLength(1)
    expect(diff.hasBlocking).toBe(true)
    expect(formatReport(diff)).toContain('auth_allow_anonymous_sign_ins')
  })

  it('reports a new INFO finding but does not block on it', () => {
    const payload = { lints: [lint('some_new_info_lint', 'INFO')] }
    const diff = diffAdvisors([payload], accepted)
    expect(diff.fresh).toHaveLength(1)
    expect(diff.hasBlocking).toBe(false)
  })

  it('merges multiple payloads (security + performance) and locates nested lints', () => {
    const security = { result: { lints: [lint('extension_in_public', 'WARN')] } }
    const performance = { lints: [lint('unused_index', 'INFO'), lint('a_new_perf_lint', 'WARN')] }
    const diff = diffAdvisors([security, performance], accepted)
    expect(diff.totalLints).toBe(3)
    expect(diff.fresh.map((l) => l.name)).toEqual(['a_new_perf_lint'])
  })

  it('findLints tolerates a bare array payload', () => {
    expect(findLints([lint('x', 'INFO')])).toHaveLength(1)
    expect(findLints({})).toEqual([])
  })
})
