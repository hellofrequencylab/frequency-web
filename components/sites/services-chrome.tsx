import { cls } from "@/components/page-editor/blocks/midnight";

// THE SERVICES CHROME (design: ui_kits/site/Chrome.jsx). The header in three looks (bar, pill, centered) and the footer in two (full,
// minimal), both drawn from a Space's own menu, contact lines and button, so there are no invented links. Server Components, skinned
// by components/sites/services-css.ts. Not mounted yet: the integration change (LIVE-2040) chooses them in components/sites/site-chrome.tsx.

type Link = { label: string; href: string };
type Contact = {
  phone?: string | null;
  email?: string | null;
  hours?: string | null;
  place?: string | null;
};

type ServicesHeaderLook = "bar" | "pill" | "centered";
type ServicesFooterLook = "full" | "minimal";

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

export function ServicesHeader({
  look,
  brandName,
  homeHref,
  links,
  contact,
  button,
  overlay = false,
}: {
  look: ServicesHeaderLook;
  brandName: string;
  homeHref: string;
  links: Link[];
  contact: Contact;
  button: Link | null;
  overlay?: boolean;
}) {
  const nav = (
    <nav className="sv-nav" aria-label="Site">
      {links.map((l) => (
        <a key={`${l.href}:${l.label}`} href={l.href}>
          {l.label}
        </a>
      ))}
    </nav>
  );
  const phone = contact.phone ? (
    <a className="sv-phone" href={telHref(contact.phone)}>
      {contact.phone}
    </a>
  ) : null;
  const cta = button ? (
    <a className="sv-btn sv-btn--accent" href={button.href}>
      {button.label}
    </a>
  ) : null;
  const logo = (
    <a className="sv-logo" href={homeHref}>
      {brandName}
    </a>
  );
  return (
    <header
      className={cls(
        "sv-header",
        `sv-header--${look}`,
        overlay && "sv-header--overlay",
      )}
    >
      {look === "centered" ? (
        <>
          <div className="sv-header-in sv-header-in--centered">
            {phone ?? <span />}
            {logo}
            <div className="sv-header-end">{cta}</div>
          </div>
          <div className="sv-header-nav">{nav}</div>
        </>
      ) : (
        <div className="sv-header-in">
          {logo}
          <div className="sv-header-end">
            {nav}
            {phone}
            {cta}
          </div>
        </div>
      )}
    </header>
  );
}

export function ServicesFooter({
  look,
  brandName,
  homeHref,
  tagline,
  links,
  contact,
  button,
}: {
  look: ServicesFooterLook;
  brandName: string;
  homeHref: string;
  tagline: string | null;
  links: Link[];
  contact: Contact;
  button: Link | null;
}) {
  const lines = [
    contact.phone,
    contact.email,
    contact.hours,
    contact.place,
  ].filter((v): v is string => !!v);
  return (
    <footer className="sv-footer">
      {look === "full" ? (
        <div className="sv-footer-cols">
          <div className="sv-footer-brand">
            <a className="sv-logo" href={homeHref}>
              {brandName}
            </a>
            {tagline && <p>{tagline}</p>}
            {button && (
              <a className="sv-btn sv-btn--accent" href={button.href}>
                {button.label}
              </a>
            )}
          </div>
          {links.length > 0 && (
            <nav className="sv-footer-col" aria-label="Pages">
              <span className="sv-mono">Pages</span>
              {links.map((l) => (
                <a key={`${l.href}:${l.label}`} href={l.href}>
                  {l.label}
                </a>
              ))}
            </nav>
          )}
          {lines.length > 0 && (
            <div className="sv-footer-col">
              <span className="sv-mono">Contact</span>
              {lines.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="sv-footer-min">
          <a className="sv-logo" href={homeHref}>
            {brandName}
          </a>
          <div className="sv-actions">
            {contact.phone && (
              <a className="sv-phone" href={telHref(contact.phone)}>
                {contact.phone}
              </a>
            )}
            {button && (
              <a className="sv-btn sv-btn--accent" href={button.href}>
                {button.label}
              </a>
            )}
          </div>
        </div>
      )}
      <div className="sv-footer-base sv-mono">
        <span>
          © {new Date().getFullYear()} {brandName}
        </span>
        {contact.place && <span>{contact.place}</span>}
      </div>
    </footer>
  );
}
