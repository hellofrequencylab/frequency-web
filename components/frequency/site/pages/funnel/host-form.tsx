'use client'

// The /start/host form (LIVE-2233). A host who got an invite link lands here with the link's context
// already read on the server (lib/onboarding/funnel-context.ts): what they host is pre-picked from the
// link's Channel and where is pre-picked from its area, and both stay editable. Continue records the
// lead through the shared lead action (captureLead), which re-reads the link's params itself, then
// carries them into the induction as a practitioner.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { captureLead } from '@/app/(marketing)/start/actions'
import { SUBJECTS } from '@/lib/taxonomy/subjects'
import { FUNNEL_REGIONS } from '@/lib/onboarding/funnel-context'
import { Input } from '@/components/ui/field'
import { FnHead } from './parts'

export function HostFunnelForm({
  params,
  subject: initialSubject,
  area: initialArea,
  region,
  continueQuery,
}: {
  /** The link's raw params, sent back for the server to re-read. */
  params: Record<string, string>
  subject: string | null
  area: string | null
  /** The link's region, listed first in the area picker. */
  region: string | null
  /** Ids-only query carried on to /join. */
  continueQuery: string
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState(initialSubject ?? '')
  const [area, setArea] = useState(initialArea ?? '')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const regions = region
    ? [...FUNNEL_REGIONS.filter((r) => r.id === region), ...FUNNEL_REGIONS.filter((r) => r.id !== region)]
    : FUNNEL_REGIONS

  async function go() {
    if (busy) return
    setBusy(true)
    setError('')
    const res = await captureLead({
      persona: 'practitioner',
      flow: 'host',
      source: 'lead_host',
      email,
      name,
      funnel: params,
      host: { subject, area, link },
    })
    if (!res.ok) {
      setError(res.error)
      setBusy(false)
      return
    }
    const q = new URLSearchParams(continueQuery)
    q.set('persona', 'practitioner')
    q.set('flow', 'host')
    router.push(`/join?${q.toString()}`)
  }

  return (
    <section className="sec" data-screen-label="02 Host">
      <div className="wrap">
        <FnHead label="Your Circle" title="Tell us a little, and we will set you up." />
        <div className="fn-col">
          <form
            className="fn-box jx-f"
            onSubmit={(e) => {
              e.preventDefault()
              void go()
            }}
          >
            <label>
              Your name
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
            <label>
              Email
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>
            <label>
              What you host
              <select className="input" value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">Choose one</option>
                {SUBJECTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Where
              <select className="input" value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="">Somewhere else</option>
                {regions.map((r) => (
                  <optgroup key={r.id} label={r.name}>
                    {r.areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              Your page, if you have one
              <Input
                inputMode="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Instagram, website or class listing"
              />
            </label>

            {error && (
              <p className="jx-err" role="alert">
                {error}
              </p>
            )}

            <button className="btn fq-iri-btn" type="submit" disabled={busy || !email.trim()}>
              {busy ? 'One sec…' : 'Start my Circle →'}
            </button>
            <p className="jx-fine">Free to host. We only use your email to help you get set up.</p>
          </form>
        </div>
      </div>
    </section>
  )
}
