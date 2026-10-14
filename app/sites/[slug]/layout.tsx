import { SiteDesignReset } from '@/components/sites/site-design-reset'

// Every page of a Space website: the root goes back to DAWN before the site paints, so the website's own
// theme renders (components/sites/site-design-reset.tsx). Reads no request data, so the pages stay static.
export default function SpaceWebsiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteDesignReset />
      {children}
    </>
  )
}
