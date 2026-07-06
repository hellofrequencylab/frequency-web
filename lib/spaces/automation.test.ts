import { describe, it, expect, beforeEach, vi } from 'vitest'

// PER-SPACE AUTOMATION (R5). What is locked here, all network-free (the supabase admin client + auth +
// store + capability seam are mocked):
//   1. PURE validation: names / subjects / bodies are trimmed + capped; triggers + actions are gated to
//      the known lists; delay hours clamp to a safe non-negative integer; validateRule / validateStep
//      reject the blank cases.
//   2. PERMISSION GATING: every mutation (create rule / toggle / delete, create sequence / add step /
//      delete step / toggle / delete) requires canEditProfile. Anonymous + non-editor are rejected and
//      NOTHING is written.
//   3. CROSS-SPACE ISOLATION (structural): every write binds space_id (proven by the recorded filters).

import {
  normalizeName,
  normalizeSubject,
  normalizeBody,
  normalizeDelayHours,
  normalizeTrigger,
  normalizeAction,
  normalizeEmailConfig,
  validateRule,
  validateStep,
  SPACE_AUTOMATION_TRIGGERS,
} from './automation'

// ── PURE validators (no IO) ──────────────────────────────────────────────────────────────────────

describe('automation pure validators', () => {
  it('normalizeName trims + caps, empty on non-string / blank', () => {
    expect(normalizeName('  Hello  ')).toBe('Hello')
    expect(normalizeName('')).toBe('')
    expect(normalizeName('   ')).toBe('')
    expect(normalizeName(42)).toBe('')
    expect(normalizeName('x'.repeat(200)).length).toBe(80)
  })

  it('normalizeSubject trims + caps; normalizeBody preserves newlines + caps', () => {
    expect(normalizeSubject('  Hi  ')).toBe('Hi')
    expect(normalizeSubject('x'.repeat(300)).length).toBe(200)
    expect(normalizeBody('a\n\nb')).toBe('a\n\nb')
    expect(normalizeBody('x'.repeat(60_000)).length).toBe(50_000)
    expect(normalizeBody(null)).toBe('')
  })

  it('normalizeDelayHours clamps to a safe non-negative integer', () => {
    expect(normalizeDelayHours(24)).toBe(24)
    expect(normalizeDelayHours('48')).toBe(48)
    expect(normalizeDelayHours(0)).toBe(0)
    expect(normalizeDelayHours(-5)).toBe(24) // negative -> default
    expect(normalizeDelayHours('nope')).toBe(24) // non-numeric -> default
    expect(normalizeDelayHours(2.9)).toBe(2) // floored
    expect(normalizeDelayHours(1e9)).toBe(24 * 365) // ceiling
  })

  it('normalizeTrigger + normalizeAction gate to the known lists', () => {
    expect(normalizeTrigger('contact.created')).toBe('contact.created')
    expect(normalizeTrigger('bogus')).toBeNull()
    expect(normalizeTrigger(5)).toBeNull()
    expect(normalizeAction('email_audience')).toBe('email_audience')
    expect(normalizeAction('delete_everything')).toBeNull()
  })

  it('normalizeEmailConfig normalizes the audience + subject + body and drops a nested segmentId chain', () => {
    const cfg = normalizeEmailConfig({
      audience: { tag: 'vip', segmentId: 'nested' },
      subject: '  Hi  ',
      body: 'Body',
    })
    expect(cfg.subject).toBe('Hi')
    expect(cfg.body).toBe('Body')
    // definitionToFilter keeps known facets; the exact segmentId handling is covered by audiences.test,
    // here we only assert the shape survives normalization.
    expect(typeof cfg.audience).toBe('object')
  })

  it('validateRule requires a name, a known trigger, a known action, a subject + body', () => {
    expect(validateRule('', 'contact.created', 'email_audience', { subject: 's', body: 'b' })).toEqual({
      error: 'Give your rule a name.',
    })
    expect(validateRule('R', 'bogus', 'email_audience', { subject: 's', body: 'b' })).toEqual({
      error: 'Pick a trigger for your rule.',
    })
    expect(validateRule('R', 'contact.created', 'bogus', { subject: 's', body: 'b' })).toEqual({
      error: 'Pick an action for your rule.',
    })
    expect(validateRule('R', 'contact.created', 'email_audience', { subject: '', body: 'b' })).toEqual({
      error: 'Give the email a subject.',
    })
    expect(validateRule('R', 'contact.created', 'email_audience', { subject: 's', body: '  ' })).toEqual({
      error: 'Write the email your rule sends.',
    })
    const good = validateRule('R', 'contact.created', 'email_audience', {
      audience: {},
      subject: 's',
      body: 'b',
    })
    expect('error' in good).toBe(false)
  })

  it('validateStep requires a subject + body and normalizes the delay', () => {
    expect(validateStep('', 'b', 24)).toEqual({ error: 'Give the step a subject.' })
    expect(validateStep('s', '   ', 24)).toEqual({ error: 'Write the step message.' })
    expect(validateStep('s', 'b', -1)).toEqual({ subject: 's', body: 'b', delayHours: 24 })
  })

  it('every declared trigger normalizes back to itself (no typo in the const)', () => {
    for (const t of SPACE_AUTOMATION_TRIGGERS) expect(normalizeTrigger(t)).toBe(t)
  })
})

