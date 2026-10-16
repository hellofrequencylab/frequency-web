// THE TIER GRAPHICS (SCAN-961): four small inline SVGs that explain the Space ladder and the
// Collective / Network split (owner ruling 2026-10-15). Flat and calm, drawn only in the kit's tokens:
// every stroke and fill is `currentColor`, and the colour comes from a class (`tg-q` quiet, `tg-a` the
// one accented element, `tg-t` text) set in app/themes/frequency/site-pages-b.css. No hex, no motion.
// Every price and rate is passed in from the Offering model (lib/pricing/pricing-grid.ts), so a graphic
// can never quote a number the cards and checkout do not.
import type { Offering } from '@/lib/pricing/pricing-grid'

/** One rung of the ladder graphic, read off an Offering. */
export interface LadderStep {
  id: string
  label: string
  price: string
}

/** The ladder's rungs: Free, Business, Collective, Network, in that order. Non Profit is a price for a
 *  verified organization on the same rungs, not a rung of its own, so it is left out of the drawing. */
export function ladderSteps(spaces: readonly Offering[]): LadderStep[] {
  const order = ['free', 'business', 'collective', 'network']
  return order.flatMap((id) => {
    const o = spaces.find((s) => s.id === id)
    return o ? [{ id, label: o.label, price: o.monthly }] : []
  })
}

/** A small Space mark: a rounded square with a dot (its owner). */
function SpaceMark({ x, y, s = 28, cls = 'tg-q', owner = 'tg-q' }: { x: number; y: number; s?: number; cls?: string; owner?: string }) {
  return (
    <g>
      <rect className={cls} x={x} y={y} width={s} height={s} rx={7} fill="none" stroke="currentColor" strokeWidth={2} />
      <circle className={owner} cx={x + s / 2} cy={y + s / 2} r={4} fill="currentColor" />
    </g>
  )
}

/** 1. The tier ladder: four steps rising left to right, each drawn as what the plan holds. The step
 *  named by `active` (default Network) carries the accent. */
export function TierLadder({ steps, active = 'network' }: { steps: readonly LadderStep[]; active?: string }) {
  const w = 640
  const colW = w / Math.max(steps.length, 1)
  return (
    <svg className="tg" viewBox={`0 0 ${w} 250`} role="img" aria-labelledby="tg-ladder-t tg-ladder-d" preserveAspectRatio="xMidYMid meet">
      <title id="tg-ladder-t">The Space plans, from one Space to a whole network</title>
      <desc id="tg-ladder-d">{steps.map((s) => `${s.label}: ${s.price}`).join('. ')}.</desc>
      {steps.map((s, i) => {
        const x = i * colW + 12
        const top = 150 - i * 34
        const cls = s.id === active ? 'tg-a' : 'tg-q'
        return (
          <g key={s.id}>
            <rect className={cls} x={x} y={top} width={colW - 24} height={190 - top} rx={10} fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeWidth={2} />
            {s.id === 'free' && <SpaceMark x={x + (colW - 24) / 2 - 14} y={top + 12} cls={cls} owner={cls} />}
            {s.id === 'business' && (
              <>
                <SpaceMark x={x + (colW - 24) / 2 - 14} y={top + 12} cls={cls} owner={cls} />
                <path className={cls} d={`M${x + 18} ${top + 54}h${colW - 60}`} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
              </>
            )}
            {s.id === 'collective' && (
              <>
                <SpaceMark x={x + 12} y={top + 12} s={22} cls={cls} owner="tg-q" />
                <SpaceMark x={x + (colW - 24) / 2 - 11} y={top + 12} s={22} cls={cls} owner={cls} />
                <SpaceMark x={x + colW - 58} y={top + 12} s={22} cls={cls} owner="tg-q" />
              </>
            )}
            {s.id === 'network' && (
              <>
                <SpaceMark x={x + (colW - 24) / 2 - 12} y={top + 10} s={24} cls={cls} owner={cls} />
                {[0, 1, 2].map((k) => {
                  const cx = x + 22 + k * ((colW - 68) / 2)
                  return (
                    <g key={k}>
                      <path className={cls} d={`M${x + (colW - 24) / 2} ${top + 34}L${cx + 9} ${top + 56}`} stroke="currentColor" strokeWidth={1.5} />
                      <SpaceMark x={cx} y={top + 56} s={18} cls={cls} owner={cls} />
                    </g>
                  )
                })}
              </>
            )}
            <text className="tg-t" x={x + (colW - 24) / 2} y={212} textAnchor="middle" fontWeight={600} fontSize={15} fill="currentColor">{s.label}</text>
            <text className="tg-m" x={x + (colW - 24) / 2} y={234} textAnchor="middle" fontSize={13} fill="currentColor">{s.price}</text>
          </g>
        )
      })}
    </svg>
  )
}

