import "@/app/themes/active/mega-footer";
import { MegaFooterTabs } from "./mega-footer-tabs";
import { CONTACT_EMAIL, ORG_LEGAL_NAME } from "@/lib/site";
import { JsonLd } from "@/components/json-ld";
import { siteNavigationSchema } from "@/lib/jsonld";

// THE FREQUENCY MEGA FOOTER (LIVE-1030, LIVE-1115). The owner, 2026-10-20: "The footer should be just like
// a mega menu. Bunch of tabs, that pop open into nav areas. Except this is upside down so it pops up. The
// left and right menus ALWAYS stay pinned to the bottom. The middle of the mega menu opens up on activation."
//
// So the footer is the member header's mega menu turned over: a tab bar pinned to the bottom of the window
// between the two rail docks, one tab per area of the site index, each opening its panel upward
// (mega-footer-tabs.tsx, the one client island). The footer no longer sits in the page's flow, so the
// rails run to the end of the page and their docks never leave the window's bottom edge.
//
// ONE SOURCE. The columns arrive as props from the registry (lib/nav/registry.ts footerColumns, gate-filtered
// by lib/nav/footer-access.ts). Their Legal column is lib/nav/legal-links.ts, the list every footer shares
// (LIVE-1095). The index is also written as SiteNavigationElement JSON-LD here, server side.

export interface MegaColumn {
  title: string;
  links: { label: string; href: string }[];
}

export interface MegaCta {
  label: string;
  href: string;
  /** The one primary action wears the pastel pill. */
  primary?: boolean;
}

export function FqMegaFooter({
  columns,
  ctas,
  tagline,
}: {
  columns: readonly MegaColumn[];
  ctas: readonly MegaCta[];
  /** The serif line in each panel's foot, beside the calls to action. */
  tagline: string;
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="fq-mf" aria-label="Site footer">
      <JsonLd data={siteNavigationSchema(columns)} />
      <MegaFooterTabs
        columns={columns}
        ctas={ctas}
        tagline={tagline}
        copyright={`© ${year} ${ORG_LEGAL_NAME}`}
        contact={CONTACT_EMAIL}
      />
    </footer>
  );
}