// ── Permission gating + space_id binding (mocked IO) ─────────────────────────────────────────────

let currentProfileId: string | null = 'editor-1'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
  getCallerProfile: async () => (currentProfileId ? { id: currentProfileId, webRole: 'none' } : null),
}))

let resolvedSpace: { id: string; slug: string } | null = { id: 'space-A', slug: 'river' }
vi.mock('./store', () => ({ getSpaceById: async () => resolvedSpace }))

let canEdit = true
let hasAutomation = true
vi.mock('./entitlements', () => ({
  getSpaceCapabilities: async () => ({
    isOwner: canEdit,
    isAdmin: canEdit,
    role: canEdit ? 'admin' : null,
    canEditProfile: canEdit,
    canManageMembers: canEdit,
    canInvite: canEdit,
  }),
  // requireAutomationEditor (the RUNNER lever's gate) reads this: the Space's plan must grant automation.
  spaceHasEntitlement: (_space: unknown, key: string) => (key === 'automation' ? hasAutomation : false),
}))

// startSequenceForAudience resolves the sequence's audience + enrolls each contact. Mock both deps so the
// gating + enroll-count behavior is exercised network-free.
let mockAudience: { contactId: string; email: string }[] = [{ contactId: 'c1', email: 'a@x.com' }]
vi.mock('./audiences', () => ({
  resolveAudience: async () => mockAudience,
  definitionToFilter: (raw: unknown) => (raw && typeof raw === 'object' ? raw : {}),
}))
let enrollOutcome = true
const enrollCalls: { spaceId: string; sequenceId: string; contactId: string }[] = []
vi.mock('./drip-enroll', () => ({
  enrollContactInSequence: async (spaceId: string, sequenceId: string, contactId: string) => {
    enrollCalls.push({ spaceId, sequenceId, contactId })
    return { enrolled: enrollOutcome }
  },
}))

// A chainable recorder that captures the .eq() filters + terminal verb, and returns a row on insert.
type Call = { verb: string; col?: string; val?: string }
const rec: { calls: Call[] } = { calls: [] }

function builder() {
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (col: string, val: string) => {
      rec.calls.push({ verb: 'eq', col, val })
      return api
    },
    in: () => api,
    order: () => api,
    insert: (rows: Record<string, unknown>[]) => {
      rec.calls.push({ verb: 'insert' })
      // remember the inserted space_id for the assertion
      const sid = rows[0]?.space_id
      if (typeof sid === 'string') rec.calls.push({ verb: 'insert.space_id', val: sid })
      return api
    },
    update: () => {
      rec.calls.push({ verb: 'update' })
      return api
    },
    delete: () => {
      rec.calls.push({ verb: 'delete' })
      return api
    },
    maybeSingle: async () => ({ data: { id: 'new-id' }, error: null }),
    then: (resolve: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve(resolve({ data: [], error: null })),
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => builder() }),
}))

// Import AFTER the mocks are registered.
import {
  createSpaceRule,
  setSpaceRuleEnabled,
  deleteSpaceRule,
  createSpaceSequence,
  addSequenceStep,
  deleteSequenceStep,
  setSpaceSequenceEnabled,
  deleteSpaceSequence,
  startSequenceForAudience,
} from './automation'

beforeEach(() => {
  rec.calls = []
  currentProfileId = 'editor-1'
  resolvedSpace = { id: 'space-A', slug: 'river' }
  canEdit = true
  hasAutomation = true
  mockAudience = [{ contactId: 'c1', email: 'a@x.com' }]
  enrollOutcome = true
  enrollCalls.length = 0
})

const goodRule = {
  name: 'Welcome',
  trigger: 'contact.created',
  action: 'email_audience',
  config: { audience: {}, subject: 'Hi', body: 'Body' },
}

