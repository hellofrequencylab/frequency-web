// THE TIER GRAPHICS (SCAN-961): small inline SVGs that explain the Collective / Network split and who sees what in a Network (owner ruling 2026-10-15). Flat and calm, drawn only in the kit's tokens:
// every stroke and fill is `currentColor`, and the colour comes from a class (`tg-q` quiet, `tg-a` the
// one accented element, `tg-t` text) set in app/themes/frequency/site-pages-b.css. No hex, no motion.
// Every price and rate is passed in from the Offering model (lib/pricing/pricing-grid.ts), so a graphic
// can never quote a number the cards and checkout do not.

/** A small Space mark: a rounded square with a dot (its owner). */
function SpaceMark({ x, y, s = 28, cls = 'tg-q', owner = 'tg-q' }: { x: number; y: number; s?: number; cls?: string; owner?: string }) {
  return (
    <g>
      <rect className={cls} x={x} y={y} width={s} height={s} rx={7} fill="none" stroke="currentColor" strokeWidth={2} />
      <circle className={owner} cx={x + s / 2} cy={y + s / 2} r={4} fill="currentColor" />
    </g>
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
        <text className="tg-t tg-s16" x={150} y={170} textAnchor="middle" fontWeight={600} fill="currentColor">Collective</text>
        <text className="tg-m tg-s13" x={150} y={194} textAnchor="middle" fill="currentColor">Many owners, working together</text>
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
        <text className="tg-t tg-s16" x={490} y={170} textAnchor="middle" fontWeight={600} fill="currentColor">Network</text>
        <text className="tg-m tg-s13" x={490} y={194} textAnchor="middle" fill="currentColor">One owner, many chapters</text>
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
      <text className="tg-t tg-s15" x={154} y={160} textAnchor="middle" fontWeight={600} fill="currentColor">Central admin</text>
      <text className="tg-m tg-s13" x={154} y={182} textAnchor="middle" fill="currentColor">Sees every chapter</text>
      <Tree ox={360} lit="one" />
      <text className="tg-t tg-s15" x={474} y={160} textAnchor="middle" fontWeight={600} fill="currentColor">Chapter leader</text>
      <text className="tg-m tg-s13" x={474} y={182} textAnchor="middle" fill="currentColor">Sees their own chapter</text>
    </svg>
  )
}
