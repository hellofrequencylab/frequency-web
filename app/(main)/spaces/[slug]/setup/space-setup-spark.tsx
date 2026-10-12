'use client'

// ─────────────────────────────────────────────────────────────────────────────
// SPACE SETUP, the member seeding wizard (ADR-1733; docs/STUDIO.md §0). The walk a brand-new
// Business or Nonprofit Space takes its owner through right after `createSpace`, instead of
// dropping them on the Circles manager with an empty Space (owner ruling, 2026-10-12).
//
// Composed on the Spark kit (`SparkShell`, the in-shell twin of `WizardShell`: same progress cue,
// same Back / Continue vocabulary, correct chrome inside the app shell). The step ORDER is not
// written here: `spaceSetupSteps(SPACE_MANIFEST)` reads it off the Space manifest's sections
// (lib/spaces/setup.ts), so a section the manifest drops takes its step with it.
//
// EVERY STEP SAVES ON CONTINUE through the Space's EXISTING update actions, so leaving mid-way
// loses nothing and nothing is duplicated:
//   • story     → updateSpaceProfile (tagline, about) + setSpaceBusinessInfo (the story)
//   • identity  → updateSpaceProfile (brand name); the logo and the accent save the moment they
//                 resolve, exactly as the Identity & Branding form does (setSpaceImages, setSpaceAccent)
//   • contact   → setSpaceBusinessInfo (address, hours, phone, email, website, socials)
//   • offerings → setSpaceBusinessInfo (offerings)
// Each action re-gates on the server (canEditProfile); this surface is convenience over that gate.
//
// VERA drafts the prose the manifest marks `veraDrafts` (tagline, story) through the Space's own
// draft seam (app/(main)/spaces/copilot-actions.ts → lib/ai/space-copilot.ts). A draft fills the
// field for the member to edit; it is never saved until they continue, and the step never waits on
// it. No website research here: the URL door is the staff Business Seeder's and stays there.
//
// Autosave is OFF (`draftScopeKey={null}`): every step already saves to the Space, so a resumed
// local draft would only ever argue with the saved truth.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Loader2, Plus, Sparkles, Trash2, UsersRound } from 'lucide-react'
import { SparkShell } from '@/components/studio/spark'
import { Input, Label, Textarea } from '@/components/ui/field'
import { ImageUpload } from '@/components/ui/image-upload'
import { AccentPicker, TextField, TextareaField } from '@/components/spaces/space-form'
import { isError, type ActionResult } from '@/lib/action-result'
import { updateSpaceProfile } from '@/lib/spaces/profile-settings'
import { setSpaceAccent, setSpaceBusinessInfo, setSpaceImages, uploadSpaceImage } from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import { draftSpaceBioAction, suggestTaglineAction } from '@/app/(main)/spaces/copilot-actions'
import { SPACE_SOCIAL_PLATFORMS, type SpaceOffering, type SpaceSocialLink } from '@/lib/spaces/profile-data'
import { SPACE_MANIFEST } from '@/lib/studio/entities/space'
import { spaceSetupFinishHref, spaceSetupSteps, type SpaceSetupStep, type SpaceSetupStepKey } from '@/lib/spaces/setup'

/** The order, from the manifest. Computed once: the manifest is static data. */
const STEPS = spaceSetupSteps(SPACE_MANIFEST)

/** What the page read off the Space before the walk opened. Plain values across the RSC boundary. */
export interface SpaceSetupInitial {
  brandName: string
  tagline: string
  about: string
  story: string
  brandLogoUrl: string | null
  brandAccent: string
  address: string
  hours: string
  phone: string
  email: string
  website: string
  /** platform key → url, for the fixed social inputs. */
  socials: Record<string, string>
  offerings: SpaceOffering[]
}

/** An offering row on screen. The whole stored row rides along so the fields this step does not
 *  edit (length, deposit, visibility) survive the save untouched. */
type OfferingRow = { key: number; data: SpaceOffering; price: string }

