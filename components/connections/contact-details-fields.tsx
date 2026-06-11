'use client'

// The flexible card-details rows (Phones, Emails, Addresses, Services,
// Certifications, Hours, Links, Other), shared by the Profile Creator form and
// the contact detail page so both edit surfaces stay identical.
//
// DetailsEditor renders each harvested section as an editable row list with
// add/remove plus an "Add a section" affordance for the missing ones. Rows the
// model marked confidence=low get a small "Check this" chip (warning tokens)
// that clears the moment the steward edits the row. DetailsView is the
// read-only rendering for the detail page (only sections with content).

import { Plus, X } from 'lucide-react'
import { hasAnyDetails } from '@/lib/connections/normalize'
import type {
  ContactDetails,
  ContactPhone,
  ContactEmail,
  ContactLink,
  ContactOtherDetail,
} from '@/lib/connections/types'

const input =
  'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder-subtle focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong/30'

type SectionKey = 'phones' | 'emails' | 'addresses' | 'services' | 'certifications' | 'hours' | 'links' | 'other'

const SECTION_LABELS: Record<SectionKey, string> = {
  phones: 'Phones',
  emails: 'Emails',
  addresses: 'Addresses',
  services: 'Services',
  certifications: 'Certifications',
  hours: 'Hours',
  links: 'Links',
  other: 'Other',
}

const SECTION_ORDER: SectionKey[] = [
  'phones', 'emails', 'addresses', 'services', 'certifications', 'hours', 'links', 'other',
]

function sectionPresent(d: ContactDetails, key: SectionKey): boolean {
  if (key === 'hours') return d.hours !== undefined
  const v = d[key]
  return Array.isArray(v) && v.length > 0
}

function CheckChip() {
  return (
    <span className="inline-flex shrink-0 items-center self-center rounded-md bg-warning-bg px-1.5 py-0.5 text-xs font-medium text-warning">
      Check this
    </span>
  )
}

function RemoveBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="shrink-0 self-center rounded-md p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  )
}

function AddRowBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium text-primary-strong hover:underline"
    >
      <Plus className="h-3 w-3" /> {children}
    </button>
  )
}

function SectionShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 block text-xs font-medium text-muted">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

// ── Editor ───────────────────────────────────────────────────────────────────

