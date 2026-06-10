'use client'

import { useState, useTransition } from 'react'
import { Plus, CircleDot, Sparkles } from 'lucide-react'
import { createCircle } from '@/app/(main)/admin/actions'
import { suggestCircle } from '@/app/(main)/circles/actions'
import { CreateModal, cmInput, cmLabel } from '@/components/create-modal'

interface HubOption { id: string; name: string }
interface InterestOption { id: string; name: string }

export function NewCircleCompose({
  hubs = [],
  interests = [],
  topicalChannelId,
  topicalChannelName,
  buttonLabel = 'New Circle',
  buttonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors whitespace-nowrap',
}: {
  hubs?: HubOption[]
  /** Interests (topical channels) to choose from when not already in a channel.
   *  Required for the member-driven "start your own circle" path. */
  interests?: InterestOption[]
  /** When set, the new circle declares this topical channel as its topic. */
  topicalChannelId?: string
  /** Optional channel name used in the modal copy so the framing reads
   *  like "Start a circle practicing Spirituality" instead of generic. */
  topicalChannelName?: string
  buttonLabel?: string
  buttonClass?: string
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [about, setAbout] = useState('')
  const [type, setType] = useState<'in-person' | 'online'>('in-person')
  const [memberCap, setMemberCap] = useState(50)
  const [hubId, setHubId] = useState('')
  const [interestId, setInterestId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Vera assist — suggest a name + about from the chosen Interest.
  const [suggesting, setSuggesting] = useState(false)
  const [veraFilled, setVeraFilled] = useState(false)

  const inChannel = !!topicalChannelId
  // Outside a channel, the member must pick an Interest (the topical channel the
  // circle practices). That also satisfies the bottom-up create rule server-side.
  const needsInterest = !inChannel && interests.length > 0

  // The practice Vera reasons about: the channel we're in, else the picked Interest.
  const interestName = inChannel
    ? (topicalChannelName ?? '')
    : (interests.find((i) => i.id === interestId)?.name ?? '')
  const canSuggest = interestName.trim().length > 0

  async function askVera() {
    if (!canSuggest || suggesting) return
    setSuggesting(true)
    try {
      const s = await suggestCircle(interestName, type)
      setName(s.name)
      setAbout(s.about)
      setVeraFilled(true)
    } catch {
      // Non-fatal — the host can always type their own.
    } finally {
      setSuggesting(false)
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || (needsInterest && !interestId) || isPending) return
    setError(null)

    const fd = new FormData()
    fd.set('name', name.trim())
    fd.set('about', about.trim())
    fd.set('type', type)
    fd.set('member_cap', String(memberCap))
    fd.set('status', 'forming')
    if (hubId) fd.set('hub_id', hubId)
    const channelId = topicalChannelId || interestId
    if (channelId) fd.set('topical_channel_id', channelId)

    startTransition(async () => {
      try {
        await createCircle(fd)
        setOpen(false)
        setName(''); setAbout(''); setHubId(''); setInterestId('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create circle.')
      }
    })
  }

  const modalTitle = inChannel && topicalChannelName
    ? `Start a circle practicing ${topicalChannelName}`
    : needsInterest
      ? 'Start a circle'
      : 'New Circle'

  return (
    <>
      <button onClick={() => setOpen(true)} className={buttonClass}>
        <Plus className="w-4 h-4" />
        {buttonLabel}
      </button>

      <CreateModal
        open={open} onClose={() => setOpen(false)} onSubmit={submit}
        title={modalTitle} titleIcon={CircleDot} titleIconColor="green"
        submitLabel="Create Circle" pendingLabel="Creating…"
        submitDisabled={!name.trim() || (needsInterest && !interestId)} isPending={isPending} error={error}
      >
        {inChannel && (
          <p className="text-sm text-muted leading-relaxed">
            A circle is your local crew, up to 50 people, who meet regularly
            around a shared practice. This one will be tagged as practicing
            {topicalChannelName ? <> <span className="font-semibold text-text">{topicalChannelName}</span></> : ' this channel'}
            , and you&apos;ll be the first host. No hub or nexus needed yet.
            Once a few neighbouring circles form, they crystallise into a hub
            together.
          </p>
        )}
        {needsInterest && (
          <p className="text-sm text-muted leading-relaxed">
            A circle is your local crew who meet regularly around one practice.
            Pick what it practices, give it a name, and you&apos;ll be its first
            host. No hub needed yet, that forms once a few circles cluster.
          </p>
        )}
        {needsInterest && (
          <div>
            <label className={cmLabel}>Channel *</label>
            <select value={interestId} onChange={e => setInterestId(e.target.value)}
              required disabled={isPending} className={cmInput}>
              <option value="">What does it practice?</option>
              {interests.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
        )}
        {/* Vera assist — once a practice is known, she'll draft a name + about. */}
        {canSuggest && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-signal/30 bg-signal-bg/40 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-signal-strong" />
              <p className="min-w-0 text-xs leading-snug text-muted">
                {veraFilled ? (
                  <><span className="font-semibold text-text">Vera</span> drafted these. Edit freely.</>
                ) : (
                  <>Stuck on a name? <span className="font-semibold text-text">Vera</span> can draft one, and an intro.</>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={askVera}
              disabled={suggesting || isPending}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-signal px-3 py-1.5 text-xs font-semibold text-on-signal shadow-sm transition-colors hover:bg-signal-strong disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {suggesting ? 'Thinking…' : veraFilled ? 'Again' : 'Suggest'}
            </button>
          </div>
        )}
        <div>
          <label className={cmLabel}>Circle name *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Encinitas Tuesday Ride" required disabled={isPending} className={cmInput} />
        </div>
        <div>
          <label className={cmLabel}>About <span className="text-subtle font-normal">(optional)</span></label>
          <textarea value={about} onChange={e => setAbout(e.target.value)}
            placeholder="What is this circle about?" rows={3} disabled={isPending}
            className={`${cmInput} resize-y leading-relaxed`} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={cmLabel}>Type</label>
            <select value={type} onChange={e => setType(e.target.value as 'in-person' | 'online')}
              disabled={isPending} className={cmInput}>
              <option value="in-person">In-person</option>
              <option value="online">Online</option>
            </select>
          </div>
          <div>
            <label className={cmLabel}>Member cap</label>
            <input type="number" min={5} max={200} value={memberCap}
              onChange={e => setMemberCap(parseInt(e.target.value) || 50)}
              disabled={isPending} className={cmInput} />
          </div>
        </div>
        {!inChannel && hubs.length > 0 && (
          <div>
            <label className={cmLabel}>Hub <span className="text-subtle font-normal">(optional)</span></label>
            <select value={hubId} onChange={e => setHubId(e.target.value)}
              disabled={isPending} className={cmInput}>
              <option value="">None</option>
              {hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
        )}
      </CreateModal>
    </>
  )
}
