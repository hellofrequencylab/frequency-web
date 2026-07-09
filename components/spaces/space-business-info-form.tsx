'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { Input, Label } from '@/components/ui/field'
import { isError, type ActionResult } from '@/lib/action-result'
import { TextareaField, FormError } from '@/components/spaces/space-form'
import { updateSpaceProfile } from '@/lib/spaces/profile-settings'
import { setSpaceBusinessInfo } from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import { draftSpaceBioAction } from '@/app/(main)/spaces/copilot-actions'
import type { SpaceProfileData, SpaceSocialLink } from '@/lib/spaces/profile-data'

// THE INFO & CONNECT FORM (Space rail Section 2 — the standardized rail, ADR-535). The ONE place an
// operator writes the forward-facing marketing + connect content a Spotlight/profile shows: About (a short
// intro), Story (the longer narrative), the contact block (address, hours, phone, email, website), and the
// social/business links. Name + tagline live in Identity & Branding; ratings + visibility live in the lower
// Settings section, so neither is here. One Save writes the two stores each field lives in — the About
// COLUMN via updateSpaceProfile, and the profileData BLOB (Story + contact + socials) via setSpaceBusinessInfo
// (which MERGES, so the ratings owned by Settings are preserved). Copy runs CONTENT-VOICE: no em dashes.

// The branded social platforms exposed as labeled URL inputs (website has its own field above).
const SOCIAL_PLATFORMS: { key: string; label: string }[] = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'yelp', label: 'Yelp' },
  { key: 'google', label: 'Google' },
  { key: 'x', label: 'X' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'insighttimer', label: 'Insight Timer' },
  { key: 'spotify', label: 'Spotify' },
]