/** 2. Collective or Network: many owners working together against one owner running many chapters. */
export function CollectiveOrNetwork() {
  return (
    <svg className="tg" viewBox="0 0 640 230" role="img" aria-labelledby="tg-split-t tg-split-d" preserveAspectRatio="xMidYMid meet">
      <title id="tg-split-t">Collective or Network</title>
      <desc id="tg-split-d">A Collective is many owners working together, each keeping their own Space. A Network is one owner running many chapters.</desc>
      {/* Collective: three Spaces, three different owners, joined by a shared calendar bar. */}
      <g>
        <SpaceMark x={40} y={50} s={44} owner="tg-q" />
        <SpaceMark x={128} y={50} s={44} owner="tg-a" />
        <SpaceMark x={216} y={50} s={44} owner="tg-q" />
        <rect className="tg-a" x={40} y={118} width={220} height={14} rx={7} fill="currentColor" fillOpacity={0.3} stroke="currentColor" strokeWidth={1.5} />
        {[62, 150, 238].map((cx) => <path key={cx} className="tg-q" d={`M${cx} 96v20`} stroke="currentColor" strokeWidth={1.5} strokeDasharray="3 3" />)}
        <text className="tg-t" x={150} y={170} textAnchor="middle" fontWeight={600} fontSize={16} fill="currentColor">Collective</text>
        <text className="tg-m" x={150} y={194} textAnchor="middle" fontSize={13} fill="currentColor">Many owners, working together</text>
      </g>
      <path className="tg-q" d="M320 30v170" stroke="currentColor" strokeWidth={1} />
      {/* Network: one parent, one owner, chapters branching below. */}
      <g>
        <SpaceMark x={468} y={24} s={44} cls="tg-a" owner="tg-a" />
        {[380, 440, 500, 560].map((cx) => (
          <g key={cx}>
            <path className="tg-a" d={`M490 68L${cx + 14} 100`} stroke="currentColor" strokeWidth={1.5} />
            <SpaceMark x={cx} y={100} s={28} cls="tg-q" owner="tg-a" />
          </g>
        ))}
        <text className="tg-t" x={490} y={170} textAnchor="middle" fontWeight={600} fontSize={16} fill="currentColor">Network</text>
        <text className="tg-m" x={490} y={194} textAnchor="middle" fontSize={13} fill="currentColor">One owner, many chapters</text>
      </g>
    </svg>
  )
}

/** One small chapter tree; `lit` says which branches are highlighted. */
function Tree({ ox, lit }: { ox: number; lit: 'all' | 'one' }) {
  const kids = [0, 1, 2]
  return (
    <g>
      <SpaceMark x={ox + 96} y={20} s={36} cls={lit === 'all' ? 'tg-a' : 'tg-q'} owner={lit === 'all' ? 'tg-a' : 'tg-q'} />
      {kids.map((k) => {
        const x = ox + 24 + k * 84
        const on = lit === 'all' || k === 0
        return (
          <g key={k}>
            <path className={on ? 'tg-a' : 'tg-q'} d={`M${ox + 114} 56L${x + 16} 92`} stroke="currentColor" strokeWidth={1.5} />
            <SpaceMark x={x} y={92} s={32} cls={on ? 'tg-a' : 'tg-q'} owner={on ? 'tg-a' : 'tg-q'} />
          </g>
        )
      })}
    </g>
  )
}

