import Link from "next/link";
import "@/app/themes/active/mega-footer";
import { MegaFooterDialog } from "./mega-footer-dialog";
import { CONTACT_EMAIL, ORG_LEGAL_NAME } from "@/lib/site";
import { JsonLd } from "@/components/json-ld";
import { siteNavigationSchema } from "@/lib/jsonld";

// THE FREQUENCY MEGA FOOTER (LIVE-1030, reworked LIVE-1114). The owner's read of the first cut: loose
// buttons floating across the width, and an index that unrolled under the page. So the footer is now one
// quiet, centred row (the flowing wordmark, one trigger, the copyright) and the whole index opens as a
// pop-up in the middle of the window, dressed like the site header's mega panel: the night stage surface,
// the iridescent rim, the sheen wordmark.
//
// NO SCRIPT NEEDED. The pop-up is a native `popover` the trigger opens with `popovertarget`, so it opens,
// closes on Escape and closes on an outside click with no JavaScript, and its links are in the HTML for a
// crawler either way. `MegaFooterDialog` is the only client island: it adds what a modal owes a keyboard
// and a screen reader (focus into the panel, Tab held inside, the page held still, focus handed back) and
// closes the panel when one of its links navigates.
//
// ONE SOURCE. The columns arrive as props from the registry (lib/nav/registry.ts footerColumns, gate-filtered
// by lib/nav/footer-access.ts). Their Legal column is lib/nav/legal-links.ts, the list every footer shares,
// so the policies sit in the grid with the rest of the index (LIVE-1095) and the index cannot drift from the
// rail. The last row is the copyright, Settings and the contact. Server component.

export interface MegaColumn {
  title: string;
  links: { label: string; href: string }[];
}

export interface MegaCta {
  label: string;
  href: string;
  /** The one primary action wears the iridescent pill. */
  primary?: boolean;
}

const POP_ID = "fq-mf-pop";
const TITLE_ID = "fq-mf-title";
/** A column longer than this lays its links out in two runs, so one long list does not set the height. */
const WIDE_AT = 7;

export function FqMegaFooter({
  columns,
  ctas,
  tagline,
  quick,
}: {
  columns: readonly MegaColumn[];
  ctas: readonly MegaCta[];
  /** One plain line beside the calls to action in the pop-up. */
  tagline: string;
  /** Account links for the pop-up's last row (Settings). */
  quick?: readonly { label: string; href: string }[];
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="fq-mf" aria-label="Site footer">
      <JsonLd data={siteNavigationSchema(columns)} />
      <div className="fq-mf-bar">
        <button
          type="button"
          className="fq-mf-trig"
          popoverTarget={POP_ID}
          aria-haspopup="dialog"
          aria-controls={POP_ID}
        >
          <span className="fq-mf-orb" aria-hidden />
          Site index
          <svg className="fq-mf-chev" viewBox="0 0 12 12" aria-hidden>
            <path d="M3 7.5 6 4.5l3 3" />
          </svg>
        </button>
        <span className="fq-mf-sig">
          <span className="fq-mf-logo fq-logo-flow" aria-hidden />
          <span className="fq-mf-copy">
            &copy; {year} {ORG_LEGAL_NAME}
          </span>
        </span>
      </div>

      <div
        id={POP_ID}
        className="fq-mf-pop"
        popover="auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        data-surface="stage"
      >
        <div className="fq-mf-head">
          <span className="fq-mf-mark" role="img" aria-label="Frequency Community Collective" />
          <h2 id={TITLE_ID} className="fq-mf-k">
            Site index
          </h2>
          <button
            type="button"
            className="fq-mf-x"
            popoverTarget={POP_ID}
            popoverTargetAction="hide"
            aria-label="Close site index"
          >
            <svg viewBox="0 0 12 12" aria-hidden>
              <path d="m3 3 6 6M9 3 3 9" />
            </svg>
          </button>
        </div>

        <div className="fq-mf-body">
          <nav className="fq-mf-cols" aria-label="Site index">
            {columns.map((col) => (
              <div
                key={col.title}
                className="fq-mf-col"
                data-wide={col.links.length > WIDE_AT ? "" : undefined}
              >
                <h3 className="fq-mf-k">{col.title}</h3>
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

          <div className="fq-mf-foot">
            <p className="fq-mf-line">{tagline}</p>
            <div className="fq-mf-ctas">
              {ctas.map((c) => (
                <Link
                  key={c.href + c.label}
                  href={c.href}
                  className={c.primary ? "btn fq-iri-btn" : "btn fq-mf-ghost"}
                >
                  {c.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="fq-mf-legal">
            <span className="fq-mf-acct">
              <span>
                &copy; {year} {ORG_LEGAL_NAME}
              </span>
              {quick?.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </span>
            <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
          </div>
        </div>
      </div>
      <MegaFooterDialog id={POP_ID} />
    </footer>
  );
}
