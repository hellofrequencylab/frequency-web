'use client'

import { useState, useTransition } from 'react'
import { Plus, Radio } from 'lucide-react'
import { CreateModal, cmInput, cmLabel } from '@/components/create-modal'
import { createTopicalChannel } from './actions'

// The seven launch categories. These match the icon set on the channels
// page so each new channel inherits the right look automatically.
const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'spirituality',     label: 'Spirituality' },
  { value: 'movement',         label: 'Movement' },
  { value: 'holistic-health',  label: 'Holistic Health' },
  { value: 'human-relating',   label: 'Human Relating' },
  { value: 'activism',         label: 'Activism' },
  { value: 'creative',         label: 'Creative' },
  { value: 'business-support', label: 'Business Support' },
]

type PillarOption = { id: string; name: string }

export function NewChannelCompose({ pillars = [] }: { pillars?: PillarOption[] }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0].value)
  const [domainId, setDomainId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || isPending) return
    setError(null)

    const fd = new FormData()
    fd.set('name', name.trim())
    fd.set('description', description.trim())
    fd.set('category', category)
    if (domainId) fd.set('domainId', domainId)

    startTransition(async () => {
      try {
        await createTopicalChannel(fd)
        setOpen(false)
        setName('')
        setDescription('')
      } catch (err) {
        // Next.js redirect throws a NEXT_REDIRECT signal that we must not
        // catch as an error. Anything else is a real error worth showing.
        if (err && typeof err === 'object' && 'digest' in err && String((err as { digest?: string }).digest).startsWith('NEXT_REDIRECT')) {
          throw err
        }
        setError(err instanceof Error ? err.message : 'Could not create the channel.')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors whitespace-nowrap"
      >
        <Plus className="w-4 h-4" />
        Create Channel
      </button>

      <CreateModal
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={submit}
        title="Create a Channel"
        titleIcon={Radio}
        titleIconColor="indigo"
        submitLabel="Create Channel"
        pendingLabel="Creating…"
        submitDisabled={!name.trim()}
        isPending={isPending}
        error={error}
      >
        <div className="px-6 py-5 space-y-5">
          <p className="text-sm text-muted leading-relaxed">
            Channels are global topics anyone can tune into, sorted under a
            Pillar. Pick a name, the Pillar it belongs to, a category, and a
            short description of what people will find inside.
          </p>

          <div>
            <label htmlFor="ch-name" className={cmLabel}>Name</label>
            <input
              id="ch-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Breathwork"
              maxLength={80}
              className={cmInput}
              required
            />
          </div>

          {pillars.length > 0 && (
            <div>
              <label htmlFor="ch-domain" className={cmLabel}>
                Pillar <span className="text-subtle font-normal">(optional)</span>
              </label>
              <select
                id="ch-domain"
                value={domainId}
                onChange={(e) => setDomainId(e.target.value)}
                className={cmInput}
              >
                <option value="">Unsorted (assign later)</option>
                {pillars.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <p className="mt-1 text-2xs text-subtle">
                The Pillar (Mind, Body, Spirit, Expression) this Channel sits under.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="ch-category" className={cmLabel}>Category</label>
            <select
              id="ch-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={cmInput}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <p className="mt-1 text-2xs text-subtle">
              The category sets the icon and where the channel sits in browse.
            </p>
          </div>

          <div>
            <label htmlFor="ch-description" className={cmLabel}>
              Description <span className="text-subtle font-normal">(optional)</span>
            </label>
            <textarea
              id="ch-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this channel about? Who is it for?"
              rows={3}
              maxLength={240}
              className={cmInput}
            />
          </div>
        </div>
      </CreateModal>
    </>
  )
}
