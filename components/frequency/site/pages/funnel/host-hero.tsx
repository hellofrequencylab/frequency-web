import type { HostFunnelCopy } from '@/lib/onboarding/funnel-context'
import { FnPhotoHero } from './parts'

/** The /start/host hero (LIVE-2233): the kit's photo hero with the region and founder lines under the lede. */
export function HostFunnelHero({ image, copy }: { image: string; copy: HostFunnelCopy }) {
  return (
    <FnPhotoHero image={image} kicker={copy.eyebrow} title={copy.headline} lede={copy.body}>
      {copy.regionLine && <p>{copy.regionLine}</p>}
      {copy.founderLine && <p>{copy.founderLine}</p>}
    </FnPhotoHero>
  )
}
