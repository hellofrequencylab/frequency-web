// Only the database and external effects are modeled here. The probe runs the
// application's actual legacy orchestrators against these in-memory responses.
export const nodeId = 'fixture-node'
export const memberDay = '2026-11-10'
export const fixtureProof = 'fixture-proof'

let state

export function resetLegacyFixture() {
  state = {
    nodes: [{
      id: nodeId, active: true, capture_rule: 'repeatable', type: 'qr',
      zaps_value: 5, kind: 'ordinary', partner_id: null, space_id: null, max_claims: null,
    }],
    season_challenges: [],
    challenge_qr_codes: [],
    challenge_progress: [],
    reward_grants: [],
    engagement_events: [],
    captures: [],
    achievements: [],
    stamps: new Set(),
    zapEntries: [],
    advanceCalls: [],
    faults: [],
    interruptAward: false,
  }
  return state
}

export function unexpected(operation) {
  const message = `Unexpected operation in FH-002 fixture: ${operation}`
  state.faults.push(message)
  throw new Error(message)
}

const success = (data = null) => ({ data, error: null })

function fakeQuery(table) {
  if (!Array.isArray(state[table])) unexpected(`table ${table}`)
  const rows = state[table]
  const filters = []
  const matching = () => rows.filter((row) => filters.every((accept) => accept(row)))
  let run = async () => success(matching())
  const query = {
    select(_columns, options) {
      if (!options?.head) return query
      run = async () => ({ count: matching().length, error: null })
      return query
    },
    eq(column, value) {
      filters.push((row) => row[column] === value)
      return query
    },
    not(column, operator, value) {
      if (operator !== 'is' || value !== null) unexpected(`not ${operator}`)
      filters.push((row) => row[column] != null)
      return query
    },
    insert(values) {
      run = async () => {
        const batch = [values].flat()
        if (table === 'reward_grants' && rows.some(
          (row) => row.rule_key === values.rule_key && row.profile_id === values.profile_id,
        )) return { data: null, error: { code: '23505' } }
        const inserted = batch.map((row, i) => ({
          id: `fixture-${table}-${rows.length + i + 1}`,
          ...(table === 'season_challenges' ? { is_active: true } : {}),
          ...row,
        }))
        rows.push(...inserted)
        return success(inserted)
      }
      return query
    },
    upsert(value, options) {
      if (table !== 'engagement_events' || options?.onConflict !== 'idempotency_key' || !options.ignoreDuplicates) {
        unexpected(`upsert ${table}`)
      }
      run = async () => {
        if (rows.some((row) => row.idempotency_key === value.idempotency_key)) return success([])
        const row = { ...value, id: `fixture-event-${rows.length + 1}` }
        rows.push(row)
        return success([row])
      }
      return query
    },
    delete() {
      run = async () => {
        for (const row of matching()) rows.splice(rows.indexOf(row), 1)
        return success()
      }
      return query
    },
    async maybeSingle() {
      const result = await run()
      return { ...result, data: result.data?.[0] ?? null }
    },
    single() { return query.maybeSingle() },
    then(resolve, reject) { return run().then(resolve, reject) },
  }
  return query
}

async function fakeRpc(name, args) {
  if (name === 'advance_challenge_progress') {
    state.advanceCalls.push(args)
    const rows = state.challenge_progress
    let progress = rows.find((row) => row.challenge_id === args._challenge && row.profile_id === args._profile)
    if (!progress) {
      progress = { challenge_id: args._challenge, profile_id: args._profile, current: 0, completed_at: null }
      rows.push(progress)
    }
    const justCompleted = progress.completed_at === null && ++progress.current >= args._target
    if (justCompleted) progress.completed_at = memberDay
    return success({ current: progress.current, completed: progress.completed_at !== null, just_completed: justCompleted })
  }
  if (name === 'loyalty_record_visit') {
    const key = `${args._space}:${args._profile}:${args._day}:${args._kind}`
    const stamped = !state.stamps.has(key)
    state.stamps.add(key)
    return success({ stamped, stamps: 1, required: 5, visit_days: [args._day] })
  }
  return unexpected(`RPC ${name}`)
}

export const createAdminClient = () => ({ from: fakeQuery, rpc: fakeRpc })

export async function awardZaps(profileId, amount, options) {
  if (state.interruptAward) {
    state.interruptAward = false
    throw new Error('fixture: award interrupted')
  }
  state.zapEntries.push({ profileId, action: options.actionType, amount })
  return { awarded: true, amount }
}

export const awardZapsForAction = (profileId, action) => awardZaps(profileId, 25, { actionType: action })
export const awardGems = () => unexpected('Gem award')
export const resolveMemberDay = async () => memberDay
export const nodeCodeVerdict = ({ presented }) => presented === fixtureProof ? 'signed' : 'refused'
export const runAutomationsForEvent = async () => {}
export const trustSource = () => ({ signal: async () => {} })
export const recordSpaceMemberActivity = () => unexpected('CRM timeline write')
export const routeNotification = () => unexpected('notification')
export const loyaltyEnabled = () => true
export const getLoyaltyProgram = async () => ({ status: 'on', rewardTitle: 'Fixture reward' })
export const recordHuntProgress = () => unexpected('Regulars Hunt completion')
export const requireAdmin = async () => {}
export const getCurrentSeason = async () => ({ season_number: 1 })
export const revalidatePath = () => {}
