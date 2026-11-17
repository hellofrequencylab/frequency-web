// The /how advisor brief's two calculators (region model + growth pace). Pure: no DOM, no IO.
// Prices are the live list prices (lib/pricing/defaults.ts): Business $49, Collective $149,
// Non Profit $39; network take 5% Business, 3% Collective; Vera AI add-on $20.

export const BRIEF_DEFAULTS = {
  hosts: 100, pBiz: 25, pCol: 8, pNon: 5, sales: 2000, netShare: 20, addon: 10, regions: 1,
  pop: 1000000, leads: 600, fitRate: 30, joinRate: 25, activeRate: 60,
} as const

type BriefKey = keyof typeof BRIEF_DEFAULTS
export type BriefState = Record<BriefKey, number>

export interface BriefResult {
  st: BriefState
  v: Record<string, string>
  o: Record<string, string>
}

const n = (x: number) => Math.round(x).toLocaleString('en-US')
const m = (x: number) => '$' + Math.round(x).toLocaleString('en-US')
const pct = (x: number) => x + '%'

export function isBriefKey(k: string): k is BriefKey {
  return Object.prototype.hasOwnProperty.call(BRIEF_DEFAULTS, k)
}

export function computeBrief(input: Partial<BriefState> = {}): BriefResult {
  const st = { ...BRIEF_DEFAULTS, ...input } as BriefState
  const biz = Math.round((st.hosts * st.pBiz) / 100)
  const col = Math.round((st.hosts * st.pCol) / 100)
  const non = Math.round((st.hosts * st.pNon) / 100)
  const paying = Math.min(st.hosts, biz + col + non)
  const plans = biz * 49 + col * 149 + non * 39
  const fees = ((biz * 0.05 + col * 0.03) * st.sales * st.netShare) / 100
  const adds = Math.round((paying * st.addon) / 100) * 20
  const total = plans + fees + adds
  const cB = Math.min(100, st.pBiz), cC = Math.min(100, cB + st.pCol), cN = Math.min(100, cC + st.pNon)
  const target = Math.max(100, Math.round((st.pop / 10000) * 0.75))
  const fF = st.fitRate / 100, jF = (fF * st.joinRate) / 100, aF = (jF * st.activeRate) / 100
  const newHosts = st.leads * aF
  const months = newHosts >= 0.5 ? Math.ceil(target / newHosts) : 0
  return {
    st,
    v: {
      hosts: n(st.hosts), pBiz: pct(st.pBiz), pCol: pct(st.pCol), pNon: pct(st.pNon), sales: m(st.sales), netShare: pct(st.netShare),
      addon: pct(st.addon), regions: st.regions === 1 ? '1 region' : st.regions + ' regions',
      pop: n(st.pop), leads: n(st.leads), fitRate: pct(st.fitRate), joinRate: pct(st.joinRate), activeRate: pct(st.activeRate),
    },
    o: {
      paying: n(paying), free: n(Math.max(0, st.hosts - paying)), parts: `${m(plans)} + ${m(fees)} + ${m(adds)}`,
      wP: String(Math.round(plans)), wF: String(Math.round(fees)), wA: String(Math.round(adds)),
      total: m(total), plans: m(plans), fees: m(fees), adds: m(adds),
      cB: String(cB), cC: String(cC), cN: String(cN), regV: String(Math.round((st.regions / 20) * 100)),
      annual: m(total * 12), allAnnual: m(total * 12 * st.regions),
      target: n(target), fW: String(Math.round(Math.sqrt(fF) * 100)), jW: String(Math.round(Math.sqrt(jF) * 100)), aW: String(Math.round(Math.sqrt(aF) * 100)),
      fitN: n(st.leads * fF), joinN: n(st.leads * jF), newHosts: newHosts < 10 ? newHosts.toFixed(1) : n(newHosts), months: months ? n(months) : 'never',
    },
  }
}

/** Resolve a dotted hole ("o.total") against a result. Unknown holes render empty. */
export function briefValue(r: BriefResult, path: string): string {
  const [group, key] = path.split('.')
  const bag = (r as unknown as Record<string, Record<string, unknown>>)[group]
  const val = bag?.[key]
  return val === undefined || val === null ? '' : String(val)
}
