'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { setSpaceBusinessInfo } from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import type { SpaceProfileData, SpaceSocialLink } from '@/lib/spaces/profile-data'

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
