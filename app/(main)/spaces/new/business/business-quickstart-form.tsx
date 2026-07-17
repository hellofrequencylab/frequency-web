'use client'

import { useState, useTransition } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { createBusinessSpace } from '@/lib/spaces/provision'
import { Field, TextField, FormError } from '@/components/spaces/space-form'

// BUSINESS QUICK-START form (client). Five fields, nothing more: name, one line on what you do, and your
// website / Instagram / Facebook. On submit it calls createBusinessSpace, which stands up a PRIVATE
// business Space seeded with your links, a warm cover, and prompts that lead you into writing your own
// copy, then drops you straight on your new page. No content is written for you. Voice canon: no em dashes.
export function BusinessQuickStartForm() {
  const [name, setName] = useState('')
  const [whatYouDo, setWhatYouDo] = useState('')
  const [website, setWebsite] = useState('')
  const [instagram, setInstagram] = useState('')
  const [facebook, setFacebook] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Give your business a name to get started.')
      return
    }
    start(async () => {
      // On success the action redirects to the new page (throws), so control only returns on an error.
      const res = await createBusinessSpace({ name, whatYouDo, website, instagram, facebook })
      if (isError(res)) setError(res.error)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <TextField
        id="biz-name"
        label="Business name"
        placeholder="River Yoga"
        value={name}
        onChange={setName}
        hint="You can change this any time."
      />

      <Field id="biz-what" label="What do you do?" hint="One plain sentence. We use it to write the prompts on your page, not to write your copy.">
        <textarea
          id="biz-what"
          value={whatYouDo}
          onChange={(e) => setWhatYouDo(e.target.value)}
          placeholder="I teach beginner-friendly yoga and breathwork for busy people."
          rows={2}
          className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-primary"
        />
      </Field>

      <TextField
        id="biz-website"
        label="Website"
        placeholder="riveryoga.com"
        value={website}
        onChange={setWebsite}
        hint="Optional. We will add https for you."
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField id="biz-ig" label="Instagram" placeholder="@riveryoga" value={instagram} onChange={setInstagram} hint="Optional. A handle or a link." />
        <TextField id="biz-fb" label="Facebook" placeholder="@riveryoga" value={facebook} onChange={setFacebook} hint="Optional. A handle or a link." />
      </div>

      {error && <FormError message={error} />}

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          {pending ? 'Building your page...' : 'Create my page'}
        </Button>
        <p className="text-xs text-subtle">Your page starts private, just for you, until you publish it.</p>
      </div>
    </form>
  )
}
