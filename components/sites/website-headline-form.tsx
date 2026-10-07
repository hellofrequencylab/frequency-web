'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { MAX_SITE_HERO_HEADING, MAX_SITE_HERO_TAGLINE } from '@/lib/spaces/website'
import { setSiteHero } from '@/app/(main)/spaces/[slug]/manage/layout/actions'

// The website hero's own words (LIVE-832), on the Profile & Settings Website card. The Space page header
// keeps the Hero settings (the Space's name and a short line); these two fields set what the website
// leads with instead. Blank falls back to the Hero settings. The server action re-gates the editor role
// and sanitizes; this client is feedback only.

export function WebsiteHeadlineForm({
  slug,
  heading,
  tagline,
}: {
  slug: string
  heading: string
  tagline: string
}) {
  const router = useRouter()
  const [headline, setHeadline] = useState(heading)
  const [intro, setIntro] = useState(tagline)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  const dirty = headline !== heading || intro !== tagline

  function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    start(async () => {
      const result = await setSiteHero(slug, { heading: headline, tagline: intro })
      if (isError(result)) return setError(result.error)
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="Website headline" hint="Wrap a word in *asterisks* to set it in the accent italic.">
        <Input
          value={headline}
          maxLength={MAX_SITE_HERO_HEADING}
          placeholder="Leave blank to use your Space name"
          onChange={(e) => {
            setHeadline(e.target.value)
            setSaved(false)
          }}
        />
      </Field>
      <Field label="Website intro" hint="The line under the headline. Leave blank to use your tagline.">
        <Textarea
          value={intro}
          rows={3}
          maxLength={MAX_SITE_HERO_TAGLINE}
          onChange={(e) => {
            setIntro(e.target.value)
            setSaved(false)
          }}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" disabled={pending || !dirty}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Save headline
        </Button>
        <span aria-live="polite" className="text-body-sm text-muted">
          {saved && !dirty ? 'Saved.' : null}
        </span>
      </div>
      {error && <p className="text-body-sm text-danger">{error}</p>}
    </form>
  )
}
