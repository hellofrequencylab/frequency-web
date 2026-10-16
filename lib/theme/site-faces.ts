// THE WEBSITE'S OWN FACES ON THE SPACE PAGE (SCAN-985, owner 2026-10-16: "make sure all the design fonts
// sync from space to website to public space"). Two website themes wear faces no Space font set carries:
// Network (Bricolage Grotesque over Outfit) and Wildheart (IM Fell English over EB Garamond). The Space
// page used to stand in the nearest set (Modern, Classic), so a Network Space read in one face on its
// website and another on its Space page and its public share page. While the owner keeps the page synced
// to the website, the page now wears the website's real faces.
//
// The website self-hosts them through next/font on its own root (components/sites/network-fonts.ts,
// wildheart-fonts.ts). Importing either into a Space layout would register the faces on every Space route
// (DEPLOY-SAFETY), so the page asks Google Fonts for them only when it renders, the way
// components/spaces/network-page-scope.tsx already does (the CSP allows fonts.googleapis.com and
// fonts.gstatic.com). spacePageSiteFaces (lib/theme/site-style.ts) picks the id; app/themes/frequency/space-page.css maps each id onto the page's display and body
// faces under `data-space-fonts`.

export type SiteFacesId = 'network' | 'wildheart'

/** The Google Fonts sheet that loads each theme's faces. */
export const SITE_FACE_SHEETS: Record<SiteFacesId, string> = {
  network:
    'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Instrument+Serif:ital@0;1&family=Outfit:wght@400..700&display=swap',
  wildheart:
    'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=IM+Fell+English:ital@0;1&display=swap',
}

/** The website's own face variables (the ones its next/font class sets), named to the Google families so
 *  the page's CSS can read the same variables the website does. */
export const SITE_FACE_VARS: Record<SiteFacesId, Record<string, string>> = {
  network: { '--font-nw-bricolage': "'Bricolage Grotesque'", '--font-nw-outfit': "'Outfit'", '--font-nw-instrument': "'Instrument Serif'" },
  wildheart: { '--font-wh-fell': "'IM Fell English'", '--font-wh-garamond': "'EB Garamond'" },
}
