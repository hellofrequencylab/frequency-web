import { describe, it, expect } from 'vitest'
import {
  PLAYBOOK_REGISTRY,
  getPlaybook,
  playbookForChurnRisk,
  playbookForNextBestAction,
  isFullyInProduct,
} from './registry'
import type { ChurnRisk, NextBestAction } from '@/lib/traits/compute'

// The full enum sets the registry MUST cover (mirrors lib/traits/compute.ts). Listed
// literally so a future widening of the prediction enum trips this test until the
// registry declares the new value — the "nothing exists without a declaration" law.
const ALL_NEXT_BEST_ACTIONS: NextBestAction[] = ['reengage', 'activate', 'join_circle', 'deepen', 'invite', 'none']
const ALL_CHURN_RISKS: ChurnRisk[] = ['low', 'medium', 'high']

describe('playbook registry', () => {
  it('has unique, slug ids', () => {
    const ids = PLAYBOOK_REGISTRY.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  it('every entry carries a name, rationale, trigger, and autonomy tier', () => {
    for (const p of PLAYBOOK_REGISTRY) {
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.rationale.length).toBeGreaterThan(0)
      expect(['auto', 'suggest', 'never_auto']).toContain(p.autonomyTier)
      expect(['next_best_action', 'churn_risk']).toContain(p.trigger.kind)
    }
  })

  it('no copy uses an em or en dash (brand voice law)', () => {
    for (const p of PLAYBOOK_REGISTRY) {
      const copy = [p.name, p.rationale, ...p.actions.map((a) => a.label)].join(' ')
      expect(copy).not.toMatch(/[–—]/)
    }
  })

  // ── The two completeness laws ──────────────────────────────────────────────
  it('every next_best_action value maps to exactly one playbook', () => {
    for (const v of ALL_NEXT_BEST_ACTIONS) {
      const p = playbookForNextBestAction(v)
      expect(p, `next_best_action "${v}" has no playbook`).toBeDefined()
      expect(p?.trigger).toEqual({ kind: 'next_best_action', value: v })
    }
  })

  it('every churn_risk tier maps to exactly one playbook', () => {
    for (const v of ALL_CHURN_RISKS) {
      const p = playbookForChurnRisk(v)
      expect(p, `churn_risk "${v}" has no playbook`).toBeDefined()
      expect(p?.trigger).toEqual({ kind: 'churn_risk', value: v })
    }
  })

  // ── The fail-closed safety law ─────────────────────────────────────────────
  it('no outbound action is ever in an auto playbook', () => {
    for (const p of PLAYBOOK_REGISTRY) {
      if (p.autonomyTier === 'auto') {
        expect(isFullyInProduct(p), `auto playbook "${p.id}" must be fully in-product`).toBe(true)
        for (const a of p.actions) expect(a.surface).toBe('in_product')
      }
    }
  })

  it('only in-product, reversible tools are auto; send_playbook_email is never auto', () => {
    for (const p of PLAYBOOK_REGISTRY) {
      if (p.autonomyTier === 'auto') {
        expect(p.actions.some((a) => a.tool === 'send_playbook_email')).toBe(false)
      }
    }
  })

  it('the only auto playbook is the in-product streak save', () => {
    const auto = PLAYBOOK_REGISTRY.filter((p) => p.autonomyTier === 'auto')
    expect(auto.map((p) => p.id)).toEqual(['churn_high_streak_save'])
  })

  it('getPlaybook resolves known ids only', () => {
    expect(getPlaybook('churn_high_streak_save')?.autonomyTier).toBe('auto')
    expect(getPlaybook('not_a_real_playbook')).toBeUndefined()
  })
})