export function DetailsEditor({
  value,
  onChange,
}: {
  value: ContactDetails
  onChange: (d: ContactDetails) => void
}) {
  const d = value

  const set = (patch: Partial<ContactDetails>) => onChange({ ...d, ...patch })
  const dropSection = (key: SectionKey) => {
    const next = { ...d }
    delete next[key]
    onChange(next)
  }

  // List helpers: editing a row clears its low-confidence flag (it was checked).
  const editRow = <T extends { confidence?: 'high' | 'low' }>(
    rows: T[], i: number, patch: Partial<T>,
  ): T[] => rows.map((r, idx) => (idx === i ? { ...r, ...patch, confidence: undefined } : r))
  const dropRow = <T,>(rows: T[], i: number): T[] => rows.filter((_, idx) => idx !== i)

  const missing = SECTION_ORDER.filter((k) => !sectionPresent(d, k) && d[k] === undefined)

  return (
    <div className="space-y-4">
      {d.phones !== undefined && (
        <SectionShell label="Phones">
          {(d.phones ?? []).map((p, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={`${input} max-w-[7.5rem]`}
                value={p.label}
                onChange={(e) => set({ phones: editRow(d.phones!, i, { label: e.target.value }) })}
                placeholder="mobile"
                aria-label={`Phone ${i + 1} label`}
              />
              <input
                className={input}
                type="tel"
                value={p.number}
                onChange={(e) => set({ phones: editRow(d.phones!, i, { number: e.target.value }) })}
                placeholder="(555) 123-4567"
                aria-label={`Phone ${i + 1} number`}
              />
              {p.confidence === 'low' && <CheckChip />}
              <RemoveBtn label={`Remove phone ${i + 1}`} onClick={() => {
                const rows = dropRow(d.phones!, i)
                if (rows.length) set({ phones: rows })
                else dropSection('phones')
              }} />
            </div>
          ))}
          <AddRowBtn onClick={() => set({ phones: [...(d.phones ?? []), { label: '', number: '' } as ContactPhone] })}>
            Add phone
          </AddRowBtn>
        </SectionShell>
      )}

      {d.emails !== undefined && (
        <SectionShell label="Emails">
          {(d.emails ?? []).map((p, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={`${input} max-w-[7.5rem]`}
                value={p.label}
                onChange={(e) => set({ emails: editRow(d.emails!, i, { label: e.target.value }) })}
                placeholder="work"
                aria-label={`Email ${i + 1} label`}
              />
              <input
                className={input}
                type="email"
                value={p.address}
                onChange={(e) => set({ emails: editRow(d.emails!, i, { address: e.target.value }) })}
                placeholder="hello@studio.com"
                aria-label={`Email ${i + 1} address`}
              />
              {p.confidence === 'low' && <CheckChip />}
              <RemoveBtn label={`Remove email ${i + 1}`} onClick={() => {
                const rows = dropRow(d.emails!, i)
                if (rows.length) set({ emails: rows })
                else dropSection('emails')
              }} />
            </div>
          ))}
          <AddRowBtn onClick={() => set({ emails: [...(d.emails ?? []), { label: '', address: '' } as ContactEmail] })}>
            Add email
          </AddRowBtn>
        </SectionShell>
      )}

      {d.addresses !== undefined && (
        <StringListSection
          label="Addresses"
          rows={d.addresses ?? []}
          placeholder="123 Coast Hwy, Encinitas, CA"
          addLabel="Add address"
          onRows={(rows) => (rows.length ? set({ addresses: rows }) : dropSection('addresses'))}
          onAdd={() => set({ addresses: [...(d.addresses ?? []), ''] })}
        />
      )}

      {d.services !== undefined && (
        <StringListSection
          label="Services"
          rows={d.services ?? []}
          placeholder="sound baths"
          addLabel="Add service"
          onRows={(rows) => (rows.length ? set({ services: rows }) : dropSection('services'))}
          onAdd={() => set({ services: [...(d.services ?? []), ''] })}
        />
      )}

      {d.certifications !== undefined && (
        <StringListSection
          label="Certifications"
          rows={d.certifications ?? []}
          placeholder="RYT-500"
          addLabel="Add certification"
          onRows={(rows) => (rows.length ? set({ certifications: rows }) : dropSection('certifications'))}
          onAdd={() => set({ certifications: [...(d.certifications ?? []), ''] })}
        />
      )}

      {d.hours !== undefined && (
        <SectionShell label="Hours">
          <div className="flex gap-2">
            <input
              className={input}
              value={d.hours}
              onChange={(e) => set({ hours: e.target.value })}
              placeholder="Mon to Fri, 9 to 5"
              aria-label="Hours"
            />
            <RemoveBtn label="Remove hours" onClick={() => dropSection('hours')} />
          </div>
        </SectionShell>
      )}

      {d.links !== undefined && (
        <SectionShell label="Links">
          {(d.links ?? []).map((l, i) => (
            <div key={i} className="flex gap-2">
              <select
                className={`${input} max-w-[7.5rem]`}
                value={l.kind}
                onChange={(e) => set({ links: editRow(d.links!, i, { kind: e.target.value as ContactLink['kind'] }) })}
                aria-label={`Link ${i + 1} kind`}
              >
                <option value="website">Website</option>
                <option value="booking">Booking</option>
                <option value="portfolio">Portfolio</option>
                <option value="other">Other</option>
              </select>
              <input
                className={input}
                value={l.url}
                onChange={(e) => set({ links: editRow(d.links!, i, { url: e.target.value, label: e.target.value }) })}
                placeholder="studio.com/book"
                aria-label={`Link ${i + 1} URL`}
              />
              {l.confidence === 'low' && <CheckChip />}
              <RemoveBtn label={`Remove link ${i + 1}`} onClick={() => {
                const rows = dropRow(d.links!, i)
                if (rows.length) set({ links: rows })
                else dropSection('links')
              }} />
            </div>
          ))}
          <AddRowBtn onClick={() => set({ links: [...(d.links ?? []), { label: '', url: '', kind: 'website' } as ContactLink] })}>
            Add link
          </AddRowBtn>
        </SectionShell>
      )}

      {d.other !== undefined && (
        <SectionShell label="Other">
          {(d.other ?? []).map((o, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={`${input} max-w-[7.5rem]`}
                value={o.label}
                onChange={(e) => set({ other: editRow(d.other!, i, { label: e.target.value }) })}
                placeholder="tagline"
                aria-label={`Other ${i + 1} label`}
              />
              <input
                className={input}
                value={o.value}
                onChange={(e) => set({ other: editRow(d.other!, i, { value: e.target.value }) })}
                placeholder="Healing through sound"
                aria-label={`Other ${i + 1} value`}
              />
              {o.confidence === 'low' && <CheckChip />}
              <RemoveBtn label={`Remove row ${i + 1}`} onClick={() => {
                const rows = dropRow(d.other!, i)
                if (rows.length) set({ other: rows })
                else dropSection('other')
              }} />
            </div>
          ))}
          <AddRowBtn onClick={() => set({ other: [...(d.other ?? []), { label: '', value: '' } as ContactOtherDetail] })}>
            Add row
          </AddRowBtn>
        </SectionShell>
      )}

      {missing.length > 0 && (
        <div>
          <p className="mb-1 block text-xs font-medium text-muted">Add a section</p>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (key === 'hours') set({ hours: '' })
                  else if (key === 'phones') set({ phones: [{ label: '', number: '' }] })
                  else if (key === 'emails') set({ emails: [{ label: '', address: '' }] })
                  else if (key === 'links') set({ links: [{ label: '', url: '', kind: 'website' }] })
                  else if (key === 'other') set({ other: [{ label: '', value: '' }] })
                  else set({ [key]: [''] } as Partial<ContactDetails>)
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <Plus className="h-3 w-3" /> {SECTION_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StringListSection({
  label, rows, placeholder, addLabel, onRows, onAdd,
}: {
  label: string
  rows: string[]
  placeholder: string
  addLabel: string
  onRows: (rows: string[]) => void
  onAdd: () => void
}) {
  return (
    <SectionShell label={label}>
      {rows.map((v, i) => (
        <div key={i} className="flex gap-2">
          <input
            className={input}
            value={v}
            onChange={(e) => onRows(rows.map((r, idx) => (idx === i ? e.target.value : r)))}
            placeholder={placeholder}
            aria-label={`${label} ${i + 1}`}
          />
          <RemoveBtn label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onRows(rows.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <AddRowBtn onClick={onAdd}>{addLabel}</AddRowBtn>
    </SectionShell>
  )
}

// ── Read-only view (detail page) ─────────────────────────────────────────────

export function DetailsView({ details }: { details: ContactDetails }) {
  if (!hasAnyDetails(details)) return null
  return (
    <dl className="space-y-3 text-sm">
      {!!details.phones?.length && (
        <ViewSection label="Phones">
          {details.phones.map((p, i) => (
            <ViewRow key={i} label={p.label} flagged={p.confidence === 'low'}>
              <a href={`tel:${p.number}`} className="text-text hover:underline">{p.number}</a>
            </ViewRow>
          ))}
        </ViewSection>
      )}
      {!!details.emails?.length && (
        <ViewSection label="Emails">
          {details.emails.map((e, i) => (
            <ViewRow key={i} label={e.label} flagged={e.confidence === 'low'}>
              <a href={`mailto:${e.address}`} className="text-primary-strong hover:underline">{e.address}</a>
            </ViewRow>
          ))}
        </ViewSection>
      )}
      {!!details.addresses?.length && (
        <ViewSection label="Addresses">
          {details.addresses.map((a, i) => (
            <ViewRow key={i}><span className="text-text">{a}</span></ViewRow>
          ))}
        </ViewSection>
      )}
      {!!details.services?.length && (
        <ViewSection label="Services">
          <div className="flex flex-wrap gap-1.5">
            {details.services.map((s, i) => (
              <span key={i} className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium text-text">{s}</span>
            ))}
          </div>
        </ViewSection>
      )}
      {!!details.certifications?.length && (
        <ViewSection label="Certifications">
          <div className="flex flex-wrap gap-1.5">
            {details.certifications.map((c, i) => (
              <span key={i} className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium text-text">{c}</span>
            ))}
          </div>
        </ViewSection>
      )}
      {details.hours && (
        <ViewSection label="Hours">
          <ViewRow><span className="text-text">{details.hours}</span></ViewRow>
        </ViewSection>
      )}
      {!!details.links?.length && (
        <ViewSection label="Links">
          {details.links.map((l, i) => {
            const href = l.url.startsWith('http') ? l.url : `https://${l.url}`
            return (
              <ViewRow key={i} label={l.kind === 'other' ? l.label : l.kind} flagged={l.confidence === 'low'}>
                <a href={href} target="_blank" rel="noreferrer" className="truncate text-primary-strong hover:underline">
                  {l.url.replace(/^https?:\/\//, '')}
                </a>
              </ViewRow>
            )
          })}
        </ViewSection>
      )}
      {!!details.other?.length && (
        <ViewSection label="Other">
          {details.other.map((o, i) => (
            <ViewRow key={i} label={o.label} flagged={o.confidence === 'low'}>
              <span className="text-text">{o.value}</span>
            </ViewRow>
          ))}
        </ViewSection>
      )}
    </dl>
  )
}

function ViewSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-xs font-medium text-subtle">{label}</dt>
      <dd className="space-y-1">{children}</dd>
    </div>
  )
}

function ViewRow({ label, flagged, children }: { label?: string; flagged?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {label ? <span className="w-20 shrink-0 truncate text-xs capitalize text-subtle">{label}</span> : null}
      <span className="min-w-0 truncate">{children}</span>
      {flagged && <CheckChip />}
    </div>
  )
}
