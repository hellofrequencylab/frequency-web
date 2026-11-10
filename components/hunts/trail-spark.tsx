'use client'

// ─────────────────────────────────────────────────────────────────────────────
// NEW TRAIL, step 1 "Name it" (FH-013, docs/hunts/CREATOR-FLOW.md), composed from the Studio Spark
// kit: `SparkShell` for the screen, `StudioField` + `FieldControl` for every field. The field list is
// not written here: it comes from the HUNT manifest (lib/studio/entities/hunt.ts) through the
// kernel's `sparkFields()`. Continue runs the governed create (createTrailAction) and lands in the
// editor for the stops, the shape, the preview and the publish. Nothing persists before that tap.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FieldControl, SparkShell, StudioField, StudioNote } from '@/components/studio/spark'
import { HUNT_MANIFEST } from '@/lib/studio/entities/hunt'
import { sparkFields } from '@/lib/studio/kernel/review-kernel'
import { createTrailAction } from '@/app/(main)/hunts/actions'
import { TRAIL_STEPS } from './trail-steps'

const FIELDS = sparkFields(HUNT_MANIFEST)

const PLACEHOLDER: Record<string, string> = {
  title: 'e.g. The harbor walk',
  hook: 'e.g. Three stops, one story about the old pier',
  area: 'e.g. Oceanside harbor',
  audience: 'e.g. Families with an afternoon to spare',
}

const scalar = (v: string | string[]): string => (Array.isArray(v) ? (v[0] ?? '') : v)

export function TrailSpark() {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const title = (values.title ?? '').trim()

  const create = () => {
    setError(null)
    start(async () => {
      const res = await createTrailAction({ title, hook: values.hook, area: values.area, audience: values.audience })
      if ('error' in res) {
        setError(res.error)
        return
      }
      router.push(`/hunts/edit/${res.data.huntId}`)
    })
  }

  return (
    <SparkShell
      eyebrow="New trail"
      title="Name it"
      description="A clue trail with three to ten stops. Say what it is, where it runs and who it is for. You add the stops next."
      step={1}
      totalSteps={TRAIL_STEPS.length}
      stepLabel={TRAIL_STEPS[0]}
      onNext={create}
      nextLabel="Continue"
      nextDisabled={!title}
      busy={pending}
      error={error}
    >
      <div className="space-y-4">
        {FIELDS.map((def) => (
          <StudioField key={def.path} label={def.label}>
            <FieldControl
              def={def}
              value={values[def.path] ?? ''}
              onChange={(v) => setValues((s) => ({ ...s, [def.path]: scalar(v) }))}
              placeholder={PLACEHOLDER[def.path]}
            />
          </StudioField>
        ))}
        <StudioNote>A place name is enough for the area. No map pin, and no Space needed: the trail is yours.</StudioNote>
      </div>
    </SparkShell>
  )
}
