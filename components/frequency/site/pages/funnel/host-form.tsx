'use client'

// The /start/host form (LIVE-2233). A host who got an invite link lands here with the link's context
// already read on the server (lib/onboarding/funnel-context.ts): what they host is pre-picked from the
// link's Channel and where is pre-picked from its area, and both stay editable. Continue records the
// lead through the shared lead action (captureLead), which re-reads the link's params itself, then
// opens the Create a Space wizard (owner 2026-11-11: a DM link goes straight to building, never to the member
// sign-up), carrying the ids-only context along.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { captureLead } from '@/app/(marketing)/start/actions'
import { SUBJECTS } from '@/lib/taxonomy/subjects'
import { FUNNEL_REGIONS } from '@/lib/onboarding/funnel-context'
import { Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
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
  /** Ids-only query carried on to /create-a-space. */
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
    router.push(continueQuery ? `/create-a-space?${continueQuery}` : '/create-a-space')
  }

  return (
    <section className="sec" data-screen-label="02 Host">
      <div className="wrap">
        <FnHead label="Your Space" title="Tell us a little, and we will set up your Space." />
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
              <Select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                emptyLabel="Choose one"
                options={SUBJECTS.map((x) => ({ value: x.key, label: x.label }))}
              />
            </label>
            <label>
              Where
              <Select value={area} onChange={(e) => setArea(e.target.value)} emptyLabel="Somewhere else">
                {regions.map((r) => (
                  <optgroup key={r.id} label={r.name}>
                    {r.areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
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
              {busy ? 'One sec…' : 'Start my Space →'}
            </button>
            <p className="jx-fine">Free to host. We only use your email to help you get set up.</p>
          </form>
        </div>
      </div>
    </section>
  )
}
