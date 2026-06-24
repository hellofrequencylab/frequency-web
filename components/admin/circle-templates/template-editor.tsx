'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Plus, Trash2 } from 'lucide-react'
import { Input, Textarea, Label, fieldClasses } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/admin/status'
import { isError } from '@/lib/action-result'
import type { CircleTemplate, CalloutAnchor } from '@/lib/circles/templates'
import type { PillarSlug } from '@/lib/pillars'
import { updateTemplate } from '@/app/(main)/admin/circle-templates/actions'
import { PILLAR_ORDER, PILLAR_LABEL } from './pillar-label'

// The per-template editor — every editable field of a circle_templates row, in a focused
// single-column form. Typed columns are plain fields; the jsonb structures get purpose-
// built editors (one line per Pillar, line-per-item lists for agreements + remix ideas, a
// repeatable rows editor for the edit-mode callouts). The form submits the whole shape to
// updateTemplate, which re-shapes + writes server-side. display_order and is_active are
// owned by the index (reorder + the active toggle), not this form.

const CALLOUT_ANCHORS: readonly CalloutAnchor[] = [
  'identity',
  'card',
  'pillars',
  'rhythm',
  'meetup',
  'gathering',
  'agreements',
  'size',
  'remix',
  'launch',
]

interface CalloutDraft {
  anchor: CalloutAnchor
  title: string
  body: string
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div>
        <h2 className="text-base font-bold text-text">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function PillarSelect({
  name,
  defaultValue,
  includeNone,
  id,
}: {
  name: string
  defaultValue: PillarSlug | '' | null
  includeNone?: boolean
  id?: string
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue ?? ''}
      className={fieldClasses}
    >
      {includeNone && <option value="">Any (Expression)</option>}
      {PILLAR_ORDER.map((p) => (
        <option key={p} value={p}>
          {PILLAR_LABEL[p]}
        </option>
      ))}
    </select>
  )
}

