// Owner-scoped front door; never pick a Space from another member's membership list.
import { listOwnedSpaces } from './spaces-io'
import { getActiveLaunch } from './store'
import { ownerEntryHref } from './wizard-resume'

export async function ownedWizardEntry(profileId: string, explicitlyNew: boolean): Promise<string | null> {
  if (explicitlyNew) {
    const active = await getActiveLaunch(profileId)
    return active?.spaceId ? '/launch' : null
  }
  const [owned, active] = await Promise.all([listOwnedSpaces(profileId), getActiveLaunch(profileId)])
  const chosen = owned.find((space) => space.id === active?.spaceId) ?? (owned.length === 1 ? owned[0] : null)
  return ownerEntryHref(chosen?.slug ?? null, false) ?? (owned.length > 1 ? '/launch/step/spotlight?go=1' : null)
}
