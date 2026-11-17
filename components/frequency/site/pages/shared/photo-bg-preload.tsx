import { optimizedPhoto } from './photo-bg'

// THE HERO STILL, ASKED FOR FIRST (SCAN-1265). Used by the /pricing, /spaces and Discover heroes. A `.phero .bg` is a CSS background, so the browser only
// finds the photo after the stylesheets load and the element is styled, and on a slow phone it then
// queues behind thirty script chunks: /pricing painted its hero at 5.6 s on a throttled phone. These two
// <link rel="preload"> tags (React hoists them into <head>) start the download from the HTML itself, at
// high priority. Each names the same rendition and breakpoint the kit's `.bg` rules pick (photoBg: 1080 px
// under 860 px wide, else 1920 px), so a visitor downloads exactly one copy, never both.
export function PhotoBgPreload({ src }: { src: string }) {
  return (
    <>
      <link rel="preload" as="image" href={optimizedPhoto(src, 1080)} media="(max-width: 860px)" fetchPriority="high" />
      <link rel="preload" as="image" href={optimizedPhoto(src, 1920)} media="(min-width: 861px)" fetchPriority="high" />
    </>
  )
}
