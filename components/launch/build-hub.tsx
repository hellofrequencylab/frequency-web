import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { FEATURES, LAUNCH_BUSINESS, type FeatureId } from '@/lib/feature-builder/catalog'

// THE BUILD HUB (LIVE-2484): the top of the member launch, in four pieces a person can do in any order and come back
// to. Each tile opens that feature's own short builder (the same pages a visitor uses; a member saves straight away),
// shows whether it is already built, and says how long it takes. Launch Your Business sits under them for anyone who
// wants all of it in one sitting. Nothing here asks for all four (owner 2026-11-19: "People should not feel trapped").

export function BuildHub({ built }: { built: readonly FeatureId[] }) {
  return (
    <section className="panel" style={{ display: 'grid', gap: 16 }} aria-labelledby="build-hub-h">
      <div style={{ display: 'grid', gap: 6 }}>
        <div className="eyebrow">Pick one, any order</div>
        <h2 id="build-hub-h" className="h2">What do you want to build today?</h2>
        <p className="t2">Each one takes a few minutes and works on its own. Do one now and come back for the rest whenever.</p>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
        {FEATURES.filter((f) => f.open).map((f) => {
          const done = built.includes(f.id)
          return (
            <li key={f.id}>
              <Link href={f.href} className="panel" style={{ display: 'grid', gap: 8, height: '100%', textDecoration: 'none', color: 'inherit' }} aria-label={`${f.name}${done ? ', built' : `, about ${f.minutes} minutes`}`}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span className="fq-icon-tile"><FqIcon name={f.icon} /></span>
                  <span className="t2" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {done ? <><FqIcon name="check" size={14} /> Built</> : `${f.minutes} min`}
                  </span>
                </span>
                <span style={{ fontWeight: 600 }}>{f.name}</span>
                <span className="t2">{done ? `Your ${f.made} is ${f.doneWord}. Open it to change anything.` : f.promise}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <Link href={LAUNCH_BUSINESS.href} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }} className="t2">
        <FqIcon name="zap" size={16} />
        <span>Want all of it in one go? <b>{LAUNCH_BUSINESS.name}</b> in {LAUNCH_BUSINESS.minutes} minutes.</span>
      </Link>
    </section>
  )
}
