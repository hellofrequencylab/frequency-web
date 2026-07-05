'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { Input, Label } from '@/components/ui/field'
import { isError, type ActionResult } from '@/lib/action-result'
import { TextField, TextareaField, VisibilityField, FormError } from '@/components/spaces/space-form'
import { updateSpaceProfile } from '@/lib/spaces/profile-settings'
import { setSpaceBusinessInfo } from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import { draftSpaceBioAction, suggestTaglineAction } from '@/app/(main)/spaces/copilot-actions'
import type { SpaceProfileData, SpaceSocialLink } from '@/lib/spaces/profile-data'

// THE SPACE BUSINESS INFO FORM (Space rail Section 1 — the profile+identity rework). The ONE place an
// operator edits every WORD about their space: name, tagline, About (short intro), Story (longer
// narrative), and the business/contact block (address, hours, phone, email, website, rating, socials),
// plus who can find it. It writes the two stores each field already lives in, on ONE Save:
//   • the profile COLUMNS (brand name, tagline, About, visibility) via updateSpaceProfile, and
//   • the central profileData BLOB (Story, address, hours, phone, email, website, rating, socials) via
//     setSpaceBusinessInfo — the single source every block that shows business details reads.
// Both actions re-gate server-side (canEditProfile), so this client is convenience, never the gate.
// Images + brand colour live in the BRANDING section (SpaceBrandingForm), so they are NOT here — every
// field has exactly one editor now. Copy runs CONTENT-VOICE: plain labels, no narrated feelings, no em
// dashes.

// The branded social platforms exposed as labeled URL inputs (website has its own field above). Order =
// display order; only non-empty links persist to socials[].
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

/** The profile-column values this form edits (the same bundle getSpaceBasicsData assembles). */
export interface BusinessIdentityValues {
  brandName: string
  /** The short About intro — the `spaces.about` COLUMN (band subtitle + About module). */
  about: string
  tagline: string
  visibility: 'network' | 'private'
}

export function SpaceBusinessInfoForm({
  spaceId,
  slug,
  identity,
  business,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  /** The profile-column identity fields (name / tagline / About / visibility). */
  identity: BusinessIdentityValues
  /** The central business blob (Story lives here as `about`, plus contact + socials). */
  business: SpaceProfileData
  readOnly?: boolean
}) {
  const router = useRouter()

  const [brandName, setBrandName] = useState(identity.brandName)
  const [tagline, setTagline] = useState(identity.tagline)
  const [about, setAbout] = useState(identity.about)
  const [visibility, setVisibility] = useState<'network' | 'private'>(identity.visibility)

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
    rating: business.rating ?? '',
    ratingCount: business.ratingCount ?? '',
    socials: socialMap,
  })
  const setBizField = (key: keyof typeof biz, value: string) => setBiz((f) => ({ ...f, [key]: value }))
  const setSocial = (key: string, value: string) =>
    setBiz((f) => ({ ...f, socials: { ...f.socials, [key]: value } }))

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startSave] = useTransition()

  // Vera draft state, per field (each button shows its own spinner + error).
  const [bioBusy, startBio] = useTransition()
  const [taglineBusy, startTagline] = useTransition()
  const [veraError, setVeraError] = useState<string | null>(null)
  function runDraft(
    action: () => Promise<ActionResult<string>>,
    apply: (text: string) => void,
    start: (cb: () => void) => void,
  ) {
    setVeraError(null)
    start(async () => {
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
      // Two writes, one Save: the profile columns + the central business blob. Both re-gate server-side.
      const [colResult, bizResult] = await Promise.all([
        updateSpaceProfile(spaceId, {
          brandName: brandName.trim() || null,
          about: about.trim() || null,
          tagline: tagline.trim() || null,
          visibility,
        }),
        setSpaceBusinessInfo(slug, {
          about: biz.story.trim(),
          address: biz.address.trim(),
          hours: biz.hours.trim(),
          phone: biz.phone.trim(),
          email: biz.email.trim(),
          website: biz.website.trim(),
          rating: biz.rating.trim(),
          ratingCount: biz.ratingCount.trim(),
          socials,
        }),
      ])
      if (isError(colResult)) return setError(colResult.error)
      if (isError(bizResult)) return setError(bizResult.error)
      setSaved(true)
      router.refresh()
    })
  }

  const veraButton = (onClick: () => void, busy: boolean, label: string) => (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || bioBusy || taglineBusy}
      className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong transition-colors hover:text-primary disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
      {label}
    </button>
  )

  return (
    <form
      className="space-y-8 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pending && !readOnly) save()
      }}
    >
      <fieldset disabled={readOnly} className="contents">
        {/* NAME + WORDS */}
        <section className="space-y-5">
          <SectionHeader title="Name & story" />
          <TextField
            id="brand-name"
            label="Brand name"
            hint="Shown in your space header."
            value={brandName}
            onChange={setBrandName}
            placeholder="River Yoga"
            maxLength={200}
          />
          <TextareaField
            id="tagline"
            label="Tagline"
            hint="One plain line that says what you do."
            value={tagline}
            onChange={setTagline}
            placeholder="Slow, breath-led yoga by the river."
            rows={2}
            maxLength={200}
            action={veraButton(
              () => runDraft(() => suggestTaglineAction(spaceId), setTagline, startTagline),
              taglineBusy,
              'Suggest with Vera',
            )}
          />
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
            action={veraButton(
              () => runDraft(() => draftSpaceBioAction(spaceId), (t) => setBizField('story', t), startBio),
              bioBusy,
              'Draft with Vera',
            )}
          />
          <p className="text-xs text-subtle">
            Vera is AI. The Draft and Suggest buttons write a starting point you review and edit; nothing
            is saved or published until you do.
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
          <div className="grid gap-4 sm:grid-cols-2">
            <BizInput id="biz-rating" label="Rating" value={biz.rating} onChange={(v) => setBizField('rating', v)} placeholder="4.8" />
            <BizInput id="biz-rating-count" label="Rating count" value={biz.ratingCount} onChange={(v) => setBizField('ratingCount', v)} placeholder="126 reviews" />
          </div>
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

        {/* VISIBILITY — who can find this space. */}
        <section className="space-y-3">
          <SectionHeader title="Visibility" />
          <VisibilityField value={visibility} onChange={setVisibility} />
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
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" aria-hidden /> Save changes
              </>
            )}
          </Button>
        )}
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-success" role="status">
            <Check className="h-4 w-4" aria-hidden /> Saved
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
