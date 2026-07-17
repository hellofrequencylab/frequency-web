'use client'

import Image from 'next/image'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Mail, Phone, MapPin, Globe, Lock, Pencil, Check, X, Plus, Trash2, Loader2, User, Sparkles, CalendarClock, History,
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { DetailTemplate } from '@/components/templates'
import { normalizeTag, hasAnyDetails } from '@/lib/connections/normalize'
import { DetailsEditor, DetailsView } from '@/components/connections/contact-details-fields'
import { UpsellTease } from '@/components/upsell/upsell-tease'
import { PromoteToContacts } from '@/components/connections/promote-to-contacts'
import { VisibilityControl } from '@/components/connections/visibility-control'
import type { TeaseGate } from '@/lib/pricing/upsell-tease'
import type { ContactDetail } from '@/lib/connections/store'
import { filterTimeline, type TimelineEntry } from '@/lib/crm/timeline'
import type { ContactDetails, ContactReminder, ContactStatus } from '@/lib/connections/types'
import {
  updateProfile, setStatus, deleteProfile, addNote, deleteNote, addTag, removeTag,
  addReminder, completeReminder, deleteReminder, briefContact,
} from '../actions'

const input = 'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder-subtle focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong/30'
const lbl = 'block text-xs font-medium text-muted mb-1'

