import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { getMyProfileId } from '@/lib/auth'
import { publishSpotlightFormAction } from '@/lib/launch/actions'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { readPendingLaunch } from '@/lib/launch/pending-io'

// Step 1 of the launch, the Spotlight (VLS-07): a name, one line, one link. Publishing makes the free Space behind it
// and puts the person's own words on a public page. Open to a signed-out visitor; an account is asked for at Publish
// (the action holds their answers and sends them to sign in). Answers held from an earlier try fill the form again.
// Dark while LAUNCH_SYSTEM_ENABLED is off.
const ERRORS: Readonly<Record<string, string>> = {
  name: 'Add the name people know you by.',
  line: 'Add one line about what you do, in your own words.',
  retry: 'We could not publish that. Try again.',
}

export default async function SpotlightStepPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (!launchSystemEnabled()) notFound()
  const { e } = await searchParams
  const error = typeof e === 'string' ? ERRORS[e] : undefined
  const held = (await readPendingLaunch())?.answers.spotlight
  const signedIn = !!(await getMyProfileId())

  return (
    <FocusTemplate
      eyebrow="Be found"
      title="Your Spotlight"
      description="One page that is all yours, in your own words. Say who you are and where to find you."
      width="narrow"
    >
      <form action={publishSpotlightFormAction} className="flex flex-col gap-4">
        <Field label="Your name or your business" hint="The name people know you by." error={e === 'name' ? error : undefined}>
          <Input name="name" defaultValue={held?.name ?? ''} maxLength={80} autoComplete="organization" required aria-invalid={e === 'name'} />
        </Field>
        <Field label="One line about what you do" hint="Say it the way you would say it to a friend." error={e === 'line' ? error : undefined}>
          <Textarea name="line" defaultValue={held?.line ?? ''} maxLength={300} rows={3} required aria-invalid={e === 'line'} />
        </Field>
        <Field label="A link you want people to find" hint="Optional. A booking page, a site, anything.">
          <Input name="link" type="url" defaultValue={held?.link ?? ''} maxLength={300} inputMode="url" autoComplete="url" />
        </Field>
        {e === 'retry' && error ? <p className="mu-err" role="alert">{error}</p> : null}
        <div>
          <Button type="submit">Publish my Spotlight</Button>
        </div>
        {signedIn ? null : <p className="t2">You make a free account when you publish, so your Spotlight has a home.</p>}
      </form>
    </FocusTemplate>
  )
}