/** 3. Who sees what in a Network: central admins see every chapter, a chapter leader sees their own. */
export function WhoSeesWhat() {
  return (
    <svg className="tg" viewBox="0 0 640 200" role="img" aria-labelledby="tg-who-t tg-who-d" preserveAspectRatio="xMidYMid meet">
      <title id="tg-who-t">Who sees what in a Network</title>
      <desc id="tg-who-d">A central admin sees every chapter. A chapter leader sees only their own chapter.</desc>
      <Tree ox={40} lit="all" />
      <text className="tg-t" x={154} y={160} textAnchor="middle" fontWeight={600} fontSize={15} fill="currentColor">Central admin</text>
      <text className="tg-m" x={154} y={182} textAnchor="middle" fontSize={13} fill="currentColor">Sees every chapter</text>
      <Tree ox={360} lit="one" />
      <text className="tg-t" x={474} y={160} textAnchor="middle" fontWeight={600} fontSize={15} fill="currentColor">Chapter leader</text>
      <text className="tg-m" x={474} y={182} textAnchor="middle" fontSize={13} fill="currentColor">Sees their own chapter</text>
    </svg>
  )
}

/** One bar of the fee graphic. */
export interface FeeBar {
  id: string
  label: string
  bps: number
}

/** The bars: the fee each sellable plan pays on a customer Frequency introduces, read off the Offerings. */
export function feeBars(spaces: readonly Offering[]): FeeBar[] {
  return ['free', 'business', 'collective', 'network'].flatMap((id) => {
    const o = spaces.find((s) => s.id === id)
    return o && o.sells ? [{ id, label: o.label, bps: o.networkRateBps }] : []
  })
}

const pct = (bps: number) => `${Number.isInteger(bps / 100) ? bps / 100 : (bps / 100).toFixed(1)}%`

/** 4. What you pay on sales: the fee on a customer Frequency introduces, per plan, beside the 0% every
 *  plan pays on its own people. The Network bar carries the accent. */
export function FeeBars({ bars }: { bars: readonly FeeBar[] }) {
  const max = Math.max(...bars.map((b) => b.bps), 1)
  const rowH = 40
  const h = (bars.length + 1) * rowH + 20
  return (
    <svg className="tg" viewBox={`0 0 640 ${h}`} role="img" aria-labelledby="tg-fee-t tg-fee-d" preserveAspectRatio="xMidYMid meet">
      <title id="tg-fee-t">What you pay on sales</title>
      <desc id="tg-fee-d">{`On a customer Frequency introduces: ${bars.map((b) => `${b.label} ${pct(b.bps)}`).join(', ')}. On your own people, every plan pays 0%, plus card processing.`}</desc>
      {bars.map((b, i) => {
        const y = 10 + i * rowH
        const wBar = Math.max(6, (b.bps / max) * 380)
        const cls = b.id === 'network' ? 'tg-a' : 'tg-q'
        return (
          <g key={b.id}>
            <text className="tg-t" x={0} y={y + 20} fontSize={14} fontWeight={600} fill="currentColor">{b.label}</text>
            <rect className={cls} x={140} y={y + 6} width={wBar} height={20} rx={6} fill="currentColor" fillOpacity={0.35} stroke="currentColor" strokeWidth={1.5} />
            <text className="tg-t" x={150 + wBar} y={y + 21} fontSize={14} fill="currentColor">{pct(b.bps)}</text>
          </g>
        )
      })}
      <g>
        <text className="tg-t" x={0} y={10 + bars.length * rowH + 20} fontSize={14} fontWeight={600} fill="currentColor">Your own people</text>
        <rect className="tg-q" x={140} y={10 + bars.length * rowH + 6} width={6} height={20} rx={3} fill="currentColor" />
        <text className="tg-m" x={156} y={10 + bars.length * rowH + 21} fontSize={14} fill="currentColor">0% on every plan, plus card processing</text>
      </g>
    </svg>
  )
}
