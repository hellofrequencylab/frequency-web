'use client'

import { useState, useTransition } from 'react'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { saveWallSettings } from './actions'

type Props = {
  slug: string
  initial: { readAccess: 'anyone' | 'members'; postAccess: 'team' | 'members'; followersInteract: boolean }
}

// The owner's three wall choices (ADR-1938). One Save, so a half-made change never lands.
export function WallSettingsForm({ slug, initial }: Props) {
  const [readAccess, setReadAccess] = useState(initial.readAccess)
  const [postAccess, setPostAccess] = useState(initial.postAccess)
  const [followersInteract, setFollowersInteract] = useState(initial.followersInteract)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const dirty =
    readAccess !== initial.readAccess ||
    postAccess !== initial.postAccess ||
    followersInteract !== initial.followersInteract

  function save() {
    setMessage(null)
    start(async () => {
      const res = await saveWallSettings({ slug, readAccess, postAccess, followersInteract })
      setMessage('error' in res ? res.error : 'Saved. Your wall works this way now.')
    })
  }

  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="text-body-sm font-semibold text-text">Who can read the wall</legend>
        <SegmentedControl
          label="Who can read the wall"
          value={readAccess}
          onChange={setReadAccess}
          segments={[
            { value: 'anyone', label: 'Anyone' },
            { value: 'members', label: 'Members only' },
          ]}
        />
        <p className="text-body-sm text-muted">
          {readAccess === 'anyone'
            ? 'Your wall is public. People who find your Space can see what is going on.'
            : 'Only your team and members see posts. Everyone else sees a join prompt.'}
        </p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-body-sm font-semibold text-text">Who can post</legend>
        <SegmentedControl
          label="Who can post"
          value={postAccess}
          onChange={setPostAccess}
          segments={[
            { value: 'members', label: 'Team and members' },
            { value: 'team', label: 'Team only' },
          ]}
        />
      </fieldset>

      <div className="flex items-start justify-between gap-4">
        <div>
          <p id="followers-interact" className="text-body-sm font-semibold text-text">
            Followers can reply and high five
          </p>
          <p className="text-body-sm text-muted">Followers always read a public wall. This lets them join in.</p>
        </div>
        <Switch
          checked={followersInteract}
          onCheckedChange={setFollowersInteract}
          aria-labelledby="followers-interact"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!dirty || pending}>
          {pending ? 'Saving' : 'Save'}
        </Button>
        {message ? (
          <p role="status" className="text-body-sm text-muted">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  )
}
