import '@/app/themes/frequency/site-blocks.css'

// THE FREQUENCY WEBSITE SCOPE OVER A BLOCK DOCUMENT (ADR-1737). Under SITE_DESIGN 'frequency' the block
// config's root render (lib/page-editor/config.tsx) wraps every non-Space document in this, so the blocks
// a page is built from wear the site kit's idiom: app/themes/frequency/site-blocks.css keys every rule on
// `[data-kit="site"] [data-site-blocks]`, which only the public site shell provides. Under DAWN the root
// render never reaches this file, so DAWN's markup is byte-identical.
//
// `display: contents` keeps the wrapper out of layout: each block is still a direct box of the page, so
// full-bleed sections and the marketing rhythm's sibling rules (`.mk-beat + .mk-beat`) behave as before.
// The stylesheet is imported here, so only a page that renders this loads it.
export function SiteBlocks({ children }: { children: React.ReactNode }) {
  return (
    <div data-site-blocks="" className="contents">
      {children}
    </div>
  )
}
