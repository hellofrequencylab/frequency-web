'use client'

// "Tell us your story": the path the Stories page ends its empty grid with. The product has no story
// intake endpoint, so, like the Help contact band, Send opens the visitor's own mail app with the
// story addressed to the real contact address and its fields laid out. Nothing is submitted on their
// behalf and no endpoint is invented.
import { useState } from 'react'
import { Input, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'

const KINDS = ['I host a Circle', 'I run a Space', 'I found my people here'] as const

export function StoryForm({ email }: { email: string }) {
  const [kind, setKind] = useState<string>(KINDS[0])
  const [where, setWhere] = useState('')
  const [story, setStory] = useState('')
  return (
    <form
      className="hp-c"
      onSubmit={(e) => {
        e.preventDefault()
        const body = `${kind}${where ? `: ${where}` : ''}\n\n${story}`
        window.location.href = `mailto:${email}?subject=${encodeURIComponent('My Frequency story')}&body=${encodeURIComponent(body)}`
      }}
    >
      <label className="st-lab">
        Who you are
        <Select value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </Select>
      </label>
      <label className="st-lab">
        Your Circle or Space
        <Input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Its name, so readers can find it" />
      </label>
      <label className="st-lab">
        How it started
        <Textarea
          required
          rows={4}
          placeholder="The first night, who came, what changed."
          value={story}
          onChange={(e) => setStory(e.target.value)}
        />
      </label>
      <button className="btn fq-iri-btn" type="submit">
        Send your story
      </button>
      <small>
        Opens your email app, addressed to <a href={`mailto:${email}`}>{email}</a>. Add a photo from your room if
        you have one.
      </small>
    </form>
  )
}
