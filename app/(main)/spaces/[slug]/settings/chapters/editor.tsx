'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { approveNetworkEvent, setCentralAdmin, setChapterLeader } from '@/lib/collective/network-tools-actions'
import type { ChaptersArea } from '@/lib/collective/network-tools-store'
import type { QueueCandidate } from '@/lib/collective/network-tools'
import { isError, type ActionResult } from '@/lib/action-result'

type Area = Omit<ChaptersArea, 'pending'> & { pending: (QueueCandidate & { when: string })[] }

export function ChaptersEditor({ parentId, isOwner, centralAdminLimit, area }: { parentId: string; isOwner: boolean; centralAdminLimit: number; area: Area }) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const run = (action: () => Promise<ActionResult>, done: string) => startTransition(async () => {
    try {
      const result = await action()
      setMessage(isError(result) ? result.error : done)
      if (!isError(result)) { setPicks({}); router.refresh() }
    } catch { setMessage('That did not save. Try again.') }
  })
  const pick = (key: string) => picks[key] ?? ''
  const choose = (key: string, value: string) => setPicks(prev => ({ ...prev, [key]: value }))
  const centralIds = new Set(area.centralAdmins.map(p => p.id))
  const people = (exclude: Set<string>) => area.people.filter(p => !exclude.has(p.id))

  return (
    <div className="space-y-10">
      <section aria-labelledby="chapters-queue" className="space-y-3">
        <h2 id="chapters-queue" className="text-body-lg font-bold text-text">Waiting for approval</h2>
        <p className="text-body-sm text-muted">A chapter event shows on your network calendar and home once you approve it. It stays on its own chapter page either way.</p>
        {area.pending.length ? (
          <ul className="space-y-3">{area.pending.map(event => (
            <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3">
              <div>
                <Link href={`/events/${event.slug}`} className="text-body-sm text-link">{event.title}</Link>
                <p className="text-meta text-muted">{event.chapterName} · {event.when}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={pending} onClick={() => run(() => approveNetworkEvent(parentId, event.chapterId, event.id, 'approved'), `${event.title} is on the network calendar.`)}>Approve</Button>
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => approveNetworkEvent(parentId, event.chapterId, event.id, 'declined'), `${event.title} stays on its chapter page only.`)}>Decline</Button>
              </div>
            </li>
          ))}</ul>
        ) : <p className="text-body-sm text-muted">Nothing is waiting. New chapter events land here.</p>}
      </section>

      <section aria-labelledby="chapters-leaders" className="space-y-3">
        <h2 id="chapters-leaders" className="text-body-lg font-bold text-text">Chapters and leaders</h2>
        <p className="text-body-sm text-muted">A leader runs one chapter. They see that chapter&apos;s admin and nothing else in your Network.</p>
        {area.chapters.length ? (
          <ul className="space-y-4">{area.chapters.map(chapter => {
            const leaderIds = new Set(chapter.leaders.map(l => l.id))
            const options = people(leaderIds)
            return (
              <li key={chapter.id} className="space-y-2 rounded-card border border-border bg-surface px-4 py-3">
                <Link href={`/spaces/${chapter.slug}`} className="text-body-sm font-bold text-link">{chapter.name}</Link>
                {chapter.leaders.length ? (
                  <ul className="space-y-1">{chapter.leaders.map(leader => (
                    <li key={leader.id} className="flex items-center justify-between gap-3">
                      <span className="text-body-sm text-text">{leader.name}</span>
                      <Button size="sm" variant="secondary" disabled={pending} aria-label={`Remove ${leader.name} as leader of ${chapter.name}`}
                        onClick={() => run(() => setChapterLeader(parentId, chapter.id, leader.id, false), `${leader.name} is now a member of ${chapter.name}.`)}>Remove</Button>
                    </li>
                  ))}</ul>
                ) : <p className="text-meta text-muted">No leader yet.</p>}
                {options.length > 0 && (
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-body-sm text-text" htmlFor={`leader-${chapter.id}`}>Add a leader
                      <Select id={`leader-${chapter.id}`} className="mt-1" value={pick(chapter.id)} disabled={pending} onChange={e => choose(chapter.id, e.target.value)}>
                        <option value="">Choose someone in your Network</option>
                        {options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </Select>
                    </label>
                    <Button size="sm" disabled={pending || !pick(chapter.id)} onClick={() => run(() => setChapterLeader(parentId, chapter.id, pick(chapter.id), true), `Leader added to ${chapter.name}.`)}>Add leader</Button>
                  </div>
                )}
              </li>
            )
          })}</ul>
        ) : <p className="text-body-sm text-muted">Add a chapter from your plan and billing page, then name its leader here.</p>}
      </section>

      <section aria-labelledby="chapters-central" className="space-y-3">
        <h2 id="chapters-central" className="text-body-lg font-bold text-text">Central admins</h2>
        <p className="text-body-sm text-muted">{area.centralAdmins.length} of {centralAdminLimit}. A central admin is an admin here and in every chapter, and can approve chapter events. Billing stays with you.</p>
        <ul className="space-y-1">{area.centralAdmins.map(admin => (
          <li key={admin.id} className="flex items-center justify-between gap-3">
            <span className="text-body-sm text-text">{admin.name}</span>
            {isOwner && <Button size="sm" variant="secondary" disabled={pending} aria-label={`Remove ${admin.name} as a central admin`}
              onClick={() => run(() => setCentralAdmin(parentId, admin.id, false), `${admin.name} is no longer a central admin.`)}>Remove</Button>}
          </li>
        ))}</ul>
        {isOwner && area.centralAdmins.length < centralAdminLimit && people(centralIds).length > 0 && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-body-sm text-text" htmlFor="central-admin">Add a central admin
              <Select id="central-admin" className="mt-1" value={pick('central')} disabled={pending} onChange={e => choose('central', e.target.value)}>
                <option value="">Choose someone in your Network</option>
                {people(centralIds).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </label>
            <Button size="sm" disabled={pending || !pick('central')} onClick={() => run(() => setCentralAdmin(parentId, pick('central'), true), 'Central admin added.')}>Add central admin</Button>
          </div>
        )}
        {!area.people.length && <p className="text-meta text-muted">Leaders and central admins come from the people in your Network. Invite them to this Space first.</p>}
      </section>
      {message && <p role="status" className="text-body-sm text-text">{message}</p>}
    </div>
  )
}