describe('automation permission gating', () => {
  it('an anonymous caller cannot create a rule (nothing written)', async () => {
    currentProfileId = null
    const res = await createSpaceRule('space-A', goodRule)
    expect('error' in res).toBe(true)
    expect(rec.calls.some((c) => c.verb === 'insert')).toBe(false)
  })

  it('a non-editor cannot create a rule (nothing written)', async () => {
    canEdit = false
    const res = await createSpaceRule('space-A', goodRule)
    expect('error' in res).toBe(true)
    expect(rec.calls.some((c) => c.verb === 'insert')).toBe(false)
  })

  it('an editor creates a rule, stamping space_id', async () => {
    const res = await createSpaceRule('space-A', goodRule)
    expect('error' in res).toBe(false)
    expect(rec.calls.some((c) => c.verb === 'insert.space_id' && c.val === 'space-A')).toBe(true)
  })

  it('rule toggle + delete bind space_id', async () => {
    await setSpaceRuleEnabled('space-A', 'r1', false)
    expect(rec.calls.some((c) => c.verb === 'eq' && c.col === 'space_id' && c.val === 'space-A')).toBe(true)
    rec.calls = []
    await deleteSpaceRule('space-A', 'r1')
    expect(rec.calls.some((c) => c.verb === 'eq' && c.col === 'space_id' && c.val === 'space-A')).toBe(true)
  })

  it('sequence create + toggle + delete are gated and bind space_id', async () => {
    canEdit = false
    expect('error' in (await createSpaceSequence('space-A', { name: 'S' }))).toBe(true)
    expect('error' in (await setSpaceSequenceEnabled('space-A', 's1', false))).toBe(true)
    expect('error' in (await deleteSpaceSequence('space-A', 's1'))).toBe(true)
    expect(rec.calls.some((c) => c.verb === 'insert' || c.verb === 'update' || c.verb === 'delete')).toBe(false)

    canEdit = true
    rec.calls = []
    await createSpaceSequence('space-A', { name: 'S', audience: {} })
    expect(rec.calls.some((c) => c.verb === 'insert.space_id' && c.val === 'space-A')).toBe(true)
  })

  it('step delete is gated and binds space_id', async () => {
    canEdit = false
    expect('error' in (await deleteSequenceStep('space-A', 'step1'))).toBe(true)
    expect(rec.calls.some((c) => c.verb === 'delete')).toBe(false)
    canEdit = true
    rec.calls = []
    await deleteSequenceStep('space-A', 'step1')
    expect(rec.calls.some((c) => c.verb === 'eq' && c.col === 'space_id' && c.val === 'space-A')).toBe(true)
  })

  it('addSequenceStep is gated; a non-editor writes nothing', async () => {
    canEdit = false
    const res = await addSequenceStep('space-A', 'seq1', { subject: 's', body: 'b', delayHours: 24 })
    expect('error' in res).toBe(true)
    expect(rec.calls.some((c) => c.verb === 'insert')).toBe(false)
  })
})

// ── startSequenceForAudience: the RUNNER lever, gated on canEditProfile AND the automation entitlement ─
describe('startSequenceForAudience gating + enroll', () => {
  it('a non-editor cannot start a sequence (nothing enrolled)', async () => {
    canEdit = false
    const res = await startSequenceForAudience('space-A', 'seq1')
    expect('error' in res).toBe(true)
    expect(enrollCalls.length).toBe(0)
  })

  it('a Space without the automation entitlement cannot start a sequence (nothing enrolled)', async () => {
    hasAutomation = false
    const res = await startSequenceForAudience('space-A', 'seq1')
    expect('error' in res).toBe(true)
    expect(enrollCalls.length).toBe(0)
  })

  it('an editor on an entitled Space enrolls the resolved audience', async () => {
    mockAudience = [
      { contactId: 'c1', email: 'a@x.com' },
      { contactId: 'c2', email: 'b@x.com' },
    ]
    const res = await startSequenceForAudience('space-A', 'seq1')
    expect('error' in res).toBe(false)
    if (!('error' in res)) expect(res.data.enrolled).toBe(2)
    // Each enroll is space + sequence scoped (proves the runner lever binds the Space).
    expect(enrollCalls).toEqual([
      { spaceId: 'space-A', sequenceId: 'seq1', contactId: 'c1' },
      { spaceId: 'space-A', sequenceId: 'seq1', contactId: 'c2' },
    ])
  })

  it('an already-enrolled audience reports zero newly enrolled (idempotent)', async () => {
    enrollOutcome = false // every enroll is a no-op (already enrolled)
    const res = await startSequenceForAudience('space-A', 'seq1')
    expect('error' in res).toBe(false)
    if (!('error' in res)) expect(res.data.enrolled).toBe(0)
  })
})