function fmtDate(s: string | null): string {
  if (!s) return ''
  return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** A follow-up's due line (overdue / today / upcoming), since relativeTime only speaks past tense. */
function dueLabel(iso: string): string {
  const dayMs = 86_400_000
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
  const startDue = new Date(iso); startDue.setHours(0, 0, 0, 0)
  const days = Math.round((startDue.getTime() - startToday.getTime()) / dayMs)
  if (days < 0) return days === -1 ? 'Due yesterday' : `${-days} days overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days < 7) return `Due in ${days} days`
  return `Due ${fmtDate(iso)}`
}

function isOverdue(iso: string): boolean {
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
  return new Date(iso).getTime() < startToday.getTime()
}

export function Detail({
  initial,
  reminders = [],
  timeline,
  timelineEntries = [],
  back,
  crmTease,
}: {
  initial: ContactDetail
  reminders?: ContactReminder[]
  timeline?: React.ReactNode
  /** The unified CRM timeline (ADR-372): logged touches for this contact, newest first. */
  timelineEntries?: TimelineEntry[]
  /** Back-link rendered by the Detail shell above the identity band (the single back affordance). */
  back?: { href: string; label: string }
  /** Phase E upsell-tease gate (ADR-466), resolved server-side. Renders nothing while billing is OFF. */
  crmTease?: TeaseGate
}) {
  const router = useRouter()
  const { contact, notes, tags, avatarUrl, cardFrontUrl, cardBackUrl, logoUrl } = initial
  const [pending, start] = useTransition()
  const refresh = () => start(() => router.refresh())

  const [editing, setEditing] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [brief, setBrief] = useState<string | null>(null)
  const [briefBusy, setBriefBusy] = useState(false)
  const [briefError, setBriefError] = useState<string | null>(null)
  // The system/human toggle (ADR-372 Phase 1). On the member-facing personal card, automated events
  // are hidden by DEFAULT — this is your own history, so it leads with the touches you made, never
  // deleting the rest. Flip it on to see auto-captured messages, email opens, and system updates.
  const [showAutomated, setShowAutomated] = useState(false)
  const visibleTimeline = filterTimeline(timelineEntries, showAutomated)
  const hiddenTimelineCount = timelineEntries.length - visibleTimeline.length

  async function onBrief() {
    setBriefBusy(true)
    setBriefError(null)
    try {
      const res = await briefContact(contact.id)
      if (res.ok) setBrief(res.brief)
      else setBriefError(res.reason)
    } finally {
      setBriefBusy(false)
    }
  }

  const name = contact.displayName ?? 'Unnamed'
  const website = contact.website
    ? (contact.website.startsWith('http') ? contact.website : `https://${contact.website}`)
    : null

  function onAddNote() {
    const body = noteDraft.trim()
    if (!body) return
    setNoteDraft('')
    start(async () => { await addNote(contact.id, body); router.refresh() })
  }
  function onAddTag(raw: string) {
    const t = normalizeTag(raw)
    if (!t) return
    setTagDraft('')
    start(async () => { await addTag(contact.id, t); router.refresh() })
  }
  function onDelete() {
    if (!confirm(`Delete ${name}? This can’t be undone.`)) return
    start(async () => { await deleteProfile(contact.id); router.push('/connections') })
  }

  return (
    <DetailTemplate
      back={back}
      title={
        <span className="inline-flex items-center gap-3 align-middle">
          {avatarUrl ? (
            // Private `network-contacts` signed URL — skip the optimizer (see network/contacts page note).
            <Image src={avatarUrl} alt="" width={48} height={48} unoptimized className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-surface" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-base font-semibold text-muted">
              {contact.displayName ? getInitials(name) : <User className="h-6 w-6" />}
            </span>
          )}
          <span className="truncate">{name}</span>
        </span>
      }
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {(contact.title || contact.company) && (
            <span className="inline-flex items-center gap-1.5">
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-4 w-4 shrink-0 rounded-sm object-cover" />
              )}
              {[contact.title, contact.company].filter(Boolean).join(' · ')}
            </span>
          )}
          <span className="text-xs text-subtle">Added {fmtDate(contact.createdAt)}</span>
          {contact.lastContactedAt && (
            <span className="text-xs text-subtle">Last contacted {fmtDate(contact.lastContactedAt)}</span>
          )}
          {/* Make it unmistakable this is the viewer's OWN private contact entry, not the
              person's Frequency profile — Edit/Delete here only touch this private record. */}
          <span className="inline-flex w-full items-center gap-1.5 text-xs text-muted">
            <Lock className="h-3 w-3 shrink-0" />
            Your private contact. Editing or deleting this only changes your own note, never their Frequency profile.
          </span>
        </span>
      }
      badges={
        <span className="inline-flex items-center gap-1.5">
          <select
            value={contact.status}
            disabled={pending}
            onChange={(e) => start(async () => { await setStatus(contact.id, e.target.value as ContactStatus); router.refresh() })}
            className="rounded-lg border border-border-strong bg-surface px-2 py-1 text-xs text-text focus:outline-none"
            aria-label="Status"
          >
            <option value="new">New</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          {/* At-a-glance visibility; the actionable toggle + helper live in the Sharing section below. */}
          <span className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-2 py-1 text-xs font-medium text-muted">
            {contact.visibility === 'network' ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {contact.visibility === 'network' ? 'Network' : 'Private'}
          </span>
        </span>
      }
      actions={
        <>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-elevated"
          >
            {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {editing ? 'Close' : 'Edit'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger-bg"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </>
      }
    >
    <div className="space-y-5">
      {/* Phase E upsell tease (ADR-466): the contact is saved — the habit just paid off. Tease the CRM
          upgrade (follow-ups, pipeline, reminders across every contact). DORMANT until billing_live ON. */}
      {crmTease && (
        <UpsellTease
          target="contacts-crm"
          live={crmTease.live}
          locked={crmTease.locked}
          href="/upgrade"
          title="Keep every contact organized"
          body="Crew turns saved contacts into a pipeline: follow-up reminders, tags, and notes that stay with you across everyone you meet."
          cta="See what Crew adds"
        />
      )}

      {/* Frequency contacts — the consent-gated promotion into the shared marketing DB (ADR-742).
          Deliberate, never silent: a confirmation states exactly what happens, the lead is added at
          consent 'unknown' (never mailed until they confirm), and notes/tags never leave your book. */}
      <Section title="Frequency contacts">
        <PromoteToContacts
          contactId={contact.id}
          name={name}
          linkedContactId={contact.linkedContactId}
          email={contact.email}
        />
      </Section>

      {/* Sharing — the owner-only Private ↔ Network toggle (ADR-132/154). Helper text stays honest
          to canViewLead's network_local rule: Network exposes only the basic card to same-city stewards. */}
      <Section title="Sharing">
        <VisibilityControl contactId={contact.id} initial={contact.visibility} city={contact.city} />
      </Section>

      {/* Details — read or edit. A calm, divided panel rather than three heavy
          boxes: one soft surface, section labels, hairline dividers between. */}
      {editing ? (
        <EditForm contact={contact} onSaved={() => { setEditing(false); refresh() }} />
      ) : (
        <Section title="Details">
          <dl className="space-y-2 text-sm">
            {contact.email && <Row icon={Mail}><a href={`mailto:${contact.email}`} className="text-primary-strong hover:underline">{contact.email}</a></Row>}
            {contact.phone && <Row icon={Phone}><a href={`tel:${contact.phone}`} className="text-text hover:underline">{contact.phone}</a></Row>}
            {contact.city && <Row icon={MapPin}><span className="text-text">{contact.city}</span></Row>}
            {website && <Row icon={Globe}><a href={website} target="_blank" rel="noreferrer" className="text-primary-strong hover:underline">{contact.website!.replace(/^https?:\/\//, '')}</a></Row>}
            {contact.socials.instagram && <SocialRow label="Instagram" value={contact.socials.instagram} />}
            {contact.socials.linkedin && <SocialRow label="LinkedIn" value={contact.socials.linkedin} />}
            {contact.socials.x && <SocialRow label="X" value={contact.socials.x} />}
            {!contact.email && !contact.phone && !contact.city && !website &&
              !contact.socials.instagram && !contact.socials.linkedin && !contact.socials.x && (
                <p className="text-sm text-subtle">No contact details yet. Use Edit to add some.</p>
              )}
          </dl>
        </Section>
      )}

      {/* Everything harvested from the card (read-only; edit via Edit above). */}
      {!editing && hasAnyDetails(contact.details) && (
        <Section title="From the card">
          <DetailsView details={contact.details} />
        </Section>
      )}

      {/* The card itself, deskewed and kept on file. Tap a side to view it large. */}
      {(cardFrontUrl || cardBackUrl) && (
        <Section title="Card on file">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cardFrontUrl && <CardImage url={cardFrontUrl} label="Front" />}
            {cardBackUrl && <CardImage url={cardBackUrl} label="Back" />}
          </div>
        </Section>
      )}

      {/* Shared history — only when this capture is a linked member and resonance
          is enabled (the timeline node is built server-side in page.tsx). */}
      {timeline && <section className="rounded-2xl border border-border/70 bg-surface/60 p-5">{timeline}</section>}

      {/* Before you reach out — a short, grounded brief from Vera (metered, never auto-sends). */}
      <Section title="Before you reach out">
        {brief ? (
          <div className="space-y-2">
            <p className="whitespace-pre-wrap text-sm text-text">{brief}</p>
            <button
              type="button"
              onClick={onBrief}
              disabled={briefBusy}
              className="text-xs font-medium text-primary-strong hover:underline disabled:opacity-50"
            >
              {briefBusy ? 'Thinking…' : 'Refresh brief'}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-subtle">
              A quick brief from Vera before you reach out: who they are, your history, and a way in.
            </p>
            {briefError && <p className="text-xs text-danger">{briefError}</p>}
            <button
              type="button"
              onClick={onBrief}
              disabled={briefBusy}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
            >
              {briefBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {briefBusy ? 'Thinking…' : 'Prep brief'}
            </button>
          </div>
        )}
      </Section>

      {/* Follow up — set a reminder to reach out; open ones surface in the daily
          "Reach out" list on My Contacts. */}
      <Section title="Follow up">
        <FollowUp contactId={contact.id} reminders={reminders} />
      </Section>

      {/* Timeline — the unified history of logged touches (ADR-372). Notes keep their own
          section, so they are not repeated here; this is reach-outs and, as later phases land,
          email / sms / calls. Hidden until there is something to show. */}
      {timelineEntries.length > 0 && (
        <Section title="Timeline">
          <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-muted">
            <input
              type="checkbox"
              checked={showAutomated}
              onChange={(e) => setShowAutomated(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border-strong text-primary focus:ring-primary/40"
            />
            Show automated events
          </label>
          {visibleTimeline.length === 0 ? (
            <p className="text-sm text-subtle">
              Only automated events so far. Turn on &ldquo;Show automated events&rdquo; to see them.
            </p>
          ) : (
            <ul className="space-y-3">
              {visibleTimeline.map((e) => (
                <li key={e.id} className="flex items-start gap-2">
                  <History className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text">{e.title}</p>
                    {e.detail && <p className="whitespace-pre-wrap text-xs text-muted">{e.detail}</p>}
                    <p className="text-xs text-subtle">{fmtDate(e.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!showAutomated && hiddenTimelineCount > 0 && visibleTimeline.length > 0 && (
            <p className="mt-3 text-xs text-subtle">
              {hiddenTimelineCount} automated {hiddenTimelineCount === 1 ? 'event is' : 'events are'} hidden.
            </p>
          )}
        </Section>
      )}

      {/* Tags */}
      <Section title="Tags">
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-primary-bg px-2 py-0.5 text-xs font-medium text-primary-strong">
              {t.source === 'ai' && <Sparkles className="h-3 w-3" />}
              {t.tag}
              <button type="button" disabled={pending} onClick={() => start(async () => { await removeTag(contact.id, t.id); router.refresh() })} aria-label={`Remove ${t.tag}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); onAddTag(tagDraft) } }}
            placeholder={tags.length ? 'Add…' : 'Add a tag…'}
            className="min-w-[7rem] flex-1 rounded-lg border border-transparent bg-surface-elevated px-2 py-1 text-sm text-text placeholder-subtle focus:border-border-strong focus:outline-none"
          />
        </div>
      </Section>

      {/* Notes */}
      <Section title="Notes">
        <div className="flex gap-2">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={2}
            placeholder="Add a note…"
            className={`${input} resize-none`}
          />
          <button
            type="button"
            onClick={onAddNote}
            disabled={pending || !noteDraft.trim()}
            className="inline-flex h-fit items-center gap-1 self-end rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </button>
        </div>

        <ul className="mt-4 space-y-3">
          {notes.length === 0 && <li className="text-sm text-subtle">No notes yet.</li>}
          {notes.map((n) => (
            <li key={n.id} className="group rounded-xl bg-surface-elevated/50 p-3">
              <div className="mb-1 flex items-center gap-2 text-xs text-subtle">
                {n.kind === 'connection' && <span className="rounded bg-primary-bg px-1.5 py-0.5 font-medium text-primary-strong">Connection</span>}
                {n.kind === 'ai' && <span className="inline-flex items-center gap-1 rounded bg-surface-elevated px-1.5 py-0.5 font-medium text-muted"><Sparkles className="h-3 w-3" /> Vera</span>}
                <span>{fmtDate(n.createdAt)}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(async () => { await deleteNote(contact.id, n.id); router.refresh() })}
                  className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Delete note"
                >
                  <Trash2 className="h-3.5 w-3.5 text-subtle hover:text-danger" />
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm text-text">{n.body}</p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
    </DetailTemplate>
  )
}

/** Follow-up reminders for one contact: the open list + a date/note add row.
 *  Completing or deleting refreshes the page (and the My Contacts reach-out list). */
function FollowUp({ contactId, reminders }: { contactId: string; reminders: ContactReminder[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')

  function onAdd() {
    if (!due) return
    // A date input gives YYYY-MM-DD (local midnight); send it as a day-precise due.
    const iso = new Date(`${due}T09:00`).toISOString()
    setDue(''); setNote('')
    start(async () => { await addReminder(contactId, iso, note.trim() || undefined); router.refresh() })
  }

  return (
    <div>
      <ul className="space-y-2">
        {reminders.length === 0 && <li className="text-sm text-subtle">No follow-ups yet.</li>}
        {reminders.map((r) => (
          <li key={r.id} className="group flex items-center gap-2 rounded-xl bg-surface-elevated/50 p-3">
            <CalendarClock className="h-4 w-4 shrink-0 text-subtle" />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${isOverdue(r.dueAt) ? 'text-danger' : 'text-text'}`}>
                {dueLabel(r.dueAt)}
              </p>
              {r.note && <p className="truncate text-xs text-muted">{r.note}</p>}
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => { await completeReminder(r.id, contactId); router.refresh() })}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> Done
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => { await deleteReminder(r.id, contactId); router.refresh() })}
              className="opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Delete follow-up"
            >
              <Trash2 className="h-3.5 w-3.5 text-subtle hover:text-danger" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className={lbl}>Remind me on</span>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className={`${input} w-auto`}
          />
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What to follow up on… (optional)"
          className={`${input} min-w-[10rem] flex-1`}
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={pending || !due}
          className="inline-flex h-fit items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
        </button>
      </div>
    </div>
  )
}

// A calm titled section — soft surface, light label, no heavy shadow. Replaces
// the three identical bordered+shadowed boxes the detail used to stack.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-surface/60 p-5">
      <h2 className="mb-3 text-sm font-semibold tracking-tight text-text">{title}</h2>
      {children}
    </section>
  )
}

/** One kept card side; opens the full-size signed image in a new tab. */
function CardImage({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group relative block overflow-hidden rounded-xl border border-border bg-surface-elevated"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`${label} of the card`} className="w-full object-contain" />
      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-xs font-medium text-white">
        {label}
      </span>
    </a>
  )
}

function Row({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-subtle" />
      <span className="truncate">{children}</span>
    </div>
  )
}

function SocialRow({ label, value }: { label: string; value: string }) {
  const href = value.startsWith('http') ? value : null
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-subtle">{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="truncate text-primary-strong hover:underline">{value}</a>
      ) : (
        <span className="truncate text-text">{value}</span>
      )}
    </div>
  )
}

function EditForm({ contact, onSaved }: { contact: ContactDetail['contact']; onSaved: () => void }) {
  const [, start] = useTransition()
  const [saving, setSaving] = useState(false)
  const [f, setF] = useState({
    displayName: contact.displayName ?? '',
    title: contact.title ?? '',
    company: contact.company ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    city: contact.city ?? '',
    website: contact.website ?? '',
    instagram: contact.socials.instagram ?? '',
    linkedin: contact.socials.linkedin ?? '',
    x: contact.socials.x ?? '',
  })
  const [details, setDetails] = useState<ContactDetails>(contact.details ?? {})
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  function save() {
    setSaving(true)
    start(async () => {
      await updateProfile(contact.id, {
        displayName: f.displayName,
        title: f.title,
        company: f.company,
        email: f.email,
        phone: f.phone,
        city: f.city,
        website: f.website,
        socials: {
          ...(f.instagram.trim() ? { instagram: f.instagram.trim() } : {}),
          ...(f.linkedin.trim() ? { linkedin: f.linkedin.trim() } : {}),
          ...(f.x.trim() ? { x: f.x.trim() } : {}),
        },
        details,
      })
      setSaving(false)
      onSaved()
    })
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-surface/60 p-5">
      <h2 className="mb-3 text-sm font-semibold tracking-tight text-text">Edit details</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name" full><input className={input} value={f.displayName} onChange={(e) => set('displayName', e.target.value)} /></Field>
        <Field label="Title"><input className={input} value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Company"><input className={input} value={f.company} onChange={(e) => set('company', e.target.value)} /></Field>
        <Field label="Email"><input className={input} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Phone"><input className={input} type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="City"><input className={input} value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="Website"><input className={input} value={f.website} onChange={(e) => set('website', e.target.value)} /></Field>
        <Field label="Instagram"><input className={input} value={f.instagram} onChange={(e) => set('instagram', e.target.value)} /></Field>
        <Field label="LinkedIn"><input className={input} value={f.linkedin} onChange={(e) => set('linkedin', e.target.value)} /></Field>
        <Field label="X"><input className={input} value={f.x} onChange={(e) => set('x', e.target.value)} /></Field>
      </div>
      <div className="mt-4 border-t border-border/70 pt-4">
        <p className="mb-3 text-xs font-medium text-muted">From the card</p>
        <DetailsEditor value={details} onChange={setDetails} />
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {saving ? 'Saving…' : 'Save'}
      </button>
    </section>
  )
}

function Field({ label, full = false, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className={lbl}>{label}</label>
      {children}
    </div>
  )
}
