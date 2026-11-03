import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { InlineText } from "@/components/sites/inline-text";
import {
  LINK_HINT,
  VOICE_HINT,
  area,
  arr,
  block,
  cls,
  hrefOf,
  image,
  img,
  rel,
  str,
  text,
  type Common,
  type Props,
} from "./midnight";
import type { ComponentConfig } from "@/lib/page-editor/types";
import type { SiteLinkMap } from "@/lib/sites/house-theme";
import { ServicesQuoteForm } from "@/components/sites/services-quote-lazy";

// ── The Services block family (Services design system, "Website" kit: ui_kits/site/Sections.jsx and Blocks.jsx) ───────────────
// One registered block per section of the design's Home: hero (four looks), trust bar, story, services, steps, reviews, FAQ and the
// closing band, then the function blocks the kit turns on (booking, events, shop, plans, posts, gallery, team, locations, contact,
// newsletter). Server Components. Every look is the Services skin's (components/sites/services-css.ts), tokens only. A list block with
// no rows says so in its own words and never draws an empty box. Not registered anywhere yet: the integration change (LIVE-2040)
// adds it to the page editor with the rest of the theme.

const ORB = {
  a: ["-10%", "30%", 480, ""],
  b: ["70%", "-20%", 420, "sea"],
  c: ["60%", "-20%", 420, "gold"],
} as const;
type OrbKey = keyof typeof ORB;

function Orb({ at }: { at: OrbKey }) {
  const [x, y, s, tone] = ORB[at];
  return (
    <i
      aria-hidden="true"
      className={cls("sv-orb", tone && `sv-orb--${tone}`)}
      style={{ left: x, top: y, width: s, height: s }}
    />
  );
}

type Look = "aurora" | "depth" | "sky" | "ink";

function Section({
  look,
  orb,
  id,
  pad,
  vis,
  className,
  children,
}: {
  look: Look;
  orb?: OrbKey;
  id?: string;
  pad?: string;
  vis?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cls("sv-sec", `sv-sec--${look}`, className, pad, vis)}
    >
      {orb && <Orb at={orb} />}
      {children}
    </section>
  );
}

function Btn({
  label,
  href,
  kind = "accent",
  metadata,
  lg = false,
  arrow = false,
}: {
  label: string;
  href: string;
  kind?: "accent" | "secondary";
  metadata?: Props;
  lg?: boolean;
  arrow?: boolean;
}) {
  const to = label ? hrefOf(href, metadata) : null;
  if (!to) return null;
  return (
    <a
      className={cls("sv-btn", `sv-btn--${kind}`, lg && "sv-btn--lg")}
      href={to}
      {...rel(to)}
    >
      <span>{label}</span>
      {arrow && <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />}
    </a>
  );
}

function Stars() {
  return (
    <span className="sv-stars" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg
          key={i}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
        </svg>
      ))}
    </span>
  );
}

/** The section head: an index and label, the title with its italic, a line under it, and an optional button beside it. */
function Head({
  p,
  index,
  action,
}: {
  p: Props;
  index?: string;
  action?: ReactNode;
}) {
  if (!str(p.eyebrow) && !str(p.title) && !str(p.lede)) return null;
  return (
    <div className="sv-head">
      <div className="sv-head-copy">
        {str(p.eyebrow) && (
          <span className="sv-eyebrow">
            {index && <b>{index}</b>}
            {str(p.eyebrow)}
          </span>
        )}
        {str(p.title) && (
          <h2 className="sv-display">
            <InlineText text={str(p.title)} />
          </h2>
        )}
        {str(p.lede) && <p className="sv-lede">{str(p.lede)}</p>}
      </div>
      {action}
    </div>
  );
}

