'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { Input, Label, labelClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { isError, type ActionResult } from '@/lib/action-result'
import { TextareaField, FormError } from '@/components/spaces/space-form'
import { updateSpaceProfile } from '@/lib/spaces/profile-settings'
import { setSpaceBusinessInfo } from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import { draftSpaceBioAction } from '@/app/(main)/spaces/copilot-actions'
import { SPACE_SOCIAL_PLATFORMS, type SpacePriceRange, type SpaceProfileData, type SpaceSocialLink } from '@/lib/spaces/profile-data'

// The relative price-indicator options for the profile's structured data (schema.org priceRange). Plain,
// no em dashes (CONTENT-VOICE §10). The blank value leaves it unset.
const PRICE_RANGE_OPTIONS: readonly { value: '' | SpacePriceRange; label: string }[] = [
  { value: '', label: 'Not set' },
  { value: '$', label: '$ Easy on the wallet' },
  { value: '$$', label: '$$ Mid-range' },
  { value: '$$$', label: '$$$ Premium' },
  { value: '$$$$', label: '$$$$ High-end' },
]
import { SPACE_KINDS, isSpaceKind, spaceKindLabel } from '@/lib/spaces/categories'
import { SUBJECTS, isSubjectKey } from '@/lib/taxonomy/subjects'