export function SpaceInfoConnectForm({
  spaceId,
  slug,
  about: initialAbout,
  business,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  /** The short About intro — the `spaces.about` COLUMN. */
  about: string
  /** The central business blob (Story lives here as `about`, plus contact + socials). */
  business: SpaceProfileData
  readOnly?: boolean
}) {
  const router = useRouter()

  const [about, setAbout] = useState(initialAbout)

  // The business blob. Socials become a key→url map for the fixed inputs; on save they fold back into the
  // socials[] the model stores.
  const socialMap: Record<string, string> = {}
  for (const s of business.socials ?? []) socialMap[s.platform] = s.url
  const [biz, setBiz] = useState({
    story: business.about ?? '',
    address: business.address ?? '',
    hours: business.hours ?? '',
    phone: business.phone ?? '',
    email: business.email ?? '',
    website: business.website ?? '',
    socials: socialMap,
  })
  const setBizField = (key: keyof typeof biz, value: string) => setBiz((f) => ({ ...f, [key]: value }))
  const setSocial = (key: string, value: string) =>
    setBiz((f) => ({ ...f, socials: { ...f.socials, [key]: value } }))

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startSave] = useTransition()

  const [bioBusy, startBio] = useTransition()
  const [veraError, setVeraError] = useState<string | null>(null)
  function runDraft(action: () => Promise<ActionResult<string>>, apply: (text: string) => void) {
    setVeraError(null)
    startBio(async () => {
      const result = await action()
      if (isError(result)) {
        setVeraError(result.error)
        return
      }
      apply(result.data)
    })
  }

  function save() {
    setError(null)
    setSaved(false)
    startSave(async () => {
      const socials: SpaceSocialLink[] = SOCIAL_PLATFORMS.map((p) => ({
        platform: p.key,
        url: (biz.socials[p.key] ?? '').trim(),
      })).filter((s) => s.url)
      // Two writes, one Save: the About column + the central business blob (Story + contact + socials).
      // Ratings live in the Settings section; setSpaceBusinessInfo MERGES, so omitting them preserves them.
      const [colResult, bizResult] = await Promise.all([
        updateSpaceProfile(spaceId, { about: about.trim() || null }),
        setSpaceBusinessInfo(slug, {
          about: biz.story.trim(),
          address: biz.address.trim(),
          hours: biz.hours.trim(),
          phone: biz.phone.trim(),
          email: biz.email.trim(),
          website: biz.website.trim(),
          socials,
        }),
      ])
      if (isError(colResult)) return setError(colResult.error)
      if (isError(bizResult)) return setError(bizResult.error)
      setSaved(true)
      router.refresh()
    })
  }

  // Item 2: autosave — no Save button. Keep the latest `save` in a ref (it closes over current field
  // state) and commit when a text field loses focus. A blur is a deliberate "done with this field" signal,
  // so it commits immediately (idempotent — the action writes the whole current form).
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  function onFieldBlur(e: React.FocusEvent<HTMLFormElement>) {
    if (readOnly) return
    const t = e.target
    if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) saveRef.current()
  }

  return (
    <form
      className="space-y-8 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"
      onSubmit={(e) => e.preventDefault()}
      onBlur={onFieldBlur}
    >
      <fieldset disabled={readOnly} className="contents">
        {/* ABOUT + STORY — the words a visitor reads. */}
        <section className="space-y-5">
          <SectionHeader title="About & story" />
          <TextareaField
            id="about"
            label="About"
            hint="A short intro. One or two sentences that greet a visitor."
            value={about}
            onChange={setAbout}
            placeholder="A calm studio by the river for slow, breath-led yoga."
            rows={3}
            maxLength={4000}
          />
          <TextareaField
            id="story"
            label="Story"
            hint="The longer version. Who you are, how you started, what to expect."
            value={biz.story}
            onChange={(v) => setBizField('story', v)}
            placeholder="Tell people who you are and what they can expect."
            rows={6}
            maxLength={4000}
            action={
              <button
                type="button"
                onClick={() =>
                  runDraft(() => draftSpaceBioAction(spaceId), (t) => {
                    setBizField('story', t)
                    // Persist the drafted story (a state change fires no blur to autosave on).
                    requestAnimationFrame(() => saveRef.current())
                  })
                }
                disabled={bioBusy}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong transition-colors hover:text-primary disabled:opacity-50"
              >
                {bioBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
                Draft with Vera
              </button>
            }
          />
          <p className="text-xs text-subtle">
            Vera is AI. The Draft button writes a starting point you review and edit; nothing is saved or
            published until you do.
          </p>
        </section>

        {/* CONTACT + LINKS — the central business block every surface reads. */}
        <section className="space-y-4">
          <SectionHeader title="Contact & links" />
          <BizInput id="biz-address" label="Address" value={biz.address} onChange={(v) => setBizField('address', v)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <BizInput id="biz-phone" label="Phone" value={biz.phone} onChange={(v) => setBizField('phone', v)} />
            <BizInput id="biz-email" label="Email" type="email" value={biz.email} onChange={(v) => setBizField('email', v)} />
          </div>
          <BizInput id="biz-website" label="Website" value={biz.website} onChange={(v) => setBizField('website', v)} placeholder="https://" />
          <TextareaField
            id="biz-hours"
            label="Hours"
            value={biz.hours}
            onChange={(v) => setBizField('hours', v)}
            placeholder="Mon to Fri, 9 to 5"
            rows={2}
            maxLength={500}
          />
          <div>
            <Label className="mb-1.5 block font-semibold">Social and business links</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {SOCIAL_PLATFORMS.map((p) => (
                <div key={p.key}>
                  <Label htmlFor={`biz-social-${p.key}`} className="mb-1 block text-2xs font-medium text-subtle">
                    {p.label}
                  </Label>
                  <Input
                    id={`biz-social-${p.key}`}
                    value={biz.socials[p.key] ?? ''}
                    onChange={(e) => setSocial(p.key, e.target.value)}
                    placeholder="https://"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {veraError && (
          <p className="rounded-lg bg-warning-bg px-3 py-2 text-sm font-medium text-warning" role="status">
            {veraError}
          </p>
        )}
        {error && <FormError message={error} />}
      </fieldset>

      <div className="flex items-center gap-3 pt-1">
        {!readOnly && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-subtle" aria-live="polite">
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving…
              </>
            ) : saved ? (
              <>
                <Check className="h-3.5 w-3.5 text-success" aria-hidden /> Saved
              </>
            ) : (
              'Changes save automatically.'
            )}
          </span>
        )}
        <Button type="button" variant="ghost" onClick={() => router.push(`/spaces/${slug}`)} disabled={pending}>
          View profile
        </Button>
      </div>
    </form>
  )
}

/** A compact labeled single-line input for the contact block (kit Input + Label). */
function BizInput({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1 block font-semibold">
        {label}
      </Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}
