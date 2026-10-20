import Link from "next/link";
import { ChevronUp } from "lucide-react";
import "@/app/themes/active/mega-footer";
import { MegaFooterLift } from "./mega-footer-lift";
import { LEGAL_LINKS } from "@/lib/nav/legal-links";
import { CONTACT_EMAIL, ORG_LEGAL_NAME } from "@/lib/site";
import { JsonLd } from "@/components/json-ld";
import { siteNavigationSchema } from "@/lib/jsonld";

// THE FREQUENCY MEGA FOOTER (LIVE-1030). The member shell's footer was one line ("Frequency · Community
// Collective / Help / Settings"). This is the site map the owner asked for: a bar that is always there
// (brand, the full legal row, the contact, a toggle), and a panel above it, closed until the member opens
// it, holding the whole index of the site in columns plus the calls to action.
//
// CLOSED / OPEN. The index is a native <details>, so it works with no script and the links are in the HTML
// for a crawler either way. The bar (brand, quick links, toggle) is its summary; the panel opens under it.
// `MegaFooterLift` publishes how far the OPEN footer rises above the window's bottom edge as `--fq-foot-lift`
// on <html> (0 when closed). The two bottom docks read it, so a closed footer leaves them stuck to the
// window's bottom and an open one lifts them to rest on its top edge. That variable is the contract; nothing
// here positions a dock.
//
// ONE SOURCE. The columns arrive as props from the registry (lib/nav/registry.ts footerColumns, gate-filtered
// by lib/nav/footer-access.ts) and the legal row is lib/nav/legal-links.ts, the list every footer shares, so
// the index cannot drift from the rail. Server component; only the lift is a client island.

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
  quick,
}: {
  columns: readonly MegaColumn[];
  ctas: readonly MegaCta[];
  /** One plain line under the brand in the open panel. */
  tagline: string;
  /** Links that stay in the closed bar next to the brand (Help, Settings). */
  quick?: readonly { label: string; href: string }[];
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="fq-mf" aria-label="Site footer">
      <JsonLd data={siteNavigationSchema(columns)} />
      <details className="fq-mf-d">
        <summary className="fq-mf-bar">
          <span className="fq-mf-brand">Frequency · Community Collective</span>
          {quick && quick.length > 0 && (
            <span className="fq-mf-quick">
              {quick.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </span>
          )}
          <span className="fq-mf-sp" />
          <span className="fq-mf-toggle">
            <span className="fq-mf-open">Site index</span>
            <span className="fq-mf-close">Close index</span>
            <ChevronUp aria-hidden />
          </span>
        </summary>
        <div className="fq-mf-panel">
          <div className="fq-mf-top">
            <div className="fq-mf-lead">
              <p className="fq-mf-line">{tagline}</p>
              <div className="fq-mf-ctas">
                {ctas.map((c) => (
                  <Link
                    key={c.href + c.label}
                    href={c.href}
                    className={c.primary ? "btn pa" : "btn"}
                  >
                    {c.label}
                  </Link>
                ))}
              </div>
            </div>
            <nav className="fq-mf-cols" aria-label="Site index">
              {columns.map((col) => (
                <div key={col.title} className="fq-mf-col">
                  <h2 className="fq-mf-h">{col.title}</h2>
                  <ul>
                    {col.links.map((l) => (
                      <li key={l.href + l.label}>
                        <Link href={l.href}>{l.label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </div>
      </details>
      {/* The legal row is NOT in the panel: policies and the contact are findable with the index shut. */}
      <div className="fq-mf-legal">
        <span>
          &copy; {year} {ORG_LEGAL_NAME}
        </span>
        <nav aria-label="Legal">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.id} href={l.href}>
              {l.label}
            </Link>
          ))}
          <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
        </nav>
      </div>
      <MegaFooterLift />
    </footer>
  );
}
