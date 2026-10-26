'use client'

import { useState } from 'react'
import { SparkShell } from '@/components/studio/spark'
import { TextField } from '@/components/spaces/space-form'
import { MEGA_NICHES, type MegaNicheId } from '@/lib/theme/mega-theme'
import {
  PICKER_ACTION_LABEL,
  PICKER_COPY,
  PICKER_FEELS,
  PICKER_NICHES,
  actionsForNiche,
  pickerQuestions,
  resolvePicker,
} from '@/lib/spaces/space-picker'

// The SPACE PICKER (ADR-1883): four taps that choose a starting point before the setup wizard. A niche that
// came in from a /for door answers question one already. Every answer is optional and the owner can skip the
// lot; the wizard below it is unchanged. The answers leave through `onDone` as raw values, and createSpace
// validates them again (lib/spaces/space-picker.ts resolvePicker), so nothing here is trusted.

export interface PickerDone {
  niche: string | null
  action: string | null
  feel: string | null
  site: string | null
}

/** The kit's heading lockup: the last word in Instrument Serif italic. */
function lockup(title: string) {
  const i = title.lastIndexOf(' ')
  if (i < 0) return title
  const last = title.slice(i + 1).replace(/[?.!]+$/, '')
  return (
    <>
      {title.slice(0, i)} <span className="serif">{last}</span>
      {title.slice(i + 1 + last.length)}
    </>
  )
}

/** THE PREVIEW STUB. Shows the answers back in plain words. It becomes the live preview once a theme's niche
 *  variants exist and can be read from the theme package, with this same props shape. */
function PickerPreview({ niche, action, feel }: { niche: string | null; action: string | null; feel: string | null }) {
  const nicheLabel = PICKER_NICHES.find((n) => n.id === niche)?.label
  const feelLabel = PICKER_FEELS.find((f) => f.id === feel)?.label
  const parts = [nicheLabel, action ? PICKER_ACTION_LABEL[action as keyof typeof PICKER_ACTION_LABEL] : null, feelLabel].filter(Boolean)
  return (
    <p className="why" aria-live="polite">
      {parts.length ? `So far: ${parts.join(', ')}.` : 'Your page preview shows up here as you pick.'}
    </p>
  )
}

export function SpacePicker({
  arrivedNiche,
  onDone,
  onSkip,
}: {
  /** A niche a door already named, validated by the page. */
  arrivedNiche: MegaNicheId | null
  onDone: (answers: PickerDone) => void
  onSkip: () => void
}) {
  const questions = pickerQuestions(arrivedNiche)
  const [index, setIndex] = useState(0)
  const [niche, setNiche] = useState<string | null>(arrivedNiche)
  const [action, setAction] = useState<string | null>(null)
  const [feel, setFeel] = useState<string | null>(null)
  const [site, setSite] = useState('')

  const current = questions[index]
  const nicheId = (MEGA_NICHES as readonly string[]).includes(niche ?? '') ? (niche as MegaNicheId) : null
  const last = index === questions.length - 1
  const title = PICKER_COPY[current].title

  function finish() {
    // The resolver is the one place that decides what is valid; run it here so the wizard only ever holds
    // answers the server will keep, and show nothing it would drop.
    const r = resolvePicker({ niche, action, feel, site }, arrivedNiche)
    onDone({
      niche: r.niche,
      action: r.action,
      feel: r.theme ? (PICKER_FEELS.find((f) => f.theme === r.theme && f.live)?.id ?? null) : null,
      site: r.sourceUrl,
    })
  }

  return (
    <SparkShell
      eyebrow="New Space"
      headingLevel={2}
      title={lockup(title)}
      step={index + 1}
      totalSteps={questions.length}
      stepLabel="Start"
      onBack={index > 0 ? () => setIndex(index - 1) : undefined}
      onNext={last ? finish : () => setIndex(index + 1)}
      nextLabel={last ? 'Continue' : 'Next'}
      exits={[{ label: 'Skip, I will set it up by hand', onSelect: onSkip }]}
      draftScopeKey={null}
    >
      {current === 'niche' && (
        <div className="chips flex flex-wrap gap-2" role="group" aria-label="What you are building">
          {PICKER_NICHES.map((n) => (
            <button
              key={n.id}
              type="button"
              className={niche === n.id ? 'chip on' : 'chip'}
              aria-pressed={niche === n.id}
              title={n.hint}
              onClick={() => {
                setNiche(n.id)
                setAction(null)
              }}
            >
              {n.label}
            </button>
          ))}
          <button
            type="button"
            className={niche === 'other' ? 'chip on' : 'chip'}
            aria-pressed={niche === 'other'}
            onClick={() => {
              setNiche('other')
              setAction(null)
            }}
          >
            {PICKER_COPY.niche.other}
          </button>
        </div>
      )}

      {current === 'action' && (
        <div className="chips flex flex-wrap gap-2" role="group" aria-label="The one thing you want people to do">
          {actionsForNiche(nicheId).map((a) => (
            <button key={a} type="button" className={action === a ? 'chip on' : 'chip'} aria-pressed={action === a} onClick={() => setAction(a)}>
              {PICKER_ACTION_LABEL[a]}
            </button>
          ))}
        </div>
      )}

      {current === 'feel' && (
        <div className="space-y-3">
          <div className="chips flex flex-wrap gap-2" role="group" aria-label="A feel for your page">
            {PICKER_FEELS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={feel === f.id ? 'chip on' : 'chip'}
                aria-pressed={feel === f.id}
                disabled={!f.live}
                title={f.hint}
                onClick={() => setFeel(f.id)}
              >
                {f.label}
                {!f.live && <span className="meta"> {PICKER_COPY.feel.soon}</span>}
              </button>
            ))}
          </div>
          <p className="why">You can change it anytime.</p>
        </div>
      )}

      {current === 'site' && (
        <TextField id="picker-site" label="Your site" hint="Optional. Skip it and nothing is lost." value={site} onChange={setSite} placeholder={PICKER_COPY.site.placeholder} maxLength={300} />
      )}

      <PickerPreview niche={nicheId} action={action} feel={feel} />
    </SparkShell>
  )
}