// THE INFO & CONNECT FORM (Space rail Section 2 — the standardized rail, ADR-535). The ONE place an
// operator writes the forward-facing marketing + connect content a Spotlight/profile shows: About (a short
// intro), Story (the longer narrative), the contact block (address, hours, phone, email, website), and the
// social/business links. Name + tagline live in Identity & Branding; ratings + visibility live in the lower
// Settings section, so neither is here. One Save writes the two stores each field lives in — the About
// COLUMN via updateSpaceProfile, and the profileData BLOB (Story + contact + socials) via setSpaceBusinessInfo
// (which MERGES, so the ratings owned by Settings are preserved). Copy runs CONTENT-VOICE: no em dashes.
//
// The branded social platforms are the ONE canonical, ordered list (SPACE_SOCIAL_PLATFORMS in
// lib/spaces/profile-data.ts), so the inputs here, the saved order, and every public render agree.

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
  // Subject + kind hold the RAW stored strings (ADR-879): an off-list value stays selected + marked
  // below, so saving any other field never silently relabels the Space.
  const [biz, setBiz] = useState({
    subject: business.subject ?? '',
    kind: business.kind ?? '',
    categoryLabel: business.categoryLabel ?? '',
    story: business.about ?? '',
    address: business.address ?? '',
    hours: business.hours ?? '',
    phone: business.phone ?? '',
    email: business.email ?? '',
    website: business.website ?? '',
    priceRange: business.priceRange ?? '',
    socials: socialMap,
  })
  const setBizField = (key: Exclude<keyof typeof biz, 'subject' | 'kind' | 'socials'>, value: string) =>
    setBiz((f) => ({ ...f, [key]: value }))
  const setSocial = (key: string, value: string) =>
    setBiz((f) => ({ ...f, socials: { ...f.socials, [key]: value } }))
  // Picking a subject or kind is a deliberate choice, so persist it right away (a select fires no blur
  // to autosave on — commit on the next frame with the updated value, mirroring the Vera-draft path).
  const pickListing = (key: 'subject' | 'kind', value: string) => {
    setBiz((f) => ({ ...f, [key]: value }))
    requestAnimationFrame(() => saveRef.current())
  }

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
      const socials: SpaceSocialLink[] = SPACE_SOCIAL_PLATFORMS.map((p) => ({
        platform: p.key,
        url: (biz.socials[p.key] ?? '').trim(),
      })).filter((s) => s.url)
      // The custom pill name only persists when it actually differs from the kind's own label — a blank
      // or "same as the kind" override drops out, so the pill cleanly falls back to the kind label.
      const pill = biz.categoryLabel.trim()
      const categoryLabel = pill && pill !== spaceKindLabel(biz.kind) ? pill : ''
      // Two writes, one Save: the About column + the central business blob (Story + contact + socials).
      // Ratings live in the Settings section; setSpaceBusinessInfo MERGES, so omitting them preserves them.
      const [colResult, bizResult] = await Promise.all([
        updateSpaceProfile(spaceId, { about: about.trim() || null }),
        setSpaceBusinessInfo(slug, {
          subject: biz.subject,
          kind: biz.kind,
          categoryLabel,
          about: biz.story.trim(),
          address: biz.address.trim(),
          hours: biz.hours.trim(),
          phone: biz.phone.trim(),
          email: biz.email.trim(),
          website: biz.website.trim(),
          priceRange: (biz.priceRange || undefined) as SpacePriceRange | undefined,
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
      className="space-y-8 rounded-card border border-border bg-surface p-5 lift-1 sm:p-6"
      onSubmit={(e) => e.preventDefault()}
      onBlur={onFieldBlur}
    >
      <fieldset disabled={readOnly} className="contents">
        {/* DIRECTORY LISTING — the two ADR-887 axes as selects (a browse facet, not the profile chip):
            SUBJECT (what you are about, the shared vocabulary the directory pills filter by) and KIND
            (what shape of thing you are, the card pill). Off-list stored values stay selectable and
            MARKED (ADR-879), so saving any other field never silently relabels the Space. */}
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-body-sm font-bold text-text [&::-webkit-details-marker]:hidden">
            Directory listing
            <ChevronDown className="h-4 w-4 shrink-0 text-subtle transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
          </summary>
          <div className="space-y-4 pt-3">
            <div>
              <Label htmlFor="biz-subject" className="mb-1 block font-semibold">
                Subject
              </Label>
              <Select
                id="biz-subject"
                value={biz.subject}
                onChange={(e) => pickListing('subject', e.target.value)}
                emptyLabel="Not set"
              >
                {biz.subject !== '' && !isSubjectKey(biz.subject) && (
                  <option value={biz.subject}>{biz.subject} (not a standard subject)</option>
                )}
                {SUBJECTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-meta text-subtle">
                What your Space is about. The directory filters by this, so pick the closest fit.
              </p>
            </div>

            <div>
              <Label htmlFor="biz-kind" className="mb-1 block font-semibold">
                Kind
              </Label>
              <Select
                id="biz-kind"
                value={biz.kind}
                onChange={(e) => pickListing('kind', e.target.value)}
                emptyLabel="Not set (shows as Business)"
              >
                {biz.kind !== '' && !isSpaceKind(biz.kind) && (
                  <option value={biz.kind}>{biz.kind} (not a standard kind)</option>
                )}
                {SPACE_KINDS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-meta text-subtle">
                The shape of what you run: a studio, a shop, one-on-one work. Shows on your directory card.
              </p>
            </div>

            {/* CUSTOM PILL NAME (optional) — override just the DISPLAYED name on the public kind pill
                while keeping the kind above for the directory. Blank falls back to the kind label. */}
            <div>
              <Label htmlFor="biz-category-label" className="mb-1 block font-semibold">
                Custom name (optional)
              </Label>
              <Input
                id="biz-category-label"
                value={biz.categoryLabel}
                maxLength={60}
                placeholder={spaceKindLabel(biz.kind)}
                onChange={(e) => setBiz((f) => ({ ...f, categoryLabel: e.target.value }))}
              />
              <p className="mt-1 text-meta text-subtle">
                Shown on your card in place of the kind name. Leave blank to use &ldquo;{spaceKindLabel(biz.kind)}&rdquo;.
              </p>
            </div>
          </div>
        </details>

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
                className="inline-flex items-center gap-1 text-meta font-semibold text-primary-strong transition-colors hover:text-primary disabled:opacity-50"
              >
                {bioBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
                Draft with Vera
              </button>
            }
          />
          <p className="text-meta text-subtle">
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
          {/* PRICE RANGE — a relative $ indicator (schema.org priceRange) for local SEO / answer engines. */}
          <div>
            <Label htmlFor="biz-price-range" className="mb-1 block font-semibold">
              Price range
            </Label>
            <Select
              id="biz-price-range"
              value={biz.priceRange}
              onChange={(e) => {
                setBiz((f) => ({ ...f, priceRange: e.target.value as '' | SpacePriceRange }))
                // A select fires no blur to autosave on, so commit on the next frame (matches the category picker).
                requestAnimationFrame(() => saveRef.current())
              }}
              options={PRICE_RANGE_OPTIONS}
            />
            <p className="mt-1 text-meta text-subtle">
              A rough guide to how pricey you are, shown to search engines. Leave it unset if it does not fit.
            </p>
          </div>
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
            {/* Names the set. Not a <Label>: it has no control of its own to point at, and
                every field below already carries its own htmlFor. */}
            <p className={`${labelClasses} mb-1.5 block font-semibold`} id="biz-social-label">
              Social and business links
            </p>
            <div className="grid gap-3 sm:grid-cols-2" role="group" aria-labelledby="biz-social-label">
              {SPACE_SOCIAL_PLATFORMS.map((p) => (
                <div key={p.key}>
                  <Label htmlFor={`biz-social-${p.key}`} className="mb-1 block text-2xs font-medium text-muted">
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
          <p className="rounded-card bg-warning-bg px-3 py-2 text-body-sm font-medium text-warning" role="status">
            {veraError}
          </p>
        )}
        {error && <FormError message={error} />}
      </fieldset>

      <div className="flex items-center gap-3 pt-1">
        {!readOnly && (
          <span className="inline-flex items-center gap-1.5 text-meta font-medium text-subtle" aria-live="polite">
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
