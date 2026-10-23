import type { Metadata, ResolvingMetadata } from 'next'
import { ROOT_OG_IMAGES } from '@/lib/site'

/** Page copy replaces nested metadata; keep the parent's file-convention Help cards. */
export async function helpPageMetadata(metadata: Metadata, parent: ResolvingMetadata): Promise<Metadata> {
  const inherited = await parent
  const ogImages = inherited.openGraph?.images
  const images = metadata.openGraph?.images ?? (ogImages?.length ? ogImages : ROOT_OG_IMAGES)
  const twitterImages = inherited.twitter?.images
  return {
    ...metadata,
    openGraph: { ...metadata.openGraph, images },
    twitter: {
      card: 'summary_large_image',
      title: metadata.openGraph?.title ?? metadata.title ?? undefined,
      description: metadata.openGraph?.description ?? metadata.description ?? undefined,
      images: twitterImages?.length ? twitterImages : images,
      ...metadata.twitter,
    },
  }
}
