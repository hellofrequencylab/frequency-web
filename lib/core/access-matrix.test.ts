import { describe, it, expect } from 'vitest'
import {
  accessTo,
  canUse,
  isGated,
  columnsForHats,
  maxLevel,
  type Hats,
} from '@/lib/core/access-matrix'

// Hat helpers for readable cases.
const visitor: Hats = { loggedIn: false }
const freeMember: Hats = { loggedIn: true, role: 'member', tier: 'free' }
const paidMember: Hats = { loggedIn: true, role: 'member', tier: 'member' }
const supporter: Hats = { loggedIn: true, role: 'member', tier: 'supporter' }
const host: Hats = { loggedIn: true, role: 'host', tier: 'free' }
const mentor: Hats = { loggedIn: true, role: 'mentor', tier: 'free' }
const business: Hats = { loggedIn: true, role: 'member', tier: 'free', personas: ['business'] }
const organization: Hats = { loggedIn: true, role: 'member', tier: 'free', personas: ['organization'] }
const collaborator: Hats = { loggedIn: true, role: 'member', tier: 'free', personas: ['collaborator'] }
const practitioner: Hats = { loggedIn: true, role: 'member', tier: 'free', personas: ['practitioner'] }
const analystStaff: Hats = { loggedIn: true, role: 'member', tier: 'free', staff: 'analyst' }
const adminRole: Hats = { loggedIn: true, role: 'admin' }
const janitor: Hats = { loggedIn: true, role: 'janitor' }

describe('maxLevel', () => {
  it('orders none < limited < full', () => {
    expect(maxLevel('none', 'limited')).toBe('limited')
    expect(maxLevel('limited', 'full')).toBe('full')
    expect(maxLevel('full', 'none')).toBe('full')
  })
})

describe('one site for everyone — Community + Quest', () => {
  it('visitors preview, members get full', () => {
    expect(accessTo('feed', visitor)).toBe('limited')
    expect(accessTo('feed', freeMember)).toBe('full')
    expect(accessTo('circles', visitor)).toBe('limited')
    expect(accessTo('practices', freeMember)).toBe('full')
  })

  it('Message Boards are members-only (no visitor preview)', () => {
    expect(accessTo('messageBoards', visitor)).toBe('none')
    expect(accessTo('messageBoards', freeMember)).toBe('full')
  })
})

describe('the ✋ paid-membership gate (the Entitlement axis)', () => {
  it('free members are limited; paying unlocks full', () => {
    for (const s of ['vault', 'studioOverview', 'personalCrm', 'qrStudio'] as const) {
      expect(accessTo(s, freeMember)).toBe('limited')
      expect(isGated(s, freeMember)).toBe(true)
      expect(accessTo(s, paidMember)).toBe('full')
      expect(accessTo(s, supporter)).toBe('full')
    }
  })

  it('stewardship also unlocks the paid surfaces (host is full today)', () => {
    expect(accessTo('qrStudio', host)).toBe('full')
    expect(accessTo('studioOverview', host)).toBe('full')
  })
})

describe('Studio business block — Partners only', () => {
  it('Business/Organization get the business CRM, members do not', () => {
    expect(accessTo('businessCrm', freeMember)).toBe('none')
    expect(accessTo('businessCrm', host)).toBe('none')
    expect(accessTo('businessCrm', business)).toBe('full')
    expect(accessTo('businessCrm', organization)).toBe('full')
    expect(accessTo('businessCrm', practitioner)).toBe('limited')
  })

  it('Hook Network is Organization-only', () => {
    expect(accessTo('hookNetwork', business)).toBe('limited')
    expect(accessTo('hookNetwork', organization)).toBe('full')
    expect(accessTo('hookNetwork', host)).toBe('none')
  })

  it('Collaborator gets the Earnings view but not the business CRM', () => {
    expect(accessTo('earnings', collaborator)).toBe('full')
    expect(accessTo('businessCrm', collaborator)).toBe('none')
  })

  it('Website excludes Analyst', () => {
    expect(accessTo('website', business)).toBe('full')
    expect(accessTo('website', analystStaff)).toBe('none')
  })
})

describe('Platform — the Admin/Janitor world & the financials carve-out', () => {
  it('structure management (Hubs/Memberships/Pages) is Admin+ only', () => {
    expect(accessTo('platformManage', host)).toBe('none')
    expect(accessTo('platformManage', mentor)).toBe('none')
    expect(accessTo('platformManage', adminRole)).toBe('full')
    expect(accessTo('platformManage', janitor)).toBe('full')
  })

  it('Financial Dashboard is Janitor-ONLY — Admin is excluded', () => {
    expect(accessTo('financialDashboard', adminRole)).toBe('none')
    expect(accessTo('financialDashboard', janitor)).toBe('full')
  })

  it('Status & Settings are universal (even logged-out)', () => {
    expect(accessTo('status', visitor)).toBe('full')
    expect(accessTo('settings', visitor)).toBe('full')
  })

  it('Insight is staff/partner; stewardship is monotonic (mentor inherits host)', () => {
    expect(accessTo('insight', freeMember)).toBe('none')
    expect(accessTo('insight', host)).toBe('limited')
    expect(accessTo('insight', mentor)).toBe('limited') // monotonic deviation, documented
    expect(accessTo('insight', analystStaff)).toBe('full')
  })
})

describe('most-open union across hats', () => {
  it('a free member who is also a Business gets both worlds', () => {
    const both: Hats = { loggedIn: true, role: 'member', tier: 'free', personas: ['business'] }
    expect(accessTo('feed', both)).toBe('full') // member column
    expect(accessTo('businessCrm', both)).toBe('full') // business column
    expect(accessTo('vault', both)).toBe('limited') // still free → still gated
  })

  it('janitor sees everything at full', () => {
    for (const s of ['feed', 'vault', 'businessCrm', 'hookNetwork', 'platformManage', 'financialDashboard'] as const) {
      expect(canUse(s, janitor)).toBe(true)
    }
  })
})

describe('columnsForHats', () => {
  it('logged-out ⇒ just visitor', () => {
    expect([...columnsForHats(visitor)]).toEqual(['visitor'])
  })
  it('a paid member holds member + crew (the paid column)', () => {
    const cols = columnsForHats(paidMember)
    expect(cols.has('member')).toBe(true)
    expect(cols.has('crew')).toBe(true)
    expect(cols.has('host')).toBe(false)
  })
  it('a mentor holds the stewardship ladder below it — but NOT the paid column (decoupled)', () => {
    const cols = columnsForHats(mentor) // free tier
    expect(cols.has('member')).toBe(true)
    expect(cols.has('host')).toBe(true)
    expect(cols.has('guide')).toBe(true)
    expect(cols.has('mentor')).toBe(true)
    expect(cols.has('crew')).toBe(false) // 'crew' = paid; this mentor is on the free tier
    expect(cols.has('admin')).toBe(false)
  })

  it('paid is the tier ONLY — a free-tier host is a steward but not "paid"', () => {
    expect(columnsForHats({ loggedIn: true, role: 'host', tier: 'free' }).has('crew')).toBe(false)
    expect(columnsForHats({ loggedIn: true, role: 'member', tier: 'member' }).has('crew')).toBe(true)
    // …yet the steward still gets FULL on the steward surfaces, via the role not the tier:
    expect(accessTo('qrStudio', { loggedIn: true, role: 'host', tier: 'free' })).toBe('full')
    expect(accessTo('vault', { loggedIn: true, role: 'host', tier: 'free' })).toBe('full')
  })
})
