'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { confirmCancelAction, requestCancelAction, setMinimizedAction } from '@/lib/launch/actions'
import type { LaunchBoxView } from '@/lib/launch/box-state'
import { launchHomeHref } from '@/lib/launch/destination'

// THE LAUNCH BOX (VLS-08). The Vera guided launch's one standing presence: a pill left of the avatar in the
// members header that opens a sheet with the nine steps and where the person stopped. It is the Bell's shape
// (a pill and a sheet that the header opens and closes), so the header keeps one open surface at a time.
//
// There is no dismiss control. The person can MINIMIZE it (the pill shrinks to its ring) and can STOP the
// launch, which takes two steps: the button, then the typed word STOP. Both are saved to the launch row, so
// they survive navigation and reload. Server Component data, small client island: the view arrives as props.

const RESUME_HREF = launchHomeHref({ signedIn: true })

export function LaunchPill({ view, open, onToggle }: { view: LaunchBoxView; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={view.minimized ? 'ap-launch min' : 'ap-launch'}
      aria-expanded={open}
      aria-controls="fqm-launch"
      aria-haspopup="dialog"
      aria-label={`Your launch, ${view.done} of ${view.total} made`}
      title="Your launch"
      onClick={onToggle}
    >
      <span className="ap-launch-ring" data-n={`${view.done}/${view.total}`} style={{ '--p': `${view.pct}%` } as React.CSSProperties} aria-hidden />
      <span className="ap-launch-l">Your launch</span>
    </button>
  )
}

export function LaunchSheet({ view, onClose }: { view: LaunchBoxView; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [asked, setAsked] = useState(view.stopAsked)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)

  const minimize = () =>
    start(async () => {
      const res = await setMinimizedAction(!view.minimized)
      if ('error' in res) return setError(res.error)
      setError(null)
      router.refresh()
      if (!view.minimized) onClose()
    })
  const askStop = () =>
    start(async () => {
      const res = await requestCancelAction()
      if ('error' in res) return setError(res.error)
      setError(null)
      setAsked(true)
    })
  const confirmStop = () =>
    start(async () => {
      const res = await confirmCancelAction(typed)
      if ('error' in res) return setError(res.error)
      onClose()
      router.refresh()
    })

  return (
    <>
      <div className="ap-sheet-t">Your launch</div>
      <p className="ap-launch-sub">{view.current ? `Next up: ${view.current.label}` : 'Every step is settled.'}</p>
      <div className="ap-launch-stages">
        {view.stages.map((st) => (
          <section key={st.id} aria-label={st.label}>
            <h3>{st.label}</h3>
            <ul>
              {st.rows.map((r) => (
                <li key={r.id} className={`ap-launch-row ${r.state}`}>
                  <span className="ap-launch-mark" aria-hidden>{r.state === 'done' ? <FqIcon name="check" /> : null}</span>
                  <span>{r.label}</span>
                  {r.state === 'skipped' && <small>Skipped</small>}
                  {r.state === 'now' && <small>Now</small>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {view.current && (
        <Link href={RESUME_HREF} className="btn pa ap-launch-go" onClick={onClose}>
          Keep going
        </Link>
      )}
      <div className="ap-launch-foot">
        <button type="button" className="ap-launch-quiet" onClick={minimize} disabled={pending}>
          {view.minimized ? 'Show my launch' : 'Minimize'}
        </button>
        {!asked && (
          <button type="button" className="ap-launch-quiet" onClick={askStop} disabled={pending}>
            Stop my launch
          </button>
        )}
      </div>
      {asked && (
        <form
          className="ap-launch-stop"
          onSubmit={(e) => {
            e.preventDefault()
            confirmStop()
          }}
        >
          <label htmlFor="fqm-launch-stop">Type STOP to end your launch. Anything you made stays.</label>
          <input id="fqm-launch-stop" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          <button type="submit" className="ap-launch-quiet" disabled={pending || typed.trim().length === 0}>
            Stop
          </button>
        </form>
      )}
      {error && <p className="ap-launch-err" role="alert">{error}</p>}
    </>
  )
}