export function TemplateEditor({ template }: { template: CircleTemplate }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [callouts, setCallouts] = useState<CalloutDraft[]>(
    template.callouts.map((c) => ({ anchor: c.anchor, title: c.title, body: c.body })),
  )

  function submit() {
    const form = formRef.current
    if (!form) return
    setError(null)
    setSaved(false)
    const fd = new FormData(form)
    start(async () => {
      const res = await updateTemplate(template.id, fd)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2000)
    })
  }

  function addCallout() {
    setCallouts((cs) => [...cs, { anchor: 'launch', title: '', body: '' }])
  }
  function removeCallout(idx: number) {
    setCallouts((cs) => cs.filter((_, i) => i !== idx))
  }
  function patchCallout(idx: number, patch: Partial<CalloutDraft>) {
    setCallouts((cs) => cs.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="space-y-6"
    >
      {error && (
        <Banner tone="critical" title="That didn’t save">
          {error}
        </Banner>
      )}

      <FormSection
        title="Identity"
        description="Who shows up and what they get. Name it for the people, not the topic."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={template.name} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" name="slug" defaultValue={template.slug} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="primary_pillar">Primary Pillar (the lean)</Label>
            <PillarSelect id="primary_pillar" name="primary_pillar" defaultValue={template.primaryPillar} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="identity">Identity</Label>
          <Textarea id="identity" name="identity" rows={2} defaultValue={template.identity} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="audience">Audience</Label>
          <Textarea id="audience" name="audience" rows={2} defaultValue={template.audience} required />
        </div>
      </FormSection>

      <FormSection
        title="The Card"
        description="The skeptic-proof hook and the fuller intro a member reads in the gallery."
      >
        <div className="space-y-1">
          <Label htmlFor="card">Card hook (under a dozen words)</Label>
          <Input id="card" name="card" defaultValue={template.card} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="one_liner">One-liner</Label>
          <Textarea id="one_liner" name="one_liner" rows={2} defaultValue={template.oneLiner} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="about">About (optional, fuller intro)</Label>
          <Textarea id="about" name="about" rows={3} defaultValue={template.about ?? ''} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="image_url">Image URL (optional)</Label>
          <Input id="image_url" name="image_url" defaultValue={template.imageUrl ?? ''} placeholder="https://…" />
        </div>
      </FormSection>

      <FormSection
        title="The four Pillars inside"
        description="One honest line each. Lean one Pillar, carry all four — every Circle works the whole person."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PILLAR_ORDER.map((p) => (
            <div key={p} className="space-y-1">
              <Label htmlFor={`pillars_inside.${p}`}>
                {PILLAR_LABEL[p]}
                {p === template.primaryPillar && (
                  <span className="ml-1.5 text-2xs font-semibold uppercase tracking-wide text-primary">
                    Primary
                  </span>
                )}
              </Label>
              <Textarea
                id={`pillars_inside.${p}`}
                name={`pillars_inside.${p}`}
                rows={2}
                defaultValue={template.pillarsInside[p] ?? ''}
              />
            </div>
          ))}
        </div>
      </FormSection>

      <FormSection
        title="Rhythm"
        description="The two standing beats and the always-on Thread."
      >
        <div className="space-y-1">
          <Label htmlFor="meetup.text">Circle Meetup (midweek)</Label>
          <Textarea id="meetup.text" name="meetup.text" rows={2} defaultValue={template.meetup.text} />
        </div>
        <div className="space-y-1 sm:max-w-xs">
          <Label htmlFor="meetup.length">Meetup length (soft time box)</Label>
          <Input
            id="meetup.length"
            name="meetup.length"
            defaultValue={template.meetup.length ?? ''}
            placeholder="e.g. 75 to 90 minutes"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="gathering.text">Weekend Gathering</Label>
          <Textarea id="gathering.text" name="gathering.text" rows={2} defaultValue={template.gathering.text} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="thread">Thread (the always-on space)</Label>
          <Textarea id="thread" name="thread" rows={2} defaultValue={template.thread ?? ''} />
        </div>
      </FormSection>

      <FormSection
        title="Format & size"
        description="In-person / virtual / hybrid guidance and the size that keeps it knowable."
      >
        <div className="space-y-1">
          <Label htmlFor="format">Format guidance</Label>
          <Textarea id="format" name="format" rows={2} defaultValue={template.format ?? ''} />
        </div>
        <div className="space-y-1 sm:max-w-xs">
          <Label htmlFor="size_label">Size label</Label>
          <Input id="size_label" name="size_label" defaultValue={template.sizeLabel ?? ''} placeholder="e.g. 5 to 10" />
        </div>
      </FormSection>

      <FormSection
        title="Agreements"
        description="Three or four plain norms. One per line."
      >
        <Textarea
          name="agreements"
          rows={4}
          defaultValue={template.agreements.join('\n')}
          placeholder={'read what you can, no shame if you didn’t finish\nno spoilers past the agreed chapter'}
        />
      </FormSection>

      <FormSection
        title="Make it yours"
        description="The recommended Pillar Journey to run as a Run, and the remix ideas a Host can take. One remix idea per line."
      >
        <div className="space-y-1 sm:max-w-xs">
          <Label htmlFor="recommended_journey_pillar">Recommended Journey Pillar</Label>
          <PillarSelect
            id="recommended_journey_pillar"
            name="recommended_journey_pillar"
            defaultValue={template.recommendedJourneyPillar}
            includeNone
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="remix_options">Remix ideas</Label>
          <Textarea
            id="remix_options"
            name="remix_options"
            rows={5}
            defaultValue={template.remixOptions.join('\n')}
            placeholder={'a single-genre club\na short-story or essay club for busy people'}
          />
        </div>
      </FormSection>

      <FormSection
        title="Edit-mode callouts"
        description="Per-template best-practice boxes that travel into the adopter's draft and show only while editing. The standard library is added on top automatically."
      >
        <input type="hidden" name="callout_count" value={callouts.length} />
        {callouts.length === 0 && (
          <p className="text-sm text-muted">No extra callouts on this template yet.</p>
        )}
        <div className="space-y-3">
          {callouts.map((c, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-border bg-surface-elevated/40 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`callout.${i}.anchor`}>Anchor</Label>
                  <select
                    id={`callout.${i}.anchor`}
                    name={`callout.${i}.anchor`}
                    value={c.anchor}
                    onChange={(e) => patchCallout(i, { anchor: e.target.value as CalloutAnchor })}
                    className={fieldClasses}
                  >
                    {CALLOUT_ANCHORS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removeCallout(i)}
                  aria-label="Remove callout"
                  className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger-bg"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
                </button>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`callout.${i}.title`}>Title</Label>
                <Input
                  id={`callout.${i}.title`}
                  name={`callout.${i}.title`}
                  value={c.title}
                  onChange={(e) => patchCallout(i, { title: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`callout.${i}.body`}>Body</Label>
                <Textarea
                  id={`callout.${i}.body`}
                  name={`callout.${i}.body`}
                  rows={2}
                  value={c.body}
                  onChange={(e) => patchCallout(i, { body: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={addCallout}>
          <Plus className="h-4 w-4" aria-hidden /> Add a callout
        </Button>
      </FormSection>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t border-border bg-canvas/90 px-1 py-3 backdrop-blur">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Save changes
        </Button>
        {saved && <span className="text-xs font-medium text-success">Saved.</span>}
      </div>
    </form>
  )
}
