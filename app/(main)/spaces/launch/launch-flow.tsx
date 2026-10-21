'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { SparkShell } from '@/components/studio/spark'
import { LAUNCH_QUESTIONS, launchReady, type LaunchAnswers } from '@/lib/importer/launch'
import { launchSpace, launchStatus, startLaunch, type LaunchStatus } from './actions'
import { LaunchBackdrop, LaunchField, LaunchPreview, LaunchWorking, lockup } from './launch-screens'

// THE OWNER LAUNCH (client). One question per screen on the Spark shell, then Vera drafts the page, then a
// look-over, then Launch. The shell gives the progress, Back and Continue; the questions and their
// writing prompts live in lib/importer/launch.ts. The flow only holds the answers and the intake id.

type Phase = 'asking' | 'working' | 'ready'

const POLL_MS = 3000
/** Stop watching after this long and say so, rather than spinning forever. */
const GIVE_UP_MS = 6 * 60 * 1000

export function LaunchFlow() {
  const [answers, setAnswers] = useState<LaunchAnswers>({})
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('asking')
  const [intakeId, setIntakeId] = useState<string | null>(null)
  const [status, setStatus] = useState<LaunchStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const startedAt = useRef(0)

  const q = LAUNCH_QUESTIONS[index]
  const last = index === LAUNCH_QUESTIONS.length - 1
  const value = answers[q.id] ?? ''

  const poll = useCallback(async (id: string) => {
    const next = await launchStatus(id)
    if (next.state === 'ready') {
      setStatus(next)
      setPhase('ready')
    } else if (next.state === 'failed') {
      setError(next.error ?? 'Vera could not finish the draft.')
      setPhase('asking')
    } else if (Date.now() - startedAt.current > GIVE_UP_MS) {
      setError('This is taking longer than usual. Your draft will keep going; come back to this page in a few minutes.')
      setPhase('asking')
    }
  }, [])

  useEffect(() => {
    if (phase !== 'working' || !intakeId) return
    const t = setInterval(() => void poll(intakeId), POLL_MS)
    return () => clearInterval(t)
  }, [phase, intakeId, poll])

  function submit() {
    setError(null)
    start(async () => {
      const res = await startLaunch(answers)
      if (!res.ok) {
        setError(res.error)
        return
      }
      startedAt.current = Date.now()
      setIntakeId(res.intakeId)
      setPhase('working')
    })
  }

  function launch() {
    if (!intakeId) return
    setError(null)
    start(async () => {
      // launchSpace redirects on success, so we only come back here with an error.
      const res = await launchSpace(intakeId)
      if (res && !res.ok) setError(res.error)
    })
  }

  if (phase === 'working') return <LaunchBackdrop orb={false}><LaunchWorking name={answers.name ?? ''} /></LaunchBackdrop>
  if (phase === 'ready' && status?.preview) {
    return (
      <LaunchBackdrop>
        <LaunchPreview
          preview={status.preview}
          busy={pending}
          error={error}
          onLaunch={launch}
          onBack={() => {
            setPhase('asking')
            setIndex(0)
          }}
        />
      </LaunchBackdrop>
    )
  }

  const canContinue = !q.required || value.trim().length > 0
  return (
    <LaunchBackdrop>
      <SparkShell
        eyebrow="Launch your page"
        headingLevel={2}
        title={lockup(q.title)}
        description={q.help}
        step={index + 1}
        totalSteps={LAUNCH_QUESTIONS.length}
        stepLabel={q.id === 'name' ? 'Name' : undefined}
        onBack={index > 0 ? () => setIndex(index - 1) : undefined}
        onNext={last ? submit : () => setIndex(index + 1)}
        nextLabel={last ? 'Draft my page' : value.trim() ? 'Continue' : 'Skip'}
        nextDisabled={!canContinue || (last && !launchReady(answers))}
        busy={pending}
        error={error}
        draftScopeKey={null}
      >
        <LaunchField question={q} value={value} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
      </SparkShell>
    </LaunchBackdrop>
  )
}