function Photo({
  src,
  alt,
  shape,
  caption,
}: {
  src: string | null;
  alt: string;
  shape?: "wide" | "sq";
  caption?: string;
}) {
  return (
    <figure className={cls("sv-photo", shape && `sv-photo--${shape}`)}>
      <div className="sv-dotgrid" aria-hidden="true" />
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
        <img src={src} alt={alt} loading="lazy" />
      )}
      {!src && caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

function Empty({ what }: { what: string }) {
  return (
    <div className="sv-empty">
      No {what} yet. Add the first one and it appears here.
    </div>
  );
}

const mono = (n: number) => String(n + 1).padStart(2, "0");

// ── Home sections ───────────────────────────────────────────────────────────────────────────

function Hero({ p, metadata, pad, vis }: Common) {
  const look = ["photo", "split", "minimal", "glow"].includes(str(p.look))
    ? str(p.look)
    : "photo";
  const offers = arr(p.offers);
  const hoods = Array.isArray(p.areas)
    ? (p.areas as unknown[]).map(str).filter(Boolean)
    : [];
  const src = img(p.image);
  const copy = (
    <div className="sv-hero-copy">
      {str(p.eyebrow) && <span className="sv-eyebrow">{str(p.eyebrow)}</span>}
      <h1 className="sv-display">
        <InlineText text={str(p.title)} />
      </h1>
      {str(p.lead) && <p className="sv-hero-lead">{str(p.lead)}</p>}
      <div className="sv-actions">
        <Btn
          label={str(p.primaryLabel)}
          href={str(p.primaryHref)}
          metadata={metadata}
          lg
          arrow
        />
        <Btn
          label={str(p.secondaryLabel)}
          href={str(p.secondaryHref)}
          metadata={metadata}
          kind="secondary"
          lg
        />
      </div>
      {str(p.proof) && (
        <div className="sv-proof">
          <Stars />
          <span>{str(p.proof)}</span>
        </div>
      )}
    </div>
  );
  const panel = offers.length > 0 && (
    <div className="sv-panel">
      <div className="sv-panel-top">
        <span>{str(p.panelTitle) || "Book online"}</span>
        <span>
          <i />
          {str(p.panelNote) || "Open now"}
        </span>
      </div>
      {offers.map((o, i) => {
        const to = hrefOf(str(o.href), metadata);
        const inner = (
          <>
            <span>
              <b>{str(o.name)}</b>
              <small>{str(o.meta)}</small>
            </span>
            <em>{str(o.price)}</em>
          </>
        );
        return to ? (
          <a key={i} className="sv-panel-row" href={to} {...rel(to)}>
            {inner}
          </a>
        ) : (
          <div key={i} className="sv-panel-row">
            {inner}
          </div>
        );
      })}
    </div>
  );
  return (
    <section className={cls("sv-hero", `sv-hero--${look}`, pad, vis)}>
      <div
        className={cls(
          "sv-hero-bg",
          look === "photo" && src && "sv-hero-bg--photo",
        )}
        style={
          look === "photo" && src
            ? { backgroundImage: `url(${JSON.stringify(src)})` }
            : undefined
        }
        aria-hidden="true"
      />
      {look !== "minimal" && <Orb at="a" />}
      <div className="sv-hero-in">
        {copy}
        {look === "split" ? (
          <Photo src={src} alt={str(p.alt)} caption="Your work in action" />
        ) : (
          look !== "minimal" && panel
        )}
      </div>
      {look === "minimal" && panel && (
        <div className="sv-hero-quick">
          {offers.map((o, i) => (
            <div key={i} className="sv-panel-row">
              <span>
                <b>{str(o.name)}</b>
                <small>{str(o.meta)}</small>
              </span>
              <em>{str(o.price)}</em>
            </div>
          ))}
        </div>
      )}
      {hoods.length > 0 && (
        <div className="sv-ticker" aria-hidden="true">
          <div className="sv-ticker-track">
            {[...hoods, ...hoods].map((h, i) => (
              <span key={i}>{h}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Trust({ p, pad, vis }: Common) {
  const items = arr(p.items);
  if (items.length === 0) return null;
  return (
    <section className={cls("sv-sec sv-sec--depth", pad, vis)}>
      <div className="sv-trust">
        {items.map((t, i) => (
          <div key={i} className="sv-trust-item">
            <i className="sv-tile" aria-hidden="true">
              {mono(i)}
            </i>
            <span>
              <b>{str(t.title)}</b>
              <small>{str(t.line)}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Story({ p, metadata, pad, vis }: Common) {
  const paras = Array.isArray(p.paragraphs)
    ? (p.paragraphs as unknown[]).map(str).filter(Boolean)
    : [];
  return (
    <Section look="aurora" orb="b" id="about" pad={pad} vis={vis}>
      <div className="sv-wrap sv-split">
        <div className="sv-story-copy">
          {str(p.eyebrow) && (
            <span className="sv-eyebrow">
              <b>01</b>
              {str(p.eyebrow)}
            </span>
          )}
          <h2 className="sv-display">
            <InlineText text={str(p.title)} />
          </h2>
          {paras.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
          <Btn
            label={str(p.buttonLabel)}
            href={str(p.buttonHref)}
            metadata={metadata}
            kind="secondary"
            arrow
          />
        </div>
        <Photo src={img(p.image)} alt={str(p.alt)} caption="The team at work" />
      </div>
    </Section>
  );
}

function Services({ p, metadata, pad, vis }: Common) {
  const rows = arr(p.rows);
  return (
    <Section look="sky" orb="a" id="services" pad={pad} vis={vis}>
      <div className="sv-wrap">
        <Head
          p={p}
          index="02"
          action={
            <Btn
              label={str(p.buttonLabel)}
              href={str(p.buttonHref)}
              metadata={metadata}
              kind="secondary"
              arrow
            />
          }
        />
        <div className="sv-grid">
          {rows.length === 0 && <Empty what="services" />}
          {rows.map((r, i) => {
            const to = hrefOf(str(r.href), metadata);
            const inner = (
              <>
                <i className="sv-tile" aria-hidden="true">
                  {mono(i)}
                </i>
                {str(r.meta) && <span className="sv-mono">{str(r.meta)}</span>}
                <h3>{str(r.name)}</h3>
                {str(r.body) && <p>{str(r.body)}</p>}
                {str(r.price) && (
                  <span className="sv-price">{str(r.price)}</span>
                )}
              </>
            );
            return to ? (
              <a key={i} className="sv-card" href={to} {...rel(to)}>
                {inner}
              </a>
            ) : (
              <div key={i} className="sv-card">
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function Steps({ p, pad, vis }: Common) {
  const rows = arr(p.rows);
  return (
    <Section look="depth" orb="c" id="process" pad={pad} vis={vis}>
      <div className="sv-pinstripe" aria-hidden="true" />
      <div className="sv-wrap">
        <Head p={p} index="03" />
        {rows.length === 0 ? (
          <Empty what="steps" />
        ) : (
          <div className="sv-steps">
            {rows.map((r, i) => (
              <div key={i} className="sv-step">
                <span className="sv-step-num">{mono(i)}</span>
                <h3>{str(r.title)}</h3>
                <p>{str(r.body)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

function Reviews({ p, pad, vis }: Common) {
  const rows = arr(p.rows);
  return (
    <Section look="ink" orb="b" id="reviews" pad={pad} vis={vis}>
      <div className="sv-wrap">
        <Head
          p={p}
          index="04"
          action={
            str(p.proof) ? (
              <span className="sv-proof">
                <Stars />
                <span className="sv-mono">{str(p.proof)}</span>
              </span>
            ) : undefined
          }
        />
        <div className="sv-grid">
          {rows.length === 0 && <Empty what="reviews" />}
          {rows.map((r, i) => (
            <figure key={i} className="sv-quote">
              <Stars />
              <blockquote>“{str(r.quote)}”</blockquote>
              <figcaption>
                <b>{str(r.who)}</b>
                <span>{str(r.what)}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Faq({ p, pad, vis }: Common) {
  const rows = arr(p.rows);
  const facts = arr(p.facts);
  const hoods = Array.isArray(p.areas)
    ? (p.areas as unknown[]).map(str).filter(Boolean)
    : [];
  return (
    <Section look="aurora" orb="a" id="faq" pad={pad} vis={vis}>
      <div className="sv-wrap sv-split">
        <div className="sv-story-copy">
          <Head p={p} index="05" />
          {facts.length > 0 && (
            <div className="sv-facts">
              {facts.map((f, i) => (
                <span key={i}>{str(f.label)}</span>
              ))}
            </div>
          )}
          {hoods.length > 0 && (
            <div className="sv-chips">
              {hoods.map((h, i) => (
                <span key={i}>{h}</span>
              ))}
            </div>
          )}
        </div>
        <div className="sv-faq">
          {rows.length === 0 && <Empty what="questions" />}
          {rows.map((r, i) => (
            <details key={i}>
              <summary>{str(r.question)}</summary>
              <p>{str(r.answer)}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Band({ p, metadata, pad, vis }: Common) {
  return (
    <Section look="ink" orb="c" pad={pad} vis={vis} className="sv-band">
      <div className="sv-pinstripe" aria-hidden="true" />
      <div className="sv-wrap">
        {str(p.eyebrow) && <span className="sv-eyebrow">{str(p.eyebrow)}</span>}
        <h2 className="sv-display">
          <InlineText text={str(p.title)} />
        </h2>
        <div className="sv-actions">
          <Btn
            label={str(p.primaryLabel)}
            href={str(p.primaryHref)}
            metadata={metadata}
            lg
            arrow
          />
          <Btn
            label={str(p.secondaryLabel)}
            href={str(p.secondaryHref)}
            metadata={metadata}
            kind="secondary"
            lg
          />
        </div>
      </div>
    </Section>
  );
}

// ── The function blocks ─────────────────────────────────────────────────────────────────────

function Booking({ p, metadata, pad, vis }: Common) {
  const rows = arr(p.rows);
  return (
    <Section look="depth" orb="b" id="booking" pad={pad} vis={vis}>
      <div className="sv-wrap sv-split">
        <div className="sv-story-copy">
          <Head p={p} />
          <Btn
            label={str(p.buttonLabel)}
            href={str(p.buttonHref)}
            metadata={metadata}
            arrow
          />
        </div>
        <div className="sv-list">
          {rows.length === 0 && <Empty what="openings" />}
          {rows.map((r, i) => {
            const to = hrefOf(str(r.href) || str(p.buttonHref), metadata);
            const inner = (
              <>
                <span className="sv-day">{str(r.day)}</span>
                <span>
                  <b>{str(r.title)}</b>
                  <span>{str(r.meta)}</span>
                </span>
                <span className="sv-mono">{str(r.time)}</span>
              </>
            );
            return to ? (
              <a key={i} className="sv-row" href={to} {...rel(to)}>
                {inner}
              </a>
            ) : (
              <div key={i} className="sv-row">
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

/** One shared body for the five card-list blocks: a head, a grid of cards (photo, mono line, name, body, price), an empty line. */
function Cards({
  p,
  metadata,
  pad,
  vis,
  id,
  look,
  index,
  what,
  min,
  photo,
}: Common & {
  id: string;
  look: Look;
  index: string;
  what: string;
  min: number;
  photo?: boolean;
}) {
  const rows = arr(p.rows);
  return (
    <Section look={look} id={id} pad={pad} vis={vis}>
      <div className="sv-wrap">
        <Head
          p={p}
          index={index}
          action={
            <Btn
              label={str(p.buttonLabel)}
              href={str(p.buttonHref)}
              metadata={metadata}
              kind="secondary"
              arrow
            />
          }
        />
        <div className="sv-grid" style={{ ["--sv-min" as string]: `${min}px` }}>
          {rows.length === 0 && <Empty what={what} />}
          {rows.map((r, i) => {
            const to = hrefOf(str(r.href), metadata);
            const inner = (
              <>
                {photo && (
                  <Photo src={img(r.image)} alt={str(r.alt)} shape="wide" />
                )}
                {str(r.meta) && <span className="sv-mono">{str(r.meta)}</span>}
                <h3>{str(r.title)}</h3>
                {str(r.body) && <p>{str(r.body)}</p>}
                {str(r.price) && (
                  <span className="sv-price">{str(r.price)}</span>
                )}
              </>
            );
            return to ? (
              <a
                key={i}
                className={cls(
                  "sv-card",
                  r.featured === true && "sv-card--lit",
                )}
                href={to}
                {...rel(to)}
              >
                {inner}
              </a>
            ) : (
              <div
                key={i}
                className={cls(
                  "sv-card",
                  r.featured === true && "sv-card--lit",
                )}
              >
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function Gallery({ p, pad, vis }: Common) {
  const rows = arr(p.rows);
  return (
    <Section look="ink" id="gallery" pad={pad} vis={vis}>
      <div className="sv-wrap">
        <Head p={p} index="09" />
        {rows.length === 0 ? (
          <Empty what="photos" />
        ) : (
          <div className="sv-mosaic">
            {rows.map((r, i) => (
              <Photo
                key={i}
                src={img(r.image)}
                alt={str(r.alt)}
                caption={str(r.alt)}
              />
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

function Team({ p, pad, vis }: Common) {
  const rows = arr(p.rows);
  return (
    <Section look="depth" id="team" pad={pad} vis={vis}>
      <div className="sv-wrap">
        <Head p={p} index="10" />
        <div className="sv-grid" style={{ ["--sv-min" as string]: "200px" }}>
          {rows.length === 0 && <Empty what="team members" />}
          {rows.map((r, i) => (
            <figure key={i} className="sv-people">
              <Photo
                src={img(r.image)}
                alt={str(r.alt) || str(r.name)}
                caption={str(r.name)}
              />
              <figcaption>
                <b>{str(r.name)}</b>
                <span>{str(r.role)}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Locations({ p, pad, vis }: Common) {
  const hours = arr(p.hours);
  const areas = Array.isArray(p.areas)
    ? (p.areas as unknown[]).map(str).filter(Boolean)
    : [];
  const facts = [str(p.address), str(p.phone), str(p.email)].filter(Boolean);
  return (
    <Section look="aurora" id="locations" pad={pad} vis={vis}>
      <div className="sv-wrap sv-split">
        <div className="sv-story-copy">
          <Head p={p} index="11" />
          {facts.length > 0 && (
            <div className="sv-facts">
              {facts.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </div>
          )}
          {hours.length > 0 && (
            <dl className="sv-hours">
              {hours.map((h, i) => (
                <div key={i} style={{ display: "contents" }}>
                  <dt>{str(h.day)}</dt>
                  <dd>{str(h.hours)}</dd>
                </div>
              ))}
            </dl>
          )}
          {areas.length > 0 && (
            <div className="sv-chips">
              {areas.map((a) => (
                <span key={a}>{a}</span>
              ))}
            </div>
          )}
        </div>
        <Photo
          src={img(p.image)}
          alt={str(p.alt)}
          shape="wide"
          caption="Map · service area"
        />
      </div>
    </Section>
  );
}

function Contact({ p, metadata, pad, vis }: Common) {
  return (
    <Section look="ink" orb="b" id="forms" pad={pad} vis={vis}>
      <div className="sv-wrap sv-split">
        <Head p={p} index="12" />
        <div className="sv-card">
          {str(p.body) && <p>{str(p.body)}</p>}
          <div className="sv-actions">
            <Btn
              label={str(p.buttonLabel)}
              href={str(p.buttonHref)}
              metadata={metadata}
              arrow
            />
            <Btn
              label={str(p.secondaryLabel)}
              href={str(p.secondaryHref)}
              metadata={metadata}
              kind="secondary"
            />
          </div>
        </div>
      </div>
    </Section>
  );
}

function Letter({ p, metadata, pad, vis }: Common) {
  return (
    <Section look="depth" id="letter" pad={pad} vis={vis}>
      <div className="sv-wrap sv-center">
        {str(p.eyebrow) && <span className="sv-eyebrow">{str(p.eyebrow)}</span>}
        <h2 className="sv-display">
          <InlineText text={str(p.title)} />
        </h2>
        {str(p.lede) && <p className="sv-lede">{str(p.lede)}</p>}
        <Btn
          label={str(p.buttonLabel)}
          href={str(p.buttonHref)}
          metadata={metadata}
          arrow
        />
      </div>
    </Section>
  );
}

function Quote({ p, metadata, pad, vis }: Common) {
  const slug = (metadata?.links as SiteLinkMap | undefined)?.slug ?? null;
  const lines = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(str).filter(Boolean) : []);
  return (
    <Section look="aurora" orb="a" id="quote" pad={pad} vis={vis}>
      <div className="sv-wrap sv-qf">
        <div className="sv-qf-copy">
          <Head p={p} />
          {img(p.image) && <Photo src={img(p.image)} alt={str(p.alt)} shape="wide" />}
        </div>
        <ServicesQuoteForm
          slug={slug}
          services={lines(p.services)}
          frequencies={lines(p.frequencies)}
          propertyTypes={lines(p.propertyTypes)}
          sizes={lines(p.sizes)}
          submitLabel={str(p.submitLabel)}
          successTitle={str(p.successTitle)}
          successBody={str(p.successBody)}
        />
      </div>
    </Section>
  );
}

// ── Registry ────────────────────────────────────────────────────────────────────────────────

const links = (n: string, label = "Button") => ({
  [`${n}Label`]: text(label),
  [`${n}Href`]: text(`${label}: where it goes`, LINK_HINT),
});
const head = {
  eyebrow: text("Small label"),
  title: area("Heading", VOICE_HINT),
  lede: area("Line under the heading"),
};
const rows = (fields: Record<string, unknown>) =>
  ({
    type: "array",
    label: "Rows",
    arrayFields: fields,
    getItemSummary: (it: Props) =>
      str(it.title) || str(it.name) || str(it.question) || str(it.who) || "Row",
  }) as const;
const list = (label: string) =>
  ({
    type: "array",
    label,
    arrayFields: {},
    getItemSummary: (it: unknown) => String(it),
  }) as const;
const card = {
  meta: text("Small line"),
  title: text("Title"),
  body: area("Line"),
  price: text("Price"),
  href: text("Link", LINK_HINT),
};
const photoCard = { ...card, image, alt: text("Photo description") };
const featured = {
  featured: {
    type: "radio",
    label: "Highlight",
    options: [
      { label: "No", value: false },
      { label: "Yes", value: true },
    ],
  },
} as const;

export const servicesBlocks: Record<string, ComponentConfig> = {
  ServicesHero: block(
    "Services hero",
    {
      look: {
        type: "select",
        label: "Look",
        options: [
          { label: "Photo", value: "photo" },
          { label: "Split", value: "split" },
          { label: "Minimal", value: "minimal" },
          { label: "Glow", value: "glow" },
        ],
      },
      eyebrow: text("Small label"),
      title: area("Heading", VOICE_HINT),
      lead: area("Line under the heading"),
      ...links("primary", "Main button"),
      ...links("secondary", "Second button"),
      proof: text("Proof line", "Like 4.9 from 212 reviews."),
      image,
      alt: text("Photo description"),
      panelTitle: text("Booking card title"),
      panelNote: text("Booking card note"),
      offers: rows({
        name: text("Name"),
        meta: text("Duration"),
        price: text("Price"),
        href: text("Link", LINK_HINT),
      }),
      areas: list("Areas for the ticker"),
    },
    {
      look: "photo",
      eyebrow: "Locally owned",
      title: "Done right, *on time.*",
      lead: "Tell us what you need and pick a time. We show up, do the work and leave the place cleaner than we found it.",
      primaryLabel: "Book now",
      primaryHref: "~/book",
      secondaryLabel: "Call us",
      secondaryHref: "",
      proof: "",
      image: "",
      alt: "",
      panelTitle: "Book online",
      panelNote: "Open now",
      offers: [],
      areas: [],
    },
    Hero,
  ),
  ServicesTrust: block(
    "Services trust bar",
    { items: rows({ title: text("Title"), line: text("Line") }) },
    {
      items: [
        { title: "Licensed and insured", line: "Every job, every time" },
        { title: "Rated 5 stars", line: "By people near you" },
        { title: "Clear prices", line: "Quoted before we start" },
        { title: "On time", line: "Or we call ahead" },
      ],
    },
    Trust,
  ),
  ServicesStory: block(
    "Services story",
    {
      eyebrow: text("Small label"),
      title: area("Heading", VOICE_HINT),
      paragraphs: list("Paragraphs"),
      ...links("button"),
      image,
      alt: text("Photo description"),
    },
    {
      eyebrow: "Our story",
      title: "Small team. *Big on care.*",
      paragraphs: [
        "We started with one van and a simple promise: do the job properly and be easy to deal with.",
      ],
      buttonLabel: "Meet the team",
      buttonHref: "~/about",
      image: "",
      alt: "",
    },
    Story,
  ),
  ServicesList: block(
    "Services list",
    {
      ...head,
      ...links("button"),
      rows: rows({
        meta: text("Duration"),
        name: text("Name"),
        body: area("Line"),
        price: text("Price"),
        href: text("Link", LINK_HINT),
      }),
    },
    {
      eyebrow: "Services",
      title: "What we *do.*",
      lede: "Pick the one that fits and book it in a minute.",
      buttonLabel: "All services",
      buttonHref: "~/services",
      rows: [],
    },
    Services,
  ),
  ServicesSteps: block(
    "Services steps",
    { ...head, rows: rows({ title: text("Title"), body: area("Line") }) },
    {
      eyebrow: "How it works",
      title: "Three steps. *No surprises.*",
      lede: "",
      rows: [
        { title: "Tell us", body: "Pick a service and a time that suits you." },
        {
          title: "We show up",
          body: "On time, in uniform, with everything we need.",
        },
        {
          title: "You are done",
          body: "Pay when you are happy with the work.",
        },
      ],
    },
    Steps,
  ),
  ServicesReviews: block(
    "Services reviews",
    {
      ...head,
      proof: text("Proof line"),
      rows: rows({
        quote: area("Review"),
        who: text("Name"),
        what: text("Job"),
      }),
    },
    {
      eyebrow: "Reviews",
      title: "Kind words, *in their own.*",
      lede: "",
      proof: "",
      rows: [],
    },
    Reviews,
  ),
  ServicesFaq: block(
    "Services questions",
    {
      ...head,
      rows: rows({ question: text("Question"), answer: area("Answer") }),
      facts: rows({ label: text("Line, like a phone number or hours") }),
      areas: list("Areas we cover"),
    },
    {
      eyebrow: "Questions",
      title: "Asked *often.*",
      lede: "The short answers. Call if yours is not here.",
      rows: [],
      facts: [],
      areas: [],
    },
    Faq,
  ),
  ServicesBand: block(
    "Services closing band",
    {
      eyebrow: text("Small label"),
      title: area("Heading", VOICE_HINT),
      ...links("primary", "Main button"),
      ...links("secondary", "Second button"),
    },
    {
      eyebrow: "Next opening",
      title: "Ready when *you are.*",
      primaryLabel: "Book now",
      primaryHref: "~/book",
      secondaryLabel: "",
      secondaryHref: "",
    },
    Band,
  ),
  ServicesBooking: block(
    "Services booking",
    {
      ...head,
      ...links("button"),
      rows: rows({
        day: text("Day"),
        title: text("Title"),
        meta: text("Line"),
        time: text("Time"),
        href: text("Link", LINK_HINT),
      }),
    },
    {
      eyebrow: "Book online",
      title: "Next *openings.*",
      lede: "Live availability. Pick a time, see the total, get a confirmation.",
      buttonLabel: "Book now",
      buttonHref: "~/book",
      rows: [],
    },
    Booking,
  ),
  ServicesEvents: block(
    "Services events",
    { ...head, ...links("button"), rows: rows({ ...card, ...featured }) },
    {
      eyebrow: "Events",
      title: "Coming *up.*",
      lede: "",
      buttonLabel: "",
      buttonHref: "",
      rows: [],
    },
    (a) => (
      <Cards
        {...a}
        id="events"
        look="aurora"
        index="05"
        what="events"
        min={300}
      />
    ),
  ),
  ServicesShop: block(
    "Services shop",
    { ...head, ...links("button"), rows: rows(photoCard) },
    {
      eyebrow: "Shop",
      title: "Take some *home.*",
      lede: "",
      buttonLabel: "Open the shop",
      buttonHref: "~/shop",
      rows: [],
    },
    (a) => (
      <Cards
        {...a}
        id="shop"
        look="sky"
        index="06"
        what="products"
        min={240}
        photo
      />
    ),
  ),
  ServicesPlans: block(
    "Services plans",
    { ...head, rows: rows({ ...card, ...featured }) },
    {
      eyebrow: "Plans",
      title: "Stay *covered.*",
      lede: "Pause, change or cancel from your account any time.",
      rows: [],
    },
    (a) => (
      <Cards {...a} id="plans" look="depth" index="07" what="plans" min={260} />
    ),
  ),
  ServicesPosts: block(
    "Services posts",
    { ...head, ...links("button"), rows: rows(photoCard) },
    {
      eyebrow: "Notes",
      title: "Worth *a read.*",
      lede: "",
      buttonLabel: "All posts",
      buttonHref: "~/blog",
      rows: [],
    },
    (a) => (
      <Cards
        {...a}
        id="posts"
        look="aurora"
        index="08"
        what="posts"
        min={240}
      />
    ),
  ),
  ServicesGallery: block(
    "Services gallery",
    { ...head, rows: rows({ image, alt: text("Photo description") }) },
    { eyebrow: "Our work", title: "See for *yourself.*", lede: "", rows: [] },
    Gallery,
  ),
  ServicesTeam: block(
    "Services team",
    {
      ...head,
      rows: rows({
        name: text("Name"),
        role: text("Role"),
        image,
        alt: text("Photo description"),
      }),
    },
    { eyebrow: "The team", title: "Who turns *up.*", lede: "", rows: [] },
    Team,
  ),
  ServicesLocations: block(
    "Services locations and hours",
    {
      ...head,
      address: text("Address"),
      phone: text("Phone"),
      email: text("Email"),
      hours: rows({ day: text("Days"), hours: text("Hours") }),
      areas: list("Areas we cover"),
      image,
      alt: text("Map picture description"),
    },
    {
      eyebrow: "Locations and hours",
      title: "Find *us.*",
      lede: "",
      address: "",
      phone: "",
      email: "",
      hours: [],
      areas: [],
      image: "",
      alt: "",
    },
    Locations,
  ),
  ServicesContact: block(
    "Services contact",
    {
      ...head,
      body: area("Line in the card"),
      ...links("button"),
      ...links("secondary", "Second button"),
    },
    {
      eyebrow: "Get in touch",
      title: "Ask us *anything.*",
      lede: "We reply within a day.",
      body: "",
      buttonLabel: "Send a message",
      buttonHref: "~/contact",
      secondaryLabel: "",
      secondaryHref: "",
    },
    Contact,
  ),
  ServicesQuote: block(
    "Services quote form",
    {
      ...head,
      image,
      alt: text("Photo description"),
      services: list("Services to choose from"),
      frequencies: list("How often choices"),
      propertyTypes: list("Property types"),
      sizes: list("Size choices"),
      submitLabel: text("Send button"),
      successTitle: text("Thank-you heading"),
      successBody: area("Thank-you line"),
    },
    {
      eyebrow: "Free quote",
      title: "Tell us about *your place.*",
      lede: "Three quick steps. We reply with your quote, usually the same day.",
      image: "",
      alt: "",
      services: ["Window washing", "Solar panels"],
      frequencies: ["One time", "Quarterly", "Let us plan it"],
      propertyTypes: ["Single-story home", "Two-story home", "Townhome or condo", "Small business"],
      sizes: ["Under 15", "15 to 30", "30 to 50", "50 or more", "Not sure"],
      submitLabel: "Send request",
      successTitle: "You are on the books.",
      successBody: "We will call or text within one business day to confirm your visit and a firm price.",
    },
    Quote,
  ),
  ServicesLetter: block(
    "Services newsletter",
    {
      eyebrow: text("Small label"),
      title: area("Heading", VOICE_HINT),
      lede: area("Line under the heading"),
      ...links("button"),
    },
    {
      eyebrow: "Newsletter",
      title: "Good news, *now and then.*",
      lede: "Seasonal tips and the odd offer. Never more than you want.",
      buttonLabel: "Join the list",
      buttonHref: "~/contact",
    },
    Letter,
  ),
};
