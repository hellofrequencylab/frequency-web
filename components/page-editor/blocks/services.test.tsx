import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { servicesBlocks } from "./services";
import { SERVICES_CSS } from "@/components/sites/services-css";

const links = {
  origin: "https://frequency.example",
  slug: "house",
  siteBase: "",
  pages: ["home", "book"],
  contactHref: "/contact",
  bookHref: "/book",
  email: null,
};
const draw = (type: string, props: Record<string, unknown> = {}) => {
  const c = servicesBlocks[type];
  return renderToStaticMarkup(
    <>
      {(c.render as (p: Record<string, unknown>) => React.ReactNode)({
        ...c.defaultProps,
        ...props,
        puck: { metadata: { links } },
      })}
    </>,
  );
};

describe("the Services blocks", () => {
  it("draws every block with its defaults and never an empty box", () => {
    for (const type of Object.keys(servicesBlocks)) {
      const html = draw(type);
      expect(html.length, type).toBeGreaterThan(40);
      expect(html, type).not.toContain("undefined");
    }
  });
  it("says so in plain words when a list has no rows", () => {
    for (const type of [
      "ServicesList",
      "ServicesReviews",
      "ServicesEvents",
      "ServicesShop",
      "ServicesPlans",
      "ServicesPosts",
      "ServicesGallery",
      "ServicesTeam",
      "ServicesBooking",
    ]) {
      expect(draw(type), type).toContain("sv-empty");
    }
  });
  it("draws the four hero looks, the booking card and the ticker", () => {
    const offers = [
      { name: "Deep clean", meta: "3 hours", price: "$240", href: "~/book" },
    ];
    for (const look of ["photo", "split", "minimal", "glow"]) {
      const html = draw("ServicesHero", {
        look,
        offers,
        areas: ["Encinitas", "Carlsbad"],
      });
      expect(html).toContain(`sv-hero--${look}`);
      if (look !== "split") expect(html).toContain("Deep clean");
      expect(html).toContain("sv-ticker");
    }
  });
  it("opens a hero photo only through a safe address", () => {
    expect(
      draw("ServicesHero", { look: "photo", image: "javascript:alert(1)" }),
    ).not.toContain("javascript:");
  });
});

describe("the Services skin", () => {
  it("is scoped to the Services site render and reads only Services tokens", () => {
    const rules = SERVICES_CSS.split("\n").filter((l) => /^[^@/\s]/.test(l));
    for (const r of rules)
      expect(
        r.startsWith('[data-house-theme="services"]'),
        r.slice(0, 60),
      ).toBe(true);
    const vars = [...SERVICES_CSS.matchAll(/var\((--[a-z0-9-]+)/g)].map(
      (m) => m[1],
    );
    for (const v of vars) expect(v.startsWith("--sv-"), v).toBe(true);
  });
  it("carries no raw colour, so Day and every accent apply", () => {
    expect(SERVICES_CSS.replace(/%23n/g, "")).not.toMatch(
      /#[0-9a-fA-F]{3,8}\b/,
    );
    expect(SERVICES_CSS).not.toMatch(/rgba?\(/);
  });
  it("lets reduced motion stop the drift and the ticker", () => {
    expect(SERVICES_CSS).toMatch(
      /prefers-reduced-motion:reduce\)\{[^}]*sv-orb/,
    );
  });
});

describe("the Services chrome", () => {
  it("draws every header and footer look from the Space’s own lines", async () => {
    const { ServicesHeader, ServicesFooter } =
      await import("@/components/sites/services-chrome");
    const links = [{ label: "About", href: "/about" }];
    const contact = {
      phone: "(619) 555-0100",
      email: "hi@example.com",
      hours: "Mon to Fri",
      place: "San Diego",
    };
    for (const look of ["bar", "pill", "centered"] as const) {
      const html = renderToStaticMarkup(
        <ServicesHeader
          look={look}
          brandName="Harbor Co"
          homeHref="/"
          links={links}
          contact={contact}
          button={{ label: "Book now", href: "/book" }}
        />,
      );
      expect(html).toContain(`sv-header--${look}`);
      expect(html).toContain("tel:6195550100");
    }
    for (const look of ["full", "minimal"] as const) {
      const html = renderToStaticMarkup(
        <ServicesFooter
          look={look}
          brandName="Harbor Co"
          homeHref="/"
          tagline={null}
          links={links}
          contact={contact}
          button={null}
        />,
      );
      expect(html).toContain("Harbor Co");
    }
  });
});
