'use client'

// The lead-flow persona picker (ADR-125) on the Frequency design. The SAME behaviour as the DAWN island
// (app/(marketing)/start/[flow]/persona-chooser.tsx), drawn in the kit's grammar:
//   · pick who you are; the induction href carries `?persona=` and `?flow=` exactly as DAWN builds it;
//   · the optional arrival follow-up reads and writes through the one shared hook (useArrivalFollowUp),
//     so the archetype cookie can never be written two ways;
//   · a capture-style flow records the lead first through the SAME server action (captureLead), and
//     the Continue button stays disabled until there is an email, as on DAWN.
// Nothing here is pre-selected that DAWN does not pre-select: `defaultPersona` is the flow's own.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getPersona, type PersonaId } from '@/lib/onboarding/personas'
import { captureLead } from '@/app/(marketing)/start/actions'
import { useArrivalFollowUp } from '@/components/onboarding/arrival-follow-up'
import type { ArchetypeId } from '@/lib/audience/archetypes'
import { Input } from '@/components/ui/field'
import { FnHead } from './parts'

export function FrequencyPersonaChooser({
  flow,
  source,
  prompt,
  personas,
  captureEmail,
  defaultPersona,
}: {
  flow: string
  source: string
  prompt: string
  personas: PersonaId[]
  captureEmail: boolean
  defaultPersona?: PersonaId
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<PersonaId | null>(defaultPersona ?? null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [archetype, setArchetype] = useState<ArchetypeId | null>(null)
  const followUps = useArrivalFollowUp(selected, archetype, setArchetype)

  const chosen = selected ? getPersona(selected) : null
  const inductionHref = (id: PersonaId) => `/join?persona=${encodeURIComponent(id)}&flow=${encodeURIComponent(flow)}`

  async function go() {
    if (!selected || busy) return
    setBusy(true)
    setError('')
    if (captureEmail) {
      const res = await captureLead({ persona: selected, archetype, flow, source, email })
      if (!res.ok) {
        setError(res.error)
        setBusy(false)
        return
      }
    }
    router.push(inductionHref(selected))
  }

  return (
    <>
      <FnHead label="Who are you?" title={prompt} />
      <div className="g3 fn-doors" role="group" aria-label={prompt}>
        {personas.map((id) => {
          const p = getPersona(id)
          const active = selected === id
          return (
            <button
              key={id}
              type="button"
              className="pc"
              aria-pressed={active}
              onClick={() => {
                setSelected(id)
                setError('')
              }}
            >
              <span className="ic">
                <p.Icon aria-hidden />
              </span>
              <h3>{p.label}</h3>
              <p>{p.pitch}</p>
            </button>
          )
        })}
      </div>

      {chosen && (
        <div className="fn-col fn-after">
          <form
            className="fn-box jx-f"
            onSubmit={(e) => {
              e.preventDefault()
              void go()
            }}
          >
            <h2>{chosen.track.headline}</h2>
            <ul className="fn-shows">
              {chosen.track.shows.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>

            {followUps.length > 0 && (
              <div className="jx-lab" role="group" aria-labelledby="fn-follow">
                <span id="fn-follow">One more, if you like. Which sounds most like you?</span>
                <span className="jx-chips">
                  {followUps.map((o) => {
                    const on = archetype === o.archetype
                    return (
                      <button
                        key={o.archetype}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setArchetype(on ? null : o.archetype)}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </span>
                <span className="jx-fine">Optional. It only changes what we show you first.</span>
              </div>
            )}

            {captureEmail && (
              <label>
                Email
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>
            )}

            {error && (
              <p className="jx-err" role="alert">
                {error}
              </p>
            )}

            <button
              className="btn fq-iri-btn"
              type="submit"
              disabled={busy || (captureEmail && !email.trim())}
            >
              {busy ? 'One sec…' : `Continue as ${chosen.label} →`}
            </button>
            <p className="jx-alt">
              <Link href={chosen.track.learnMoreHref}>Or first, {chosen.track.learnMoreLabel.toLowerCase()}</Link>
            </p>
          </form>
        </div>
      )}
    </>
  )
}
