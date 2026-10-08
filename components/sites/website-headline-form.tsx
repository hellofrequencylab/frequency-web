'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import {
  MAX_SITE_HERO_BUTTON,
  MAX_SITE_HERO_EYEBROW,
  MAX_SITE_HERO_HEADING,
  MAX_SITE_HERO_TAGLINE,
  type SiteHero,
} from '@/lib/spaces/website'
import { setSiteHero } from '@/app/(main)/spaces/[slug]/manage/layout/actions'

// The website hero's own words (LIVE-832, LIVE-865), on the Profile & Settings Website card. The Space page
// header keeps the Hero settings (the Space's name and a short line); these fields set what the website
// leads with instead: an eyebrow, the headline, the intro and up to two buttons. Blank falls back to the
// Hero settings and the header button. The server action re-gates the editor role and sanitizes; this
// client is feedback only.

type Draft = {
  eyebrow: string
  heading: string
  tagline: string
  actionLabel: string
  actionHref: string
  secondaryLabel: string
  secondaryHref: string
}

function draftOf(h: SiteHero): Draft {
  return {
    eyebrow: h.eyebrow ?? '',
    heading: h.heading ?? '',
    tagline: h.tagline ?? '',
    actionLabel: h.action?.label ?? '',
    actionHref: h.action?.href ?? '',
    secondaryLabel: h.secondary?.label ?? '',
    secondaryHref: h.secondary?.href ?? '',
  }
}

export function WebsiteHeadlineForm({ slug, initial }: { slug: string; initial: SiteHero }) {
  const router = useRouter()
  const [saved0, setSaved0] = useState(() => draftOf(initial))
  const [d, setD] = useState(saved0)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  const dirty = (Object.keys(d) as (keyof Draft)[]).some((k) => d[k] !== saved0[k])

  const set = (k: keyof Draft) => (e: { target: { value: string } }) => {
    setD((prev) => ({ ...prev, [k]: e.target.value }))
    setSaved(false)
  }

  function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    start(async () => {
      const result = await setSiteHero(slug, {
        eyebrow: d.eyebrow,
        heading: d.heading,
        tagline: d.tagline,
        action: { label: d.actionLabel, href: d.actionHref },
        secondary: { label: d.secondaryLabel, href: d.secondaryHref },
      })
      if (isError(result)) return setError(result.error)
      setSaved0(d)
      setSaved(true)
      router.refresh()
    })
  }

  const linkHint = `A page of your Space, like /spaces/${slug}/about, or a web address.`
  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="Website eyebrow" hint="The short line above the headline. Leave blank for none.">
        <Input value={d.eyebrow} maxLength={MAX_SITE_HERO_EYEBROW} onChange={set('eyebrow')} />
      </Field>
      <Field label="Website headline" hint="Wrap a word in *asterisks* to set it in the accent.">
        <Input
          value={d.heading}
          maxLength={MAX_SITE_HERO_HEADING}
          placeholder="Leave blank to use your Space name"
          onChange={set('heading')}
        />
      </Field>
      <Field label="Website intro" hint="The line under the headline. Leave blank to use your tagline.">
        <Textarea value={d.tagline} rows={3} maxLength={MAX_SITE_HERO_TAGLINE} onChange={set('tagline')} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Main button" hint="Leave blank to use your header button.">
          <Input value={d.actionLabel} maxLength={MAX_SITE_HERO_BUTTON} placeholder="Button text" onChange={set('actionLabel')} />
        </Field>
        <Field label="Main button link" hint={linkHint}>
          <Input value={d.actionHref} placeholder={`/spaces/${slug}/about`} onChange={set('actionHref')} />
        </Field>
        <Field label="Second button" hint="Leave blank for the default.">
          <Input value={d.secondaryLabel} maxLength={MAX_SITE_HERO_BUTTON} placeholder="Button text" onChange={set('secondaryLabel')} />
        </Field>
        <Field label="Second button link" hint={linkHint}>
          <Input value={d.secondaryHref} placeholder={`/spaces/${slug}/about`} onChange={set('secondaryHref')} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" disabled={pending || !dirty}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Save hero
        </Button>
        <span aria-live="polite" className="text-body-sm text-muted">
          {saved && !dirty ? 'Saved.' : null}
        </span>
      </div>
      {error && <p className="text-body-sm text-danger">{error}</p>}
    </form>
  )
}
