import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Phone } from '@/components/launch/launch-flow'
import { savePersonalFormAction } from '@/lib/launch/actions'
import type { SpotlightAnswers } from '@/lib/launch/spotlight-step'

// THE PERSONAL SPOTLIGHT STEP (LIVE-1918). Everyone has a personal Spotlight; this is the short way to make it good: a
// name, one line, one link, saved onto the profile, with the real page beside the form. Once it is saved the Space is
// offered as the step up, with what they just wrote carried along (the Space launch fills from the profile). Skippable:
// the offer is a card, never a gate. Server-friendly, no hooks.

const ERRORS: Readonly<Record<string, string>> = {
  name: 'Add the name people know you by.',
  line: 'Add one line about what you do, in your own words.',
  retry: 'We could not save that. Try again.',
}

export function LaunchPersonal({ answers, errorCode, spotlightHref, saved, spaceHref }: { answers: SpotlightAnswers; errorCode?: string; spotlightHref: string | null; saved: boolean; spaceHref: string }) {
  const error = errorCode ? ERRORS[errorCode] : undefined
  const previewSrc = spotlightHref ? `${spotlightHref}?preview=1` : null
  return (
    <div className="grid gap-5">
      <section className="panel" aria-labelledby="personal-h" style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', alignItems: 'start' }}>
        <form action={savePersonalFormAction} style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <h2 id="personal-h" className="h2">
            About you
          </h2>
          <Field label="Your name" hint="The name people know you by." error={errorCode === 'name' ? error : undefined}>
            <Input name="name" defaultValue={answers.name} maxLength={80} autoComplete="name" required aria-invalid={errorCode === 'name'} />
          </Field>
          <Field label="One line about you" hint="Say it the way you would say it to a friend." error={errorCode === 'line' ? error : undefined}>
            <Textarea name="line" defaultValue={answers.line} maxLength={300} rows={3} required aria-invalid={errorCode === 'line'} />
          </Field>
          <Field label="A link you want people to find" hint="Optional. A site, a page you love, anything.">
            <Input name="link" type="url" defaultValue={answers.link} maxLength={300} inputMode="url" autoComplete="url" />
          </Field>
          {errorCode === 'retry' && error ? (
            <p className="mu-err" role="alert">
              {error}
            </p>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <Button type="submit">{saved ? 'Save changes' : 'Save my Spotlight'}</Button>
          </div>
        </form>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 16 }}>
          <Phone src={previewSrc} live={saved && !!previewSrc} />
          {saved && spotlightHref ? (
            <Button asChild variant="secondary">
              <Link href={spotlightHref} target="_blank" rel="noopener">
                Open my Spotlight in a new tab
              </Link>
            </Button>
          ) : null}
        </div>
      </section>

      {saved ? (
        <section className="card" aria-labelledby="personal-up" style={{ padding: '18px 20px', display: 'grid', gap: 8 }}>
          <b id="personal-up">Running something? Give it a Space.</b>
          <span className="t2">A Space is the step up: a website, a list, bookings and its own Spotlight. Your name, line and link come along, so you are not starting over.</span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Link href={spaceHref} className="btn pa sm">
              Start my Space
            </Link>
            <Link href="/" className="btn txt sm">
              Not now
            </Link>
          </span>
        </section>
      ) : null}
    </div>
  )
}
