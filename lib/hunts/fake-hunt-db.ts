/**
 * An in-memory stand-in for the service-role client, for the Hunt commerce tests (FH-038S, FH-041).
 *
 * TEST SUPPORT ONLY: nothing in the product imports this. It holds tables as plain arrays and answers the
 * four money functions (`hunt_entitlement_project`, `hunt_entitlement_attach`, `hunt_entitlement_reverse`,
 * `hunt_refund_case_open`) with the same rules as supabase/migrations/20270346041000_hunt_commerce.sql, so a
 * test can replay a whole sequence of deliveries and read the resulting benefit states. It is a mirror, not
 * the database: the SQL itself is proved by pgTAP, and docs/hunts/PILOT-COMMERCE.md says which claim rests
 * on which.
 */
type Row = Record<string, unknown>
type Answer = { data: unknown; error: { message: string; code?: string } | null }

type FakeHuntDb = {
  tables: Record<string, Row[]>
  rpcCalls: { fn: string; args: Row }[]
  client: { from: (table: string) => unknown; rpc: (fn: string, args: Row) => Promise<Answer> }
  reset: (seed?: Record<string, Row[]>) => void
}

let nextId = 1

export function createFakeHuntDb(): FakeHuntDb {
  const tables: Record<string, Row[]> = {}
  const rpcCalls: { fn: string; args: Row }[] = []
  const rows = (t: string): Row[] => (tables[t] ??= [])

  const entitlementsOf = (sourceType: unknown, sourceId: unknown, unitKey: unknown) =>
    rows('hunt_entitlements').filter((e) => e.source_type === sourceType && e.source_id === sourceId && (unitKey == null || e.unit_key === unitKey))

  const event = (entitlementId: unknown, kind: string, ref: string): boolean => {
    const log = rows('hunt_entitlement_events')
    if (log.some((x) => x.entitlement_id === entitlementId && x.kind === kind && x.ref === ref)) return false
    log.push({ entitlement_id: entitlementId, kind, ref })
    return true
  }

  const openCase = (c: Row): boolean => {
    const cases = rows('hunt_refund_cases')
    if (cases.some((x) => x.source_type === c.source_type && x.source_id === c.source_id && x.kind === c.kind && x.ref === c.ref)) return false
    cases.push({ status: 'open', ...c })
    return true
  }

  const fns: Record<string, (a: Row) => unknown> = {
    hunt_entitlement_project(a) {
      const existing = entitlementsOf(a.p_source_type, a.p_source_id, a.p_unit_key).find((e) => e.benefit_code === a.p_benefit_code)
      if (!existing) {
        const id = `ent-${nextId++}`
        rows('hunt_entitlements').push({
          id, hunt_id: a.p_hunt_id, binding_id: a.p_binding_id, offer_id: a.p_offer_id, binding_revision: a.p_binding_revision,
          source_type: a.p_source_type, source_id: a.p_source_id, unit_key: a.p_unit_key, benefit_code: a.p_benefit_code,
          seller_space_id: a.p_seller_space_id, profile_id: a.p_profile_id ?? null,
          state: a.p_profile_id == null ? 'pending_claim' : 'active', suspended_from: null,
          source_seq: Math.max(Number(a.p_source_seq), 0), semantic_key: a.p_semantic_key,
        })
        event(id, 'projected', String(a.p_semantic_key))
        return 'created'
      }
      if (existing.state === 'revoked') return 'refused_revoked'
      if (Number(a.p_source_seq) < Number(existing.source_seq)) return 'stale'
      if (existing.state === 'pending_claim' && a.p_profile_id != null) {
        Object.assign(existing, { profile_id: a.p_profile_id, state: 'active' })
        return 'claimed'
      }
      return 'exists'
    },
    hunt_entitlement_attach(a) {
      const waiting = entitlementsOf(a.p_source_type, a.p_source_id, a.p_unit_key).filter((e) => e.state === 'pending_claim')
      for (const e of waiting) Object.assign(e, { profile_id: a.p_profile_id, state: 'active' })
      return waiting.length
    },
    hunt_entitlement_reverse(a) {
      const mode = String(a.p_mode)
      const ref = String(a.p_ref ?? '')
      if (!['refund', 'dispute_open', 'dispute_lost', 'dispute_won'].includes(mode)) throw new Error(`unknown reversal mode ${mode}`)
      if (!ref.trim()) throw new Error('a reversal needs the canonical refund or dispute reference')
      const out = { revoked: 0, suspended: 0, restored: 0, cases: 0 }
      for (const e of entitlementsOf(a.p_source_type, a.p_source_id, a.p_unit_key)) {
        if (e.state === 'consumed') {
          if ((mode === 'refund' || mode === 'dispute_lost')
            && openCase({ source_type: a.p_source_type, source_id: a.p_source_id, unit_key: e.unit_key, kind: mode === 'refund' ? 'consumed_reversal' : 'dispute_consumed', ref })) out.cases += 1
          continue
        }
        if (mode === 'refund' || mode === 'dispute_lost') {
          if (e.state !== 'revoked') {
            event(e.id, 'revoked', `${mode}:${ref}`)
            Object.assign(e, { state: 'revoked', suspended_from: null, revoke_reason: mode })
            out.revoked += 1
          }
        } else if (mode === 'dispute_open') {
          if (e.state === 'pending_claim' || e.state === 'active') {
            Object.assign(e, { suspended_from: e.state, state: 'suspended' })
            out.suspended += 1
          }
        } else if (e.state === 'suspended') {
          Object.assign(e, { state: e.suspended_from, suspended_from: null })
          out.restored += 1
        }
      }
      return out
    },
    hunt_refund_case_open(a) {
      return openCase({ source_type: a.p_source_type, source_id: a.p_source_id, unit_key: a.p_unit_key ?? null, kind: a.p_kind, ref: a.p_ref, amount_minor: a.p_amount_minor, currency: a.p_currency })
    },
  }

  const from = (table: string) => {
    let filter = (r: Row) => !!r
    let patch: Row | null = null
    let insert: Row | null = null
    const narrow = (next: (r: Row) => boolean) => {
      const prev = filter
      filter = (r) => prev(r) && next(r)
    }
    const run = (): Answer => {
      if (insert) {
        if (table === 'stripe_webhook_events' && rows(table).some((r) => r.event_id === insert?.event_id)) return { data: null, error: { message: 'duplicate', code: '23505' } }
        rows(table).push({ id: `${table}-${nextId++}`, ...insert })
        return { data: null, error: null }
      }
      const hit = rows(table).filter(filter)
      if (patch) for (const r of hit) Object.assign(r, patch)
      return { data: hit, error: null }
    }
    const q: Record<string, unknown> = {}
    Object.assign(q, {
      select: () => q,
      order: () => q,
      limit: () => q,
      eq: (col: string, val: unknown) => { narrow((r) => r[col] === val); return q },
      in: (col: string, vals: unknown[]) => { narrow((r) => vals.includes(r[col])); return q },
      like: (col: string, pattern: string) => { narrow((r) => String(r[col] ?? '').startsWith(pattern.replace(/%$/, ''))); return q },
      insert: (row: Row) => { insert = row; return q },
      update: (values: Row) => { patch = values; return q },
      delete: () => { narrow(() => false); return q },
      maybeSingle: async () => { const a = run(); return { data: (a.data as Row[] | null)?.[0] ?? null, error: a.error } },
      then: (resolve: (v: Answer) => unknown) => resolve(run()),
    })
    return q
  }

  return {
    tables,
    rpcCalls,
    client: {
      from,
      rpc: async (fn, args) => {
        rpcCalls.push({ fn, args })
        const impl = fns[fn]
        if (!impl) return { data: null, error: { message: `unknown function ${fn}` } }
        try {
          return { data: impl(args), error: null }
        } catch (err) {
          return { data: null, error: { message: err instanceof Error ? err.message : String(err) } }
        }
      },
    },
    reset(seed = {}) {
      for (const k of Object.keys(tables)) delete tables[k]
      for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }))
      rpcCalls.length = 0
    },
  }
}