export function SpaceSetupSpark({
  slug,
  spaceId,
  spaceName,
  initial,
}: {
  slug: string
  spaceId: string
  spaceName: string
  initial: SpaceSetupInitial
}) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // ── Story ──
  const [tagline, setTagline] = useState(initial.tagline)
  const [about, setAbout] = useState(initial.about)
  const [story, setStory] = useState(initial.story)
  const [veraBusy, startVera] = useTransition()
  const [veraNote, setVeraNote] = useState<string | null>(null)

  // ── Identity ──
  const [brandName, setBrandName] = useState(initial.brandName)
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.brandLogoUrl)
  const [accent, setAccent] = useState(initial.brandAccent)
  const [identityNote, setIdentityNote] = useState<string | null>(null)

  // ── Contact and links ──
  const [contact, setContact] = useState({
    address: initial.address,
    hours: initial.hours,
    phone: initial.phone,
    email: initial.email,
    website: initial.website,
  })
  const [socials, setSocials] = useState<Record<string, string>>(initial.socials)

  // ── Offerings ──
  const [rows, setRows] = useState<OfferingRow[]>(() =>
    initial.offerings.map((o, i) => ({ key: i, data: o, price: typeof o.price === 'number' ? String(o.price) : '' })),
  )
  const [nextKey, setNextKey] = useState(initial.offerings.length)

  const step: SpaceSetupStep = STEPS[index] ?? STEPS[0]!
  const total = STEPS.length
  const finishHref = spaceSetupFinishHref(slug)

  /** Run a step's save, then move on. A failed save stays on the step and says why. */
  const saveThen = (save: () => Promise<ActionResult[]>) => {
    setError(null)
    start(async () => {
      const results = await save()
      const failed = results.find((r) => r && isError(r))
      if (failed && isError(failed)) {
        setError(failed.error)
        return
      }
      setIndex((i) => Math.min(i + 1, total - 1))
    })
  }

  /** Vera drafts one field. Never blocks: a refusal shows as a quiet note, the field stays editable. */
  const draft = (action: () => Promise<ActionResult<string>>, apply: (text: string) => void) => {
    setVeraNote(null)
    startVera(async () => {
      const result = await action()
      if (isError(result)) {
        setVeraNote(result.error)
        return
      }
      apply(result.data)
    })
  }

  const back = index > 0 ? () => setIndex((i) => i - 1) : undefined
  const exits = [{ label: 'Skip setup for now', onSelect: () => router.push(finishHref) }]

  const saves: Record<Exclude<SpaceSetupStepKey, 'first-things'>, () => Promise<ActionResult[]>> = {
    story: () =>
      Promise.all([
        updateSpaceProfile(spaceId, { tagline: tagline.trim() || null, about: about.trim() || null }),
        setSpaceBusinessInfo(slug, { about: story.trim() }),
      ]),
    identity: () => Promise.all([updateSpaceProfile(spaceId, { brandName: brandName.trim() || null })]),
    contact: () => {
      const links: SpaceSocialLink[] = SPACE_SOCIAL_PLATFORMS.map((p) => ({ platform: p.key, url: (socials[p.key] ?? '').trim() })).filter(
        (s) => s.url,
      )
      return Promise.all([
        setSpaceBusinessInfo(slug, {
          address: contact.address.trim(),
          hours: contact.hours.trim(),
          phone: contact.phone.trim(),
          email: contact.email.trim(),
          website: contact.website.trim(),
          socials: links,
        }),
      ])
    },
    offerings: () => {
      const offerings: SpaceOffering[] = rows
        .filter((r) => r.data.title.trim())
        .map((r) => {
          const price = Number(r.price)
          const next: SpaceOffering = { ...r.data, title: r.data.title.trim() }
          // A blank blurb or price clears it; the rest of the row rides through untouched.
          delete next.blurb
          delete next.price
          if (r.data.blurb?.trim()) next.blurb = r.data.blurb.trim()
          if (r.price.trim() && Number.isFinite(price) && price >= 0) next.price = price
          return next
        })
      return Promise.all([setSpaceBusinessInfo(slug, { offerings })])
    },
  }

  const shell = (children: ReactNode, extra?: { nextLabel?: string; onNext?: () => void }) => (
    <SparkShell
      eyebrow={spaceName}
      title={step.title}
      description={step.desc}
      step={index + 1}
      totalSteps={total}
      stepLabel={stepLabel(step.key)}
      onBack={back}
      onNext={extra?.onNext ?? (() => saveThen(saves[step.key as keyof typeof saves]))}
      nextLabel={extra?.nextLabel ?? 'Save and continue'}
      busy={pending}
      error={error}
      exits={exits}
      draftScopeKey={null}
    >
      {children}
    </SparkShell>
  )

  // ── 1. Story ──
  if (step.key === 'story') {
    return shell(
      <div className="space-y-5">
        <TextField
          id="setup-tagline"
          label="Tagline"
          hint="One plain line that says what you do."
          value={tagline}
          onChange={setTagline}
          placeholder="Slow, breath-led yoga by the river."
          maxLength={200}
          action={<VeraButton busy={veraBusy} onClick={() => draft(() => suggestTaglineAction(spaceId), setTagline)} />}
        />
        <TextareaField
          id="setup-about"
          label="About"
          hint="A short intro. One or two sentences that greet a visitor."
          value={about}
          onChange={setAbout}
          placeholder="A calm studio by the river for slow, breath-led yoga."
          rows={3}
          maxLength={4000}
        />
        <TextareaField
          id="setup-story"
          label="Story"
          hint="The longer version. Who you are, how you started, who it is for, what to expect."
          value={story}
          onChange={setStory}
          placeholder="Tell people who you are and what they can expect."
          rows={6}
          maxLength={4000}
          action={<VeraButton busy={veraBusy} onClick={() => draft(() => draftSpaceBioAction(spaceId), setStory)} />}
        />
        <p className="text-meta text-subtle">
          Vera is AI. A draft writes a starting point into the field; edit it, then continue to save.
        </p>
        {veraNote && (
          <p className="rounded-card bg-warning-bg px-3 py-2 text-body-sm font-medium text-warning" role="status">
            {veraNote}
          </p>
        )}
      </div>,
    )
  }

  // ── 2. Identity ──
  if (step.key === 'identity') {
    const persist = (fn: () => Promise<ActionResult>) => {
      setIdentityNote(null)
      start(async () => {
        const result = await fn()
        if (isError(result)) setIdentityNote(result.error)
      })
    }
    return shell(
      <div className="space-y-6">
        <TextField
          id="setup-brand-name"
          label="Display name"
          hint="What people see across the network. Defaults to the name you gave the Space."
          value={brandName}
          onChange={setBrandName}
          placeholder={spaceName}
          maxLength={200}
        />
        <div className="w-[11rem]">
          <ImageUpload
            value={logoUrl}
            onChange={(v) => {
              setLogoUrl(v)
              if (v === null) persist(() => setSpaceImages(slug, { brandLogoUrl: '' }))
            }}
            onChangeAsset={(img) => {
              setLogoUrl(img.url)
              persist(() => setSpaceImages(slug, { brandLogoUrl: img.url, brandLogoAssetId: img.assetId }))
            }}
            label="Logo or profile image"
            hint="A square reads best. Saves the moment you pick it."
            folder="space-logos"
            scopeKey={spaceId}
            kinds={['image', 'icon']}
            noUrlPaste
            uploadFn={(file) => {
              const fd = new FormData()
              fd.append('file', file)
              return uploadSpaceImage(slug, 'logo', fd)
            }}
          />
        </div>
        <div className="space-y-2">
          <p className="text-meta font-medium text-muted" id="setup-accent-label">
            Brand color
          </p>
          <div role="group" aria-labelledby="setup-accent-label">
            <AccentPicker
              value={accent}
              disabled={pending}
              onChange={(v) => {
                setAccent(v)
                persist(() => setSpaceAccent(slug, v))
              }}
            />
          </div>
          <p className="text-meta text-subtle">Paints your buttons, the active tab, and highlights. Saves when picked.</p>
        </div>
        {identityNote && (
          <p className="rounded-card bg-warning-bg px-3 py-2 text-body-sm font-medium text-warning" role="status">
            {identityNote}
          </p>
        )}
      </div>,
    )
  }

  // ── 3. Contact and links ──
  if (step.key === 'contact') {
    const set = (key: keyof typeof contact) => (v: string) => setContact((c) => ({ ...c, [key]: v }))
    return shell(
      <div className="space-y-5">
        <TextField id="setup-address" label="Address" value={contact.address} onChange={set('address')} placeholder="Street, city" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="setup-phone" label="Phone" value={contact.phone} onChange={set('phone')} />
          <TextField id="setup-email" label="Email" value={contact.email} onChange={set('email')} />
        </div>
        <TextField id="setup-website" label="Website" value={contact.website} onChange={set('website')} placeholder="https://" />
        <TextareaField id="setup-hours" label="Hours" value={contact.hours} onChange={set('hours')} placeholder="Mon to Fri, 9 to 5" rows={2} maxLength={500} />
        <div>
          <p className="mb-1.5 block text-meta font-medium text-muted" id="setup-social-label">
            Social and business links
          </p>
          <div className="grid gap-3 sm:grid-cols-2" role="group" aria-labelledby="setup-social-label">
            {SPACE_SOCIAL_PLATFORMS.map((p) => (
              <div key={p.key}>
                <Label htmlFor={`setup-social-${p.key}`} className="mb-1 block text-2xs font-medium text-muted">
                  {p.label}
                </Label>
                <Input
                  id={`setup-social-${p.key}`}
                  value={socials[p.key] ?? ''}
                  onChange={(e) => setSocials((s) => ({ ...s, [p.key]: e.target.value }))}
                  placeholder="https://"
                />
              </div>
            ))}
          </div>
        </div>
      </div>,
    )
  }

  // ── 4. Offerings ──
  if (step.key === 'offerings') {
    const update = (key: number, patch: Partial<SpaceOffering> | { price: string }) =>
      setRows((list) =>
        list.map((r) => (r.key !== key ? r : 'price' in patch && typeof patch.price === 'string' ? { ...r, price: patch.price } : { ...r, data: { ...r.data, ...(patch as Partial<SpaceOffering>) } })),
      )
    const add = () => {
      setRows((list) => [...list, { key: nextKey, data: { title: '' }, price: '' }])
      setNextKey((k) => k + 1)
    }
    return shell(
      <div className="space-y-4">
        {rows.length === 0 && (
          <p className="rounded-card border border-border bg-surface-elevated px-4 py-3 text-body-sm text-muted">
            Nothing listed yet. Add one offering, or continue and add them later from your Space.
          </p>
        )}
        {rows.map((r, i) => (
          <fieldset key={r.key} className="space-y-3 rounded-card border border-border bg-surface p-4">
            <legend className="px-1 text-meta font-semibold text-muted">Offering {i + 1}</legend>
            <TextField id={`setup-offering-${r.key}-title`} label="Title" value={r.data.title} onChange={(v) => update(r.key, { title: v })} placeholder="60 minute session" maxLength={120} />
            <div>
              <Label htmlFor={`setup-offering-${r.key}-blurb`} className="mb-1 block font-semibold">
                Blurb
              </Label>
              <Textarea id={`setup-offering-${r.key}-blurb`} rows={2} maxLength={600} value={r.data.blurb ?? ''} onChange={(e) => update(r.key, { blurb: e.target.value })} placeholder="What it is and who it is for." />
            </div>
            <div className="flex items-end gap-3">
              <div className="w-40">
                <Label htmlFor={`setup-offering-${r.key}-price`} className="mb-1 block font-semibold">
                  Price
                </Label>
                <Input id={`setup-offering-${r.key}-price`} type="number" inputMode="decimal" min={0} step="0.01" value={r.price} onChange={(e) => update(r.key, { price: e.target.value })} placeholder="0" />
              </div>
              <button
                type="button"
                onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                className="inline-flex items-center gap-1 rounded-control px-2 py-2 text-meta font-semibold text-muted transition-colors hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
              </button>
            </div>
          </fieldset>
        ))}
        <button type="button" onClick={add} className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-primary-strong transition-colors hover:text-primary">
          <Plus className="h-4 w-4" aria-hidden /> Add an offering
        </button>
        <p className="text-meta text-subtle">Prices are in dollars. Length, deposits, and packages are set on each offering later.</p>
      </div>,
    )
  }

  // ── 5. First things: two doors, each skippable, then the finish on LIVE-261's landing ──
  return shell(
    <div className="space-y-3">
      <Door
        href="/circles/new"
        icon={<UsersRound className="h-5 w-5" aria-hidden />}
        title="Create your first Circle"
        hint="A few people doing something on purpose, on a rhythm. Vera helps you shape it."
      />
      <Door
        href={`/events/new?space=${encodeURIComponent(spaceId)}`}
        icon={<CalendarPlus className="h-5 w-5" aria-hidden />}
        title="Add your first Event"
        hint="Hosted by this Space. Tell Vera about it or drop in a flyer."
      />
      <p className="pt-1 text-meta text-subtle">Both are optional. Finishing takes you to your Circles, where everything you set up is waiting.</p>
    </div>,
    { nextLabel: 'Finish setup', onNext: () => router.push(finishHref) },
  )
}

function stepLabel(key: SpaceSetupStepKey): string {
  switch (key) {
    case 'story':
      return 'Story'
    case 'identity':
      return 'Identity'
    case 'contact':
      return 'Contact'
    case 'offerings':
      return 'Offerings'
    default:
      return 'First things'
  }
}

/** The "draft it" affordance beside a prose field. Mirrors the Identity & Branding form's button. */
function VeraButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1 text-meta font-semibold text-primary-strong transition-colors hover:text-primary disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
      Draft with Vera
    </button>
  )
}

/** One door on the First things step: a link into an existing create flow. */
function Door({ href, icon, title, hint }: { href: string; icon: ReactNode; title: string; hint: string }) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-elevated motion-reduce:transition-none"
    >
      <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
      <span className="min-w-0">
        <span className="block text-body-sm font-semibold text-text">{title}</span>
        <span className="mt-0.5 block text-meta text-muted">{hint}</span>
      </span>
    </Link>
  )
}
