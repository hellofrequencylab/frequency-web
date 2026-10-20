import "@/app/themes/active/mega-footer";
import { MegaFooterTabs } from "./mega-footer-tabs";
import { LEGAL_LINKS } from "@/lib/nav/legal-links";
import { CONTACT_EMAIL, ORG_LEGAL_NAME } from "@/lib/site";
import { JsonLd } from "@/components/json-ld";
import { siteNavigationSchema } from "@/lib/jsonld";

// THE FREQUENCY MEGA FOOTER (LIVE-1030, LIVE-1154). The owner, 2026-10-20: "I want a FOOTER at the BOTTOM of
// the page" that "looks like a footer menu, but has a mega menu that also opens up", with the left and right
// docks always pinned to the bottom, and no round menu ("that's DAWN").
//
// So it is the design system's site footer (`.ft2`): a dark band in the page flow at the very end of the
// page, under an iridescent rule, holding the wordmark, the area headings, the copyright and the legal row.
// The headings are tabs (mega-footer-tabs.tsx, the one client island): each opens its area's mega panel up
// out of the footer. The footer sits inside the rail grid's last row, full bleed, and the docks are fixed to
// the window bottom (members-shell.css), so they rest over its two ends.
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
    <footer className="fq-mf" aria-label="Site footer" data-surface="stage">
      <JsonLd data={siteNavigationSchema(columns)} />
      <MegaFooterTabs
        columns={columns}
        ctas={ctas}
        tagline={tagline}
        copyright={`© ${year} ${ORG_LEGAL_NAME}`}
        contact={CONTACT_EMAIL}
        legal={LEGAL_LINKS.map((l) => ({ label: l.label, href: l.href }))}
      />
    </footer>
  );
}
