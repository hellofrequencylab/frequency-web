import { SITE_DESIGN, type DesignId } from "@/lib/theme/design";
import { loadNunito } from "./load-nunito";

// ── The OG card face, per design (ADR-1737). ──────────────────────────────────────────────
//
// Satori cannot read a CSS variable or a next/font registration, so a card's face is bytes on disk
// (lib/og/load-nunito.ts says why: never fetched). This is the one place a card asks "which face does
// this deploy's design draw cards in", so a design change is an entry here, not an edit per card.
//
// DAWN draws in Nunito (Black for >= 800, Bold otherwise). FREQUENCY has no card face yet: its entry
// falls back to DAWN's until the export names one. When it does, give it its OWN loader module with
// LITERAL `readFile(join(process.cwd(), "public/fonts", "<file>"))` paths, exactly as load-nunito.ts
// does (a parameterised path makes @vercel/nft glob all of public/fonts into every card route), and
// name the files in og-fonts.test.ts / the next.config.ts include keys the same way.

export interface OgDesignFont {
  /** The `fontFamily` a card sets and the `name` it registers the bytes under. */
  family: string;
  /** Bytes for one weight; the loader picks its nearest face. Can reject (see load-nunito.ts). */
  load: (weight: number) => Promise<ArrayBuffer>;
}

const NUNITO: OgDesignFont = { family: "Nunito", load: loadNunito };

export const OG_DESIGN_FONTS: Record<DesignId, OgDesignFont> = {
  dawn: NUNITO,
  // Falls back to DAWN's face until the Frequency export names a card face (see above).
  frequency: NUNITO,
};

/** The card face this deploy's design draws in. */
export const OG_FONT: OgDesignFont = OG_DESIGN_FONTS[SITE_DESIGN];

/** The Satori `fonts` array for the two weights every card uses (900 headline, 700 body). */
export async function loadOgFonts(): Promise<
  { name: string; data: ArrayBuffer; weight: 700 | 900; style: "normal" }[]
> {
  const [black, bold] = await Promise.all([OG_FONT.load(900), OG_FONT.load(700)]);
  return [
    { name: OG_FONT.family, data: black, weight: 900, style: "normal" },
    { name: OG_FONT.family, data: bold, weight: 700, style: "normal" },
  ];
}
