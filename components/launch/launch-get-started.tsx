import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import { getStartedView } from '@/lib/launch/get-started'
import type { CSSProperties } from 'react'
import { Bar } from './launch-overview'

// GET STARTED, AFTER PUBLISH. The launch overview's own to-do, in the rail's box: the ring and one bar per section
// for the same numbers, what is still to do with one way in, and what is already done with the record's own words
// beside it. There is one list; before Publish the launch box and /launch draw it, after Publish this does. Photos
// are encouraged and never required, so a photo item is a plain "Add a photo". Scheduling is a check-off item.
// Server Component.

export function LaunchGetStartedBox({ sections, className }: { sections: Parameters<typeof getStartedView>[0]; className?: string }) {
  const v = getStartedView(sections)
  const next = v.todo[0]
  const rest = v.todo.slice(1)
  return (
    <section className={className ? `fqm-gs ${className}` : 'fqm-gs'} aria-label="Get started" data-energy="flow">
      <div className="fq-aura" aria-hidden />
      <div className="fqm-gs-h">
        <span className="fqm-gs-ring" data-n={`${v.done}/${v.total}`} style={{ '--p': `${Math.round(v.ratio * 100)}%` } as CSSProperties} aria-hidden />
        <span className="fqm-grow">
          <b>Get started</b>
          <small>{v.complete ? `All ${v.total} done` : `${v.done} of ${v.total} done · ${v.left} left`}</small>
        </span>
      </div>

      {v.complete ? (
        <EmptyState variant="cleared" title="You are all set" description="Everything on the list is on your Space. Nothing here is made up." />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
            {v.sections.map((s) => (
              <div key={s.id} style={{ display: 'grid', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="t2">{s.title}</span>
                  <span className="t2">{s.done}/{s.total}</span>
                </div>
                <Bar ratio={s.ratio} />
              </div>
            ))}
          </div>

          {next ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="eyebrow">Next up</div>
              <p style={{ fontWeight: 600, margin: 0 }}>{next.label}</p>
              {next.photo ? <p className="t2" style={{ margin: 0 }}>{next.skipped ? 'Skipped for now. It stays here whenever you feel like it.' : 'A face or a place makes this feel like yours. You can change it any time.'}</p> : null}
              <div>
                <Link className="btn pa" href={next.href}>{next.photo ? 'Add a photo' : 'Pick up here'}</Link>
              </div>
            </div>
          ) : null}

          {rest.length > 0 ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }} aria-label="Still to do">
              {rest.map((i) => (
                <li key={i.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span>{i.label}</span>
                  <Link className="btn txt sm" href={i.href}>{i.photo ? 'Add a photo' : 'Open'}</Link>
                </li>
              ))}
            </ul>
          ) : null}

          {v.found.length > 0 ? (
            <details>
              <summary className="t2">Already yours ({v.found.length})</summary>
              <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 6 }}>
                {v.found.map((i) => (
                  <li key={i.id} style={{ display: 'grid', gap: 2 }}>
                    <span>{i.label}</span>
                    {i.found ? <span className="t2">{i.found}</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </section>
  )
}
