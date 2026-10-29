import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { PublishedScreen } from '@/components/launch/published-screen'
import { chooseSpaceFormAction, keepSpaceFormAction, publishSpotlightFormAction } from '@/lib/launch/actions'
import type { FlowView } from '@/lib/launch/flow'
import type { SpaceChoice } from '@/lib/launch/space-choice'
import type { SpotlightAnswers } from '@/lib/launch/spotlight-step'

// THE LAUNCH PAGE (the body; each route wraps it in the Dashboard template): one page that carries the whole launch. The Spotlight form is first; once it is published the same
// page shows a live preview of the real Spotlight beside the form (change it and save, the preview follows), and the
// stages still to come wait underneath. No page changes between them. Server-friendly, no hooks: the preview is the
// real public page in a frame, so what the person sees is exactly what a visitor gets.

const PHONE_W = 390
const PHONE_H = 844
const SCALE = 0.62

const ERRORS: Readonly<Record<string, string>> = {
  name: 'Add the name people know you by.',
  line: 'Add one line about what you do, in your own words.',
  retry: 'We could not publish that. Try again.',
}

const LATER: Readonly<Record<'space' | 'website' | 'email', { title: string; blurb: string }>> = {
  space: { title: 'Your Space', blurb: 'Your Space is made. This is how it starts out; you add photos, hours and offers after the launch.' },
  website: { title: 'Website', blurb: 'Turn your Spotlight into a full website, in your own words.' },
  email: { title: 'Email', blurb: 'Write a first note to the people who find you.' },
}

function Phone({ src, live }: { src: string | null; live: boolean }) {
  const w = Math.round(PHONE_W * SCALE)
  const h = Math.round(PHONE_H * SCALE)
  return (
    <div
      aria-hidden={live ? undefined : true}
      style={{ width: w + 16, borderRadius: 36, padding: 8, background: 'var(--fq-surface-card)', boxShadow: 'var(--fq-shadow-1)', border: `1px ${live ? 'solid' : 'dashed'} var(--fq-border-hair)` }}
    >
      <div style={{ width: w, height: h, borderRadius: 28, overflow: 'hidden', position: 'relative', background: 'var(--fq-canvas)' }}>
        {src ? (
          <iframe
            src={src}
            title="Your Spotlight, as people see it"
            loading="lazy"
            style={{ width: PHONE_W, height: PHONE_H, border: 0, transformOrigin: '0 0', transform: `scale(${SCALE})` }}
          />
        ) : (
          <div className="t2" style={{ padding: 24, textAlign: 'center', display: 'grid', placeItems: 'center', height: '100%' }}>
            Your Spotlight shows up here when you publish it.
          </div>
        )}
      </div>
    </div>
  )
}

export function LaunchFlow({ view, answers, errorCode, signedIn, choices }: { view: FlowView; answers: SpotlightAnswers | null; errorCode?: string; signedIn: boolean; choices?: SpaceChoice[] }) {
  const live = !!view.slug
  const error = errorCode ? ERRORS[errorCode] : undefined
  const done = view.stages.filter((s) => s.state === 'live').length
  const previewSrc = view.spotlightHref ? `${view.spotlightHref}?preview=1` : null

  return (
    <>
      <div>
        <div className="mu-steps" role="img" aria-label={`${done} of ${view.stages.length} stages done`}>
          {view.stages.map((s) => (
            <span key={s.id} className={s.state === 'live' ? 'on' : undefined} />
          ))}
        </div>
        <ol className="t2" style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
          {view.stages.map((s) => (
            <li key={s.id} aria-current={s.state === 'next' ? 'step' : undefined} style={s.state === 'next' ? { color: 'var(--fq-text)', fontWeight: 600 } : undefined}>
              {s.label}
            </li>
          ))}
        </ol>
      </div>

      {choices ? (
        <section className="panel" aria-labelledby="pick-h">
          <form action={chooseSpaceFormAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 id="pick-h" className="h2">
              Which Space is this for?
            </h2>
            <p className="t2">Pick one you already have and we fill in what it knows. Anything you change here is saved to it.</p>
            <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              <legend className="sr-only">Your Spaces</legend>
              {choices.map((c, i) => (
                <label key={c.value} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 16, border: '1px solid var(--fq-border-hair)', background: 'var(--fq-surface-card)', cursor: 'pointer' }}>
                  <input type="radio" name="space" value={c.value} defaultChecked={i === 0} />
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block' }}>{c.title}</strong>
                    <span className="t2">{c.note}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div>
              <Button type="submit">Continue</Button>
            </div>
          </form>
        </section>
      ) : (
      <section className="panel" aria-labelledby="spot-h" style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', alignItems: 'start' }}>
        <form action={publishSpotlightFormAction} style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <h2 id="spot-h" className="h2">
            Spotlight
          </h2>
          <Field label="Your name or your business" hint="The name people know you by." error={errorCode === 'name' ? error : undefined}>
            <Input name="name" defaultValue={answers?.name ?? ''} maxLength={80} autoComplete="organization" required aria-invalid={errorCode === 'name'} />
          </Field>
          <Field label="One line about what you do" hint="Say it the way you would say it to a friend." error={errorCode === 'line' ? error : undefined}>
            <Textarea name="line" defaultValue={answers?.line ?? ''} maxLength={300} rows={3} required aria-invalid={errorCode === 'line'} />
          </Field>
          <Field label="A link you want people to find" hint="Optional. A booking page, a site, anything.">
            <Input name="link" type="url" defaultValue={answers?.link ?? ''} maxLength={300} inputMode="url" autoComplete="url" />
          </Field>
          {errorCode === 'retry' && error ? (
            <p className="mu-err" role="alert">
              {error}
            </p>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <Button type="submit">{live ? 'Save changes' : 'Publish my Spotlight'}</Button>
          </div>
          {signedIn || live ? null : <p className="t2">You make a free account when you publish, so your Spotlight has a home.</p>}
        </form>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 16 }}>
          <Phone src={previewSrc} live={live} />
          {live && view.spotlightHref ? <PublishedScreen view={{ kind: 'done', label: 'Spotlight', liveHref: view.spotlightHref, next: null }} /> : null}
        </div>
      </section>
      )}

      {(['space', 'website', 'email'] as const).map((id) => {
        const state = view.stages.find((s) => s.id === id)?.state ?? 'later'
        const copy = LATER[id]
        return (
          <section key={id} className="panel" aria-labelledby={`${id}-h`} style={state === 'later' ? { opacity: 0.7 } : undefined}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                <h2 id={`${id}-h`} className="h2">
                  {copy.title}
                </h2>
                <p className="t2" style={{ marginTop: 4 }}>
                  {state === 'later' ? (id === 'space' ? 'After your Spotlight is live.' : id === 'website' ? 'After your Space.' : 'After your website.') : state === 'live' ? 'Kept. You can change everything in it after the launch.' : copy.blurb}
                </p>
                {id === 'space' && state !== 'later' && view.slug && answers ? (
                  <p className="t2" style={{ marginTop: 12, color: 'var(--fq-text)' }}>
                    <strong>{answers.name}</strong> · frequencylocal.com/spaces/{view.slug}
                    {answers.line ? <span style={{ display: 'block', color: 'var(--fq-text-muted)' }}>{answers.line}</span> : null}
                  </p>
                ) : null}
              </div>
              {id === 'space' && state === 'next' ? (
                <form action={keepSpaceFormAction}>
                  <Button type="submit">Keep my Space</Button>
                </form>
              ) : null}
            </div>
          </section>
        )
      })}
    </>
  )
}
