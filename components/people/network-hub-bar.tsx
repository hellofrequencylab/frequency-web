import { NetworkTabs } from './network-tabs'
import { NetworkNotice } from './network-notice'

/** The shared strip under the header of Members, Friends and My Contacts: the same tab row, then the
 *  closable how-to notice. One component so the three pages cannot drift apart. */
export function NetworkHubBar({ active }: { active: '/network' | '/network/friends' | '/network/contacts' }) {
  return (
    <>
      <NetworkTabs active={active} />
      <NetworkNotice />
    </>
  )
}
