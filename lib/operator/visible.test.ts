import { describe, it, expect } from 'vitest'
import { visibleWorkspaces, visibleTabs, type ViewerCtx } from './visible'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'

// ── Root scope ────────────────────────────────────────────────────────────────

const rootJanitor: ViewerCtx = { scope: 'root', webRole: 'janitor', staffDomains: [], billingLive: false }
const rootAdmin: ViewerCtx = { scope: 'root', webRole: 'admin', staffDomains: [], billingLive: false }
const rootMember: ViewerCtx = { scope: 'root', webRole: 'none', staffDomains: [], billingLive: false }
const rootMarketer: ViewerCtx = { scope: 'root', webRole: 'none', staffDomains: ['marketing'], billingLive: false }

describe('visibleWorkspaces — root scope', () => {
  it('janitor sees all seven workspaces', () => {
    expect(visibleWorkspaces(rootJanitor).map((w) => w.id)).toEqual([
      'home', 'profile-site', 'people', 'marketing', 'offerings', 'community', 'settings',
    ])
  })

  it('a plain admin (no staff domains) does NOT see the janitor-only Settings workspace', () => {
    const ids = visibleWorkspaces(rootAdmin).map((w) => w.id)
    expect(ids).toContain('home')
    expect(ids).toContain('people')
    // Settings subtabs are all janitor-floored (billing/roles/ai/audit) → workspace drops for admin.
    expect(ids).not.toContain('settings')
  })

  it('a root member with no staff sees nothing', () => {
    expect(visibleWorkspaces(rootMember)).toEqual([])
  })

  it('a marketing staffer sees their domain via the staffDomain union, not the web_role floor', () => {
    const ids = visibleWorkspaces(rootMarketer).map((w) => w.id)
    expect(ids).toContain('marketing')
    expect(ids).toContain('people') // crm + segments carry staffDomain 'marketing'
    // Marketing tabs are filtered to the marketing domain only.
    const mkt = visibleTabs('marketing', rootMarketer).map((t) => t.id)
    expect(mkt).toContain('campaigns')
    expect(mkt).not.toContain('qr') // qr rides staffDomain 'qr'
    expect(mkt).not.toContain('analytics') // analytics rides staffDomain 'insights'
  })
})

// ── Space scope ───────────────────────────────────────────────────────────────

const fns = (...keys: SpaceFunctionKey[]) => new Set<SpaceFunctionKey>(keys)

const practitionerOwner: ViewerCtx = {
  scope: 'space',
  spaceRole: 'admin',
  spaceType: 'practitioner',
  enabledSpaceFns: fns('profile', 'members', 'qr', 'crm', 'availability', 'billing'),
  billingLive: false,
}

const practitionerViewer: ViewerCtx = {
  scope: 'space',
  spaceRole: 'viewer',
  spaceType: 'practitioner',
  enabledSpaceFns: fns('profile', 'members', 'qr', 'crm', 'availability', 'billing'),
  billingLive: false,
}

const nonMember: ViewerCtx = { scope: 'space', spaceRole: null, spaceType: 'business', billingLive: false }

describe('visibleWorkspaces — space scope', () => {
  it('a practitioner owner sees all seven workspaces (billing OFF grants plan gates)', () => {
    expect(visibleWorkspaces(practitionerOwner).map((w) => w.id).sort()).toEqual([
      'community', 'home', 'marketing', 'offerings', 'people', 'profile-site', 'settings',
    ])
  })

  it('offerings is filtered to the space type (practitioner sees availability, not memberships)', () => {
    const tabs = visibleTabs('offerings', practitionerOwner).map((t) => t.id)
    expect(tabs).toContain('availability')
    expect(tabs).not.toContain('memberships') // business-only
    expect(tabs).not.toContain('donations') // organization-only
    expect(tabs).not.toContain('marketplace') // root-only
  })

  it('a viewer sees only Home (everything else floors at editor or above)', () => {
    expect(visibleWorkspaces(practitionerViewer).map((w) => w.id)).toEqual(['home'])
  })

  it('a non-member sees nothing', () => {
    expect(visibleWorkspaces(nonMember)).toEqual([])
  })

  it('a disabled space function hides its tab even for an admin', () => {
    const noEmail: ViewerCtx = { ...practitionerOwner, spaceType: 'business', enabledSpaceFns: fns('members', 'qr') }
    const mkt = visibleTabs('marketing', noEmail).map((t) => t.id)
    expect(mkt).toContain('qr')
    expect(mkt).not.toContain('campaigns') // email fn not enabled
  })
})

// ── Plan axis bites only when billing is live ──────────────────────────────────

describe('plan gating is OFF-safe', () => {
  const base: Omit<ViewerCtx, 'billingLive' | 'clearedPlanGates'> = {
    scope: 'space',
    spaceRole: 'admin',
    spaceType: 'business',
    enabledSpaceFns: fns('crm', 'email', 'members', 'qr'),
  }

  it('while billing is OFF, CRM and Campaigns show (grant-all)', () => {
    const ctx: ViewerCtx = { ...base, billingLive: false }
    expect(visibleTabs('people', ctx).map((t) => t.id)).toContain('crm')
    expect(visibleTabs('marketing', ctx).map((t) => t.id)).toContain('campaigns')
  })

  it('while billing is LIVE and the plan clears nothing, the gated tabs hide', () => {
    const ctx: ViewerCtx = { ...base, billingLive: true, clearedPlanGates: new Set() }
    expect(visibleTabs('people', ctx).map((t) => t.id)).not.toContain('crm') // space_crm gate
    const mkt = visibleTabs('marketing', ctx).map((t) => t.id)
    expect(mkt).not.toContain('campaigns') // space_email gate
    expect(mkt).toContain('qr') // ungated survives
  })

  it('while billing is LIVE and the plan clears space_crm, CRM shows', () => {
    const ctx: ViewerCtx = { ...base, billingLive: true, clearedPlanGates: new Set(['space_crm']) }
    expect(visibleTabs('people', ctx).map((t) => t.id)).toContain('crm')
  })
})
