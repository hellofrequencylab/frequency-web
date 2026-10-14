'use client'

// The Vision page's partner interest form (website-strategy.md: "partner interest form"). There is no
// partner intake endpoint, so, like Help's "Write to us", Send opens the visitor's own mail app with the
// note addressed to the real contact address. Nothing is submitted on their behalf.
import { useState } from 'react'
import { Input, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'

const WHO = ['A partner', 'An investor', 'A civic leader', 'Press', 'A building owner'] as const

export function PartnerForm({ email }: { email: string }) {
  const [who, setWho] = useState<string>(WHO[0])
  const [town, setTown] = useState('')
  const [note, setNote] = useState('')
  return (
    <form
      className="hp-c"
      onSubmit={(e) => {
        e.preventDefault()
        const body = `${who}${town ? `, ${town}` : ''}\n\n${note}`
        window.location.href = `mailto:${email}?subject=${encodeURIComponent('Frequency third spaces')}&body=${encodeURIComponent(body)}`
      }}
    >
      <label className="st-lab">
        I am
        <Select value={who} onChange={(e) => setWho(e.target.value)}>
          {WHO.map((w) => (
            <option key={w}>{w}</option>
          ))}
        </Select>
      </label>
      <label className="st-lab">
        Your town or building
        <Input value={town} onChange={(e) => setTown(e.target.value)} placeholder="Where it is" />
      </label>
      <label className="st-lab">
        What you have in mind
        <Textarea required rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button className="btn fq-iri-btn" type="submit">
        Send
      </button>
      <small>
        Opens your email app, addressed to <a href={`mailto:${email}`}>{email}</a>.
      </small>
    </form>
  )
}
