'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Plus, Trash2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { setSpaceBusinessInfo } from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import type { SpaceProfileData, SpaceSocialLink, SpaceOffering } from '@/lib/spaces/profile-data'

// THE BUSINESS INFO FORM — the ONE place an operator edits their Space's central business data
// (owner directive: "change the business address and it changes everywhere"). It writes
// preferences.profileData through setSpaceBusinessInfo (re-gated server-side); every authored block
// reads that same record off the shared metadata seam, so one save updates the Contact card, the
// Business strip, the About story, and any other surface at once. Minimal + plain: labeled fields, no
// Puck. DAWN tokens only, sentence-case copy, no em dashes (CONTENT-VOICE).

// The branded social platforms the form exposes as labeled URL inputs (website lives in its own
// Contact field above). Order = display order; only non-empty ones persist to socials[].
const SOCIAL_PLATFORMS: { key: string; label: string }[] = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'yelp', label: 'Yelp' },
  { key: 'google', label: 'Google' },
  { key: 'x', label: 'X' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'tiktok', label: 'TikTok' },
]

const inputClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'
const labelClass = 'mb-1 block text-xs font-semibold text-text'

export function SpaceBusinessForm({
  slug,
  initial,
  readOnly = false,
}: {
  slug: string
  initial: SpaceProfileData
  readOnly?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  // One flat form state, seeded from the central data. Socials become a key→url map for the fixed
  // inputs; on save they fold back into the socials[] the model stores.
  const socialMap: Record<string, string> = {}
  for (const s of initial.socials ?? []) socialMap[s.platform] = s.url
  const [form, setForm] = useState({
    about: initial.about ?? '',
    address: initial.address ?? '',
    hours: initial.hours ?? '',
    phone: initial.phone ?? '',
    email: initial.email ?? '',
    website: initial.website ?? '',
    rating: initial.rating ?? '',
    ratingCount: initial.ratingCount ?? '',
    socials: socialMap,
  })
  // The services catalog is edited as add/remove rows (its own state so a row edit never re-seeds).
  const [offerings, setOfferings] = useState<SpaceOffering[]>(
    (initial.offerings ?? []).map((o) => ({ title: o.title, blurb: o.blurb ?? '' })),
  )
  const setOffering = (i: number, key: 'title' | 'blurb', value: string) => {
    setStatus('idle')
    setOfferings((rows) => rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)))
  }
  const addOffering = () => {
    setStatus('idle')
    setOfferings((rows) => [...rows, { title: '', blurb: '' }])
  }
  const removeOffering = (i: number) => {
    setStatus('idle')
    setOfferings((rows) => rows.filter((_, j) => j !== i))
  }

  const set = (key: keyof typeof form, value: string) => {
    setStatus('idle')
    setForm((f) => ({ ...f, [key]: value }))
  }
  const setSocial = (key: string, value: string) => {
    setStatus('idle')
    setForm((f) => ({ ...f, socials: { ...f.socials, [key]: value } }))
  }

  function save() {
    if (pending || readOnly) return
    const socials: SpaceSocialLink[] = SOCIAL_PLATFORMS.map((p) => ({
      platform: p.key,
      url: (form.socials[p.key] ?? '').trim(),
    })).filter((s) => s.url)
    const cleanedOfferings: SpaceOffering[] = offerings
      .map((o) => ({ title: o.title.trim(), blurb: (o.blurb ?? '').trim() }))
      .filter((o) => o.title)
    start(async () => {
      const result = await setSpaceBusinessInfo(slug, {
        about: form.about.trim(),
        address: form.address.trim(),
        hours: form.hours.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        website: form.website.trim(),
        rating: form.rating.trim(),
        ratingCount: form.ratingCount.trim(),
        socials,
        offerings: cleanedOfferings,
      })
      if (isError(result)) {
        setStatus('error')
        return
      }
      setStatus('saved')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Edit your business details in one place. They show on every block that displays them, so a
        change here updates your whole profile at once.
      </p>

      <div>
        <label className={labelClass} htmlFor="biz-about">Story</label>
        <textarea
          id="biz-about"
          rows={4}
          value={form.about}
          onChange={(e) => set('about', e.target.value)}
          disabled={readOnly}
          placeholder="Tell people who you are and what to expect."
          className={inputClass}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="biz-address">Address</label>
          <input id="biz-address" value={form.address} onChange={(e) => set('address', e.target.value)} disabled={readOnly} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="biz-hours">Hours</label>
          <textarea id="biz-hours" rows={2} value={form.hours} onChange={(e) => set('hours', e.target.value)} disabled={readOnly} placeholder="Mon to Fri, 9 to 5" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="biz-phone">Phone</label>
          <input id="biz-phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} disabled={readOnly} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="biz-email">Email</label>
          <input id="biz-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} disabled={readOnly} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="biz-website">Website</label>
          <input id="biz-website" value={form.website} onChange={(e) => set('website', e.target.value)} disabled={readOnly} placeholder="https://" className={inputClass} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="biz-rating">Rating</label>
          <input id="biz-rating" value={form.rating} onChange={(e) => set('rating', e.target.value)} disabled={readOnly} placeholder="4.8" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="biz-rating-count">Rating count</label>
          <input id="biz-rating-count" value={form.ratingCount} onChange={(e) => set('ratingCount', e.target.value)} disabled={readOnly} placeholder="126 reviews" className={inputClass} />
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className={labelClass + ' mb-0'}>Services</p>
          {!readOnly && (
            <button
              type="button"
              onClick={addOffering}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add
            </button>
          )}
        </div>
        <p className="mb-2 text-2xs text-subtle">The things you offer. These fill your Offerings grid.</p>
        {offerings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface/60 px-3 py-4 text-center text-2xs text-subtle">
            No services yet. Add one to fill your Offerings grid.
          </p>
        ) : (
          <ul className="space-y-3">
            {offerings.map((o, i) => (
              <li key={i} className="rounded-lg border border-border bg-surface/60 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    aria-label={`Service ${i + 1} title`}
                    value={o.title}
                    onChange={(e) => setOffering(i, 'title', e.target.value)}
                    disabled={readOnly}
                    placeholder="Service name"
                    className={inputClass}
                  />
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removeOffering(i)}
                      aria-label={`Remove service ${i + 1}`}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-bg hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>
                <textarea
                  aria-label={`Service ${i + 1} description`}
                  rows={2}
                  value={o.blurb ?? ''}
                  onChange={(e) => setOffering(i, 'blurb', e.target.value)}
                  disabled={readOnly}
                  placeholder="Short description (optional)"
                  className={inputClass}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className={labelClass}>Social and business links</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SOCIAL_PLATFORMS.map((p) => (
            <div key={p.key}>
              <label className="mb-1 block text-2xs font-medium text-subtle" htmlFor={`biz-social-${p.key}`}>
                {p.label}
              </label>
              <input
                id={`biz-social-${p.key}`}
                value={form.socials[p.key] ?? ''}
                onChange={(e) => setSocial(p.key, e.target.value)}
                disabled={readOnly}
                placeholder="https://"
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </div>

      {!readOnly && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-70"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : status === 'saved' ? <Check className="h-4 w-4" aria-hidden /> : null}
            {pending ? 'Saving' : status === 'saved' ? 'Saved' : 'Save business info'}
          </button>
          {status === 'error' && <span className="text-sm font-medium text-danger">Could not save. Try again.</span>}
        </div>
      )}
    </div>
  )
}
