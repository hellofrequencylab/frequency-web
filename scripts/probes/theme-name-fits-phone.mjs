#!/usr/bin/env node
// LIVE-2189: the theme name on the Nocturne-layout theme pages (/themes/cyberwitch, /themes/wildheart, /themes/bold, /themes/services,
// /themes/new-world) fits its column at every width. At 390 "CyberWitch" at 17cqw measured 414px in a 339px column and was cut to
// "CyberWitc"; at 1280 all three long names ran past their 509px column. The heading now carries --nwf-chars and the sheet caps the size
// at 130cqw per character. Fails on the old tree (no --nwf-chars, flat 17cqw clamp).
import { readFileSync } from "node:fs";

const bad = [];
const css = readFileSync(
  "components/frequency/site/pages/themes/new-world-feature.css",
  "utf8",
);
if (
  !/\.nwf-name\{font-size:min\(clamp\(44px,17cqw,112px\),max\(40px,calc\(130cqw \/ var\(--nwf-chars,8\)\)\)\)/.test(
    css,
  )
)
  bad.push(
    "new-world-feature.css: .nwf-name is not capped per character (130cqw / --nwf-chars)",
  );
for (const f of [
  "components/frequency/site/pages/themes/frequency-theme-feature.tsx",
  "components/frequency/site/pages/themes/frequency-new-world.tsx",
]) {
  const src = readFileSync(f, "utf8");
  if (
    !/className="nwf-h1 nwf-name" style=\{vars\(\{ '--nwf-chars': [^}]+\.length \}\)\}/.test(
      src,
    )
  )
    bad.push(`${f}: the name heading does not set --nwf-chars to its length`);
}
if (bad.length) {
  console.error(bad.join("\n"));
  process.exit(1);
}
console.log("theme-name-fits-phone: ok");
