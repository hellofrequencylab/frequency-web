"use client";

// THE PRICING CALCULATOR (design handoff "Pricing calculator", 2026-10-21 revision): a step-locked walk through
// the seven tiers (Visitor, Member, Crew, Free Space, Business, Collective, Network) and a final plan picker. A
// "galaxy" of orbs, photo discs and dots morphs between tiers; a dock at the bottom pitches the tier you are on
// and, on a Space tier, folds open into a short setup that hands off to Create a Space.
//
// 🔴 NOTHING HERE IS TYPED MONEY. Every price, struck price and fee line arrives in `model`
// (calculator-model.ts), read off the Offering model and the catalog. This file only lays them out.
//
// HOW IT STAYS FAST. The galaxy's positions live OUTSIDE React state: one requestAnimationFrame loop writes
// styles straight to the node elements (the prototype re-rendered per frame and froze). React state holds only
// what changes the words: the step you are on, the billing switch, the Non Profit switch, the Space name.
//
// HOW IT MOVES. One wheel notch, one swipe, one arrow key or one Back / Next press is exactly one step; the page
// holds still while the stage is lined up on screen. Two kind exceptions to the prototype, so the page is never a
// trap: the first step lets you scroll up and the last lets you scroll down, and "Skip the walk-through" jumps
// past it. Reduced motion turns off the float, orbit and lag and jumps instead of gliding.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/field";
import { operatorStartHref } from "@/lib/site";
import {
  intentsForPicks,
  type CalcModel,
  type CalcPrice,
  type CalcStep,
  type CalcStepId,
} from "./calculator-model";

const STEPS = [
  "visitor",
  "member",
  "crew",
  "free",
  "business",
  "collective",
  "network",
  "final",
] as const;
type StepKey = (typeof STEPS)[number];
const N = STEPS.length;
const PICKS: CalcStepId[] = [
  "member",
  "crew",
  "free",
  "business",
  "collective",
  "network",
];
const SPACE_STEPS: CalcStepId[] = ["free", "business", "collective", "network"];
/** Pace: the panel fade in seconds (the prototype's "Slow"). */
const FADE_S = 1.4;
/** The action line over each tier's name (design copy; words only, no money). */
const ACT: Record<StepKey, string> = {
  visitor: "Welcome",
  member: "Become a Member",
  crew: "Join the Crew",
  free: "Start a Free Space",
  business: "Launch your Business",
  collective: "Create with the Collective",
  network: "Expand your Network",
  final: "It\u2019s time for Your Turn",
};
const WHAT = ["Classes", "Circles", "Events", "Workshops", "Retreats"];
const PHOTOS = [
  "gathering-03.jpg",
  "gathering-05.jpg",
  "gathering-07.jpg",
  "gathering-12.jpg",
  "gathering-13.jpg",
  "gathering-09.jpg",
];

/** The halo's colour per tier, as the numeric triple the stylesheet turns into a translucent wash. */
const HALO: Record<CalcStepId, [number, number, number]> = {
  visitor: [168, 155, 194],
  member: [217, 207, 234],
  crew: [255, 231, 163],
  free: [61, 242, 255],
  business: [255, 196, 107],
  collective: [255, 155, 216],
  network: [255, 43, 214],
};

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** A point on a circle, degrees from twelve o'clock, in the galaxy's 0 to 100 box. */
const pt = (cx: number, cy: number, r: number, a: number): [number, number] => [
  cx + r * Math.cos(((a - 90) * Math.PI) / 180),
  cy + r * Math.sin(((a - 90) * Math.PI) / 180),
];

// ── The galaxy: 31 persistent nodes and 4 rings. Each tier lays them out; the loop morphs between layouts ──
const NODE_IDS = [
  "IRI",
  "YOU",
  "SP",
  "PK",
  "GD",
  "ORG",
  "CH1",
  "CH2",
  "CH3",
  "P1",
  "P2",
  "P3",
  "P4",
  "P5",
  "P6",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
  "G1",
  "G2",
  "G3",
  "G4",
  "G5",
  "G6",
  "M1",
  "M2",
  "M3",
  "M4",
] as const;
const RING_COUNT = 4;
/** [x, y, size, opacity, orbitCentreX, orbitCentreY], in % of the square. */
type NodeSpot = [number, number, number, number, number, number];
interface Layout {
  n: Partial<Record<string, NodeSpot>>;
  r: [number, number, number, number][];
  lb: { t: string; x: number; y: number; k: "in" | "big" | "u" }[];
}

function buildLayouts(): Record<CalcStepId, Layout> {
  const mk = (): Layout => ({ n: {}, r: [], lb: [] });
  const put = (
    o: Layout,
    id: string,
    xy: [number, number],
    s: number,
    op = 1,
    c: [number, number] = [50, 50],
  ) => {
    o.n[id] = [xy[0], xy[1], s, op, c[0], c[1]];
  };
  const ring = (o: Layout, cx: number, cy: number, r: number, op = 0.8) =>
    o.r.push([cx, cy, r, op]);
  const C: [number, number] = [50, 50];
  const L = {} as Record<CalcStepId, Layout>;
  let o: Layout;

  o = mk();
  put(o, "YOU", C, 4.5);
  [
    [20, 34],
    [75, 40],
    [140, 30],
    [200, 38],
    [255, 33],
    [320, 41],
  ].forEach(([a, r], i) => put(o, `A${i + 1}`, pt(50, 50, r!, a!), 1.8, 0.85));
  [
    [50, 26],
    [170, 42],
    [230, 36],
    [290, 28],
  ].forEach(([a, r], i) => put(o, `M${i + 1}`, pt(50, 50, r!, a!), 1.8, 0.85));
  ring(o, 50, 50, 44, 0.7);
  ring(o, 50, 50, 22, 0.35);
  o.lb.push({ t: "You", x: 50, y: 55.5, k: "u" });
  L.visitor = o;

  o = mk();
  put(o, "YOU", C, 8);
  for (let i = 0; i < 6; i++) put(o, `P${i + 1}`, pt(50, 50, 19, i * 60), 12);
  for (let i = 0; i < 6; i++)
    put(o, `A${i + 1}`, pt(50, 50, 41, i * 60 + 30), 1.4, 0.45);
  for (let i = 0; i < 4; i++)
    put(o, `M${i + 1}`, pt(50, 50, 45, i * 90 + 10), 1.4, 0.45);
  ring(o, 50, 50, 19, 0.8);
  ring(o, 50, 50, 41, 0.3);
  o.lb.push({ t: "You", x: 50, y: 50, k: "in" });
  L.member = o;

  o = mk();
  put(o, "IRI", C, 22, 0.5);
  put(o, "YOU", C, 10);
  for (let i = 0; i < 6; i++) put(o, `P${i + 1}`, pt(50, 50, 31, i * 60), 9);
  for (let i = 0; i < 6; i++)
    put(o, `A${i + 1}`, pt(50, 50, 44, i * 60 + 10), 2, 0.95);
  for (let i = 0; i < 6; i++)
    put(o, `G${i + 1}`, pt(50, 50, 44, i * 60 + 40), 2, 0.95);
  for (let i = 0; i < 4; i++)
    put(o, `M${i + 1}`, pt(50, 50, 31, i * 90 + 30), 2.2);
  ring(o, 50, 50, 31, 0.8);
  ring(o, 50, 50, 44, 0.5);
  ring(o, 50, 50, 17, 0.35);
  o.lb.push(
    { t: "You", x: 50, y: 50, k: "in" },
    { t: "keeping Circles free", x: 50, y: 64.5, k: "u" },
  );
  L.crew = o;

  o = mk();
  put(o, "SP", C, 26);
  const yf = pt(50, 50, 36, -40);
  put(o, "YOU", yf, 4.5);
  [50, 140, 230].forEach((a, i) => put(o, `P${i + 1}`, pt(50, 50, 36, a), 11));
  put(o, "P4", pt(50, 50, 36, 95), 7);
  put(o, "P5", pt(50, 50, 36, 275), 7);
  for (let i = 0; i < 6; i++)
    put(o, `A${i + 1}`, pt(50, 50, 20, i * 60 + 30), 2.8);
  [20, 110, 200, 290].forEach((a, i) =>
    put(o, `M${i + 1}`, pt(50, 50, 45, a), 1.8, 0.8),
  );
  ring(o, 50, 50, 20, 0.8);
  ring(o, 50, 50, 36, 0.6);
  ring(o, 50, 50, 45, 0.3);
  o.lb.push(
    { t: "Your Space", x: 50, y: 50, k: "in" },
    { t: "You", x: yf[0], y: yf[1] + 4.6, k: "u" },
  );
  L.free = o;

  o = mk();
  put(o, "SP", C, 22);
  for (let i = 0; i < 6; i++) put(o, `G${i + 1}`, pt(50, 50, 28, i * 60), 3.4);
  for (let i = 0; i < 6; i++)
    put(o, `A${i + 1}`, pt(50, 50, 16.5, i * 60 + 30), 1.8, 0.9);
  put(o, "YOU", pt(50, 50, 38, -40), 4);
  [40, 100, 160, 220, 280].forEach((a, i) =>
    put(o, `P${i + 1}`, pt(50, 50, 38, a), 8.5),
  );
  [10, 100, 190, 280].forEach((a, i) =>
    put(o, `M${i + 1}`, pt(50, 50, 46, a), 1.6, 0.7),
  );
  ring(o, 50, 50, 16.5, 0.6);
  ring(o, 50, 50, 28, 0.9);
  ring(o, 50, 50, 38, 0.6);
  o.lb.push({ t: "Your Space", x: 50, y: 50, k: "in" });
  L.business = o;

  o = mk();
  const S: [number, number] = [50, 27];
  const K: [number, number] = [27, 69];
  const G: [number, number] = [73, 69];
  put(o, "SP", S, 16, 1, S);
  put(o, "PK", K, 16, 1, K);
  put(o, "GD", G, 16, 1, G);
  const group = (c: [number, number], ids: string[], off: number) =>
    ids.forEach((id, i) =>
      put(
        o,
        id,
        pt(c[0], c[1], 13, off + i * 72),
        id.startsWith("P") ? 6.5 : 2.2,
        1,
        c,
      ),
    );
  group(S, ["A1", "A2", "A3", "P1", "P2"], 0);
  group(K, ["M1", "M2", "M3", "P3", "P4"], 36);
  group(G, ["G1", "G2", "G3", "P5", "P6"], 0);
  put(o, "YOU", pt(50, 27, 20, 300), 3.4, 1, S);
  ring(o, S[0], S[1], 13, 0.8);
  ring(o, K[0], K[1], 13, 0.8);
  ring(o, G[0], G[1], 13, 0.8);
  ring(o, 50, 55, 34, 0.3);
  o.lb.push(
    { t: "Yours", x: S[0], y: S[1], k: "in" },
    { t: "Partner", x: K[0], y: K[1], k: "in" },
    { t: "Partner", x: G[0], y: G[1], k: "in" },
    { t: "one shared calendar", x: 50, y: 57, k: "u" },
  );
  L.collective = o;

  o = mk();
  put(o, "ORG", C, 30);
  ["SP", "PK", "GD", "CH1", "CH2", "CH3"].forEach((id, i) =>
    put(o, id, pt(50, 50, 31, i * 60), i < 3 ? 9 : 7.5),
  );
  const dots = [
    "A1",
    "M1",
    "G1",
    "A2",
    "M2",
    "G2",
    "A3",
    "M3",
    "G3",
    "A4",
    "M4",
    "G4",
    "A5",
    "G5",
    "A6",
    "G6",
  ];
  dots.forEach((id, i) => put(o, id, pt(50, 50, 44, i * 22.5 + 6), 1.5, 0.85));
  for (let i = 0; i < 6; i++)
    put(o, `P${i + 1}`, pt(50, 50, 44, i * 60 + 30), 5);
  put(o, "YOU", pt(50, 50, 31, 30), 2.6);
  ring(o, 50, 50, 31, 0.8);
  ring(o, 50, 50, 44, 0.4);
  ring(o, 50, 50, 19, 0.45);
  o.lb.push({ t: "1\norganization", x: 50, y: 50, k: "big" });
  L.network = o;
  return L;
}
const LAYOUTS = buildLayouts();

/** The mutable galaxy: where every node and ring is right now, written by the frame loop. */
interface GalaxyState {
  nodes: (number | null)[][];
  rings: number[][];
  halo: [number, number, number];
}

const BREATHES = new Set(["IRI", "YOU", "SP", "PK", "GD", "ORG"]);
/** A node's classes: dots and photos share a rule per group (A1..A6 are all `A`), the orbs each have their own. */
const nodeClass = (id: string) =>
  `pc-n pc-n-${/^[AGMP]\d$/.test(id) ? id[0] : id}${BREATHES.has(id) ? " fq-breathe" : ""}`;

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties;
}

const price = (p: CalcPrice) => `${p.pre}${p.amount}`;

export function PricingCalculator({ model }: { model: CalcModel }) {
  const steps = model.steps;
  const byId = (id: CalcStepId): CalcStep => steps.find((s) => s.id === id)!;
  const recommended = steps.find((s) => s.recommended)?.id ?? "collective";

  const [p, setP] = useState(0);
  const [sel, setSel] = useState<CalcStepId>(recommended);
  const [yearly, setYearly] = useState(false);
  const [np, setNp] = useState(false);
  const [name, setName] = useState("");
  const [bad, setBad] = useState(false);
  const [fold, setFold] = useState(false);
  const [what, setWhat] = useState<string[]>([]);
  const [visS, setVisS] = useState(360);

  const wrapRef = useRef<HTMLDivElement>(null);
  const visRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const selRef = useRef(sel);
  const pRef = useRef(0);
  useEffect(() => {
    selRef.current = sel;
  });

  const goTo = useRef<(i: number) => void>(() => {});

  useEffect(() => {
    const reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    const g: GalaxyState = {
      nodes: NODE_IDS.map(() => [null, null, null, null, null, null, 0]),
      rings: Array.from({ length: RING_COUNT }, () => [50, 50, 0, 0, 0]),
      halo: [246, 240, 255],
    };
    let target = 0;
    let frameRaf = 0;
    let pos: number | null = null;
    let vel = 0;
    let lastT = 0;
    let lockUntil = 0;
    let lastWheel = 0;
    let acc = 0;
    let held = false;
    let touchY: number | null = null;
    let els: { n: HTMLElement[]; r: HTMLElement[] } | null = null;

    /** One step, never more, then the input rests for most of the fade so trackpad inertia cannot skip tiers. */
    const stepTo = (i: number) => {
      const to = Math.max(0, Math.min(N - 1, i));
      if (to === target) return;
      target = to;
      pRef.current = to;
      lockUntil = performance.now() + (reduce ? 200 : FADE_S * 650);
      setP(to);
    };
    goTo.current = stepTo;

    /** The stage's place on screen: lined up under the bar, partly in view, or out of the way. */
    const place = () => {
      const el = wrapRef.current;
      if (!el) return "away" as const;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      if (Math.abs(r.top) < vh * 0.12) return "aligned" as const;
      return r.top < vh * 0.5 && r.bottom > vh * 0.5
        ? ("partly" as const)
        : ("away" as const);
    };
    /** Line the stage up on the screen, the way a step would, so the next input is a step. */
    const align = () => {
      const el = wrapRef.current;
      if (!el) return;
      lockUntil = performance.now() + 700;
      window.scrollTo({
        top: window.scrollY + el.getBoundingClientRect().top,
        behavior: reduce ? "auto" : "smooth",
      });
    };
    /** Does this direction leave the stage? The first step lets you scroll up and the last lets you scroll down. */
    const leaves = (dir: number) =>
      (dir < 0 && target === 0) || (dir > 0 && target === N - 1);

    const onWheel = (ev: WheelEvent) => {
      if (Math.abs(ev.deltaY) < Math.abs(ev.deltaX)) return;
      const dir = ev.deltaY > 0 ? 1 : -1;
      if (leaves(dir)) return;
      const where = place();
      if (where === "away") return;
      ev.preventDefault();
      const now = performance.now();
      const gap = now - lastWheel;
      lastWheel = now;
      if (now < lockUntil) return;
      if (where === "partly") return align();
      if (held && gap < 200 && now < lockUntil + 700) return;
      held = false;
      acc = (gap > 200 ? 0 : acc) + ev.deltaY;
      if (Math.abs(acc) > 24) {
        acc = 0;
        held = true;
        stepTo(target + dir);
      }
    };
    const onTouchStart = (ev: TouchEvent) => {
      touchY = ev.touches[0]!.clientY;
    };
    const onTouchMove = (ev: TouchEvent) => {
      if (
        touchY == null ||
        (ev.target instanceof HTMLElement &&
          /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName))
      )
        return;
      const dir = touchY - ev.touches[0]!.clientY > 0 ? 1 : -1;
      if (!leaves(dir) && place() !== "away") ev.preventDefault();
    };
    const onTouchEnd = (ev: TouchEvent) => {
      if (touchY == null) return;
      const dy = touchY - ev.changedTouches[0]!.clientY;
      touchY = null;
      if (
        Math.abs(dy) <= 40 ||
        leaves(dy > 0 ? 1 : -1) ||
        performance.now() < lockUntil
      )
        return;
      const where = place();
      if (where === "partly") align();
      else if (where === "aligned") stepTo(target + (dy > 0 ? 1 : -1));
    };
    const onKey = (ev: KeyboardEvent) => {
      const tag = ev.target instanceof HTMLElement ? ev.target.tagName : "";
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (ev.key === " " && /BUTTON|A/.test(tag)) return;
      if (place() !== "aligned") return;
      const next = ["ArrowRight", "ArrowDown", "PageDown", " "].includes(
        ev.key,
      );
      const back = ["ArrowLeft", "ArrowUp", "PageUp"].includes(ev.key);
      if (!next && !back) return;
      if (leaves(next ? 1 : -1)) return;
      ev.preventDefault();
      if (performance.now() >= lockUntil) stepTo(target + (next ? 1 : -1));
    };

    /** Orbit speed in rad/s: it drifts slowly with the clock so no two groups keep step. */
    const orbit = (r: number, side: number, t: number) =>
      side *
      (0.035 + 1.5 / (r + 9)) *
      (1 + 0.35 * Math.sin(t * 0.13 + r * 0.21));
    /** The breath: a group swells and settles with its ring. */
    const breath = (r: number, t: number, w: number) =>
      1 +
      w *
        (0.045 * Math.sin(t * 0.32 + r * 0.17) +
          0.018 * Math.sin(t * 0.71 + r * 0.43));

    const frame = (nowMs: number) => {
      frameRaf = requestAnimationFrame(frame);
      const box = boxRef.current;
      if (!box) return;
      if (!els || !els.n[0] || !els.n[0].isConnected) {
        els = {
          n: [...box.querySelectorAll<HTMLElement>("[data-node]")],
          r: [...box.querySelectorAll<HTMLElement>("[data-ring]")],
        };
      }
      const t = nowMs / 1000;
      const dt = Math.min(0.05, lastT ? t - lastT : 0.016);
      lastT = t;
      const tgt = target;
      vel += (tgt - (pos ?? tgt)) * 0.01 - vel * 0.2;
      pos = reduce ? tgt : (pos ?? tgt) + vel * 60 * dt;
      if (Math.abs(tgt - pos) < 0.0005) pos = tgt;
      const prog = clamp(pos, 0, N - 1);
      const i0 = Math.min(N - 2, Math.floor(prog));
      const e = smooth(clamp((prog - i0 - 0.12) / 0.76));
      const keyAt = (i: number): CalcStepId =>
        STEPS[i] === "final" ? selRef.current : (STEPS[i] as CalcStepId);
      const A = LAYOUTS[keyAt(i0)];
      const B = LAYOUTS[keyAt(i0 + 1)];
      const lag = reduce ? 1 : 1 - Math.pow(0.0009, dt);
      const w = reduce ? 0 : 1;
      if (railRef.current)
        railRef.current.style.setProperty(
          "--pc-prog",
          (prog / (N - 1)).toFixed(4),
        );

      NODE_IDS.forEach((id, k) => {
        const a: NodeSpot =
          A.n[id] ??
          (B.n[id]
            ? [B.n[id]![0], B.n[id]![1], 0, 0, B.n[id]![4], B.n[id]![5]]
            : [50, 50, 0, 0, 50, 50]);
        const b: NodeSpot = B.n[id] ?? [a[0], a[1], a[2], 0, a[4], a[5]];
        const s = g.nodes[k]!;
        for (let q = 0; q < 6; q++) {
          const goal = lerp(a[q]!, b[q]!, e);
          s[q] = s[q] == null ? goal : s[q]! + (goal - s[q]!) * lag;
        }
        const el = els!.n[k];
        if (!el) return;
        const dx = s[0]! - s[4]!;
        const dy = s[1]! - s[5]!;
        const rad = Math.hypot(dx, dy);
        const side = Math.round(rad / 9) % 2 ? -1 : 1;
        s[6] = (s[6] ?? 0) + (rad > 1 ? orbit(rad, side, t) * dt * w : 0);
        const c = Math.cos(s[6]!);
        const sn = Math.sin(s[6]!);
        const big = s[2]! > 7;
        const phase = k * 1.7;
        const amp = w * (big ? 0.35 : 0.8);
        const bk =
          rad > 1
            ? breath(rad, t, w) * (1 + w * 0.02 * Math.sin(t * 0.5 + phase))
            : 1;
        const x =
          s[4]! +
          (dx * c - dy * sn) * bk +
          Math.sin(t * 0.37 + phase) * amp +
          Math.sin(t * 0.13 + phase * 2.1) * amp * 0.6;
        const y =
          s[5]! +
          (dx * sn + dy * c) * bk +
          Math.cos(t * 0.31 + phase * 1.3) * amp +
          Math.cos(t * 0.11 + phase * 1.7) * amp * 0.6;
        const size = s[2]! * (1 + w * 0.05 * Math.sin(t * 0.6 + phase));
        el.style.left = `${(x - size / 2).toFixed(3)}%`;
        el.style.top = `${(y - size / 2).toFixed(3)}%`;
        el.style.width = `${size.toFixed(3)}%`;
        el.style.opacity = s[3]!.toFixed(3);
        el.style.display = s[3]! < 0.005 || size < 0.05 ? "none" : "block";
      });

      for (let r = 0; r < RING_COUNT; r++) {
        const a =
          A.r[r] ?? (B.r[r] ? [B.r[r]![0], B.r[r]![1], 0, 0] : [50, 50, 0, 0]);
        const b = B.r[r] ?? [a[0]!, a[1]!, a[2]!, 0];
        const s = g.rings[r]!;
        for (let q = 0; q < 4; q++)
          s[q] = s[q]! + (lerp(a[q]!, b[q]!, e) - s[q]!) * lag;
        const el = els!.r[r];
        if (!el) continue;
        const side = Math.round(s[2]! / 9) % 2 ? -1 : 1;
        s[4] = (s[4] || r * 1.3) + orbit(s[2]!, side, t) * dt * w;
        const rr = s[2]! * breath(s[2]!, t, w);
        el.style.left = `${(s[0]! - rr).toFixed(3)}%`;
        el.style.top = `${(s[1]! - rr).toFixed(3)}%`;
        el.style.width = `${(rr * 2).toFixed(3)}%`;
        el.style.opacity = s[3]!.toFixed(3);
        el.style.transform = `rotate(${(s[4]! * 57.2958).toFixed(2)}deg)`;
      }

      const ca = HALO[keyAt(i0)];
      const cb = HALO[keyAt(i0 + 1)];
      for (let q = 0; q < 3; q++)
        g.halo[q] =
          g.halo[q]! + (lerp(ca[q]!, cb[q]!, e) - g.halo[q]!) * lag * 0.6;
      const halo = haloRef.current;
      if (halo) {
        halo.style.setProperty("--pc-halo", g.halo.map(Math.round).join(" "));
        halo.style.setProperty(
          "--pc-halo-a",
          (0.2 + w * 0.05 * Math.sin(t * 0.8)).toFixed(3),
        );
      }
    };

    const measure = () => {
      const v = visRef.current;
      if (!v) return;
      const cs = getComputedStyle(v);
      const wd =
        v.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight);
      const ht =
        v.clientHeight -
        parseFloat(cs.paddingTop) -
        parseFloat(cs.paddingBottom);
      setVisS(Math.max(120, Math.floor(Math.min(wd, ht))));
    };
    const ro = new ResizeObserver(() => measure());
    if (visRef.current) ro.observe(visRef.current);
    const wrap = wrapRef.current;
    wrap?.addEventListener("wheel", onWheel, { passive: false });
    wrap?.addEventListener("touchstart", onTouchStart, { passive: true });
    wrap?.addEventListener("touchmove", onTouchMove, { passive: false });
    wrap?.addEventListener("touchend", onTouchEnd);
    window.addEventListener("keydown", onKey);
    frameRaf = requestAnimationFrame(frame);
    measure();
    return () => {
      ro.disconnect();
      wrap?.removeEventListener("wheel", onWheel);
      wrap?.removeEventListener("touchstart", onTouchStart);
      wrap?.removeEventListener("touchmove", onTouchMove);
      wrap?.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(frameRaf);
    };
  }, []);

  const step = Math.min(N - 1, p);
  const stepKey: StepKey = STEPS[step]!;
  const dkId: CalcStepId = stepKey === "final" ? sel : stepKey;
  const dk = byId(dkId);
  const isSpace = SPACE_STEPS.includes(dkId) && dk.plan !== null;
  const curKey: CalcStepId = dkId;
  const priceOf = (s: CalcStep): CalcPrice => {
    if (np && s.npTier)
      return (
        (yearly ? s.price.npYear : s.price.npMonth) ??
        (yearly ? s.price.year : s.price.month)
      );
    return yearly ? s.price.year : s.price.month;
  };
  const tierName = (s: CalcStep) => (np && s.npTier ? s.npTier : s.tier);
  const nameOk = name.trim().length >= 2;
  const plan = (np && dk.npPlan ? dk.npPlan : dk.plan) ?? "free";
  const launchHref = operatorStartHref(plan, {
    name: name.trim(),
    intents: intentsForPicks(what),
  });
  const dockPrice = priceOf(dk);
  const compact = isSpace && fold;
  const filled = [nameOk, what.length > 0];

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!nameOk) return setBad(true);
    setBad(false);
    setFold(true);
  };
  const toggleWhat = useCallback(
    (w: string) =>
      setWhat((cur) =>
        cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w],
      ),
    [],
  );

  return (
    <div
      className="pcx"
      id="path"
      data-fold={compact ? "1" : undefined}
      role="region"
      aria-label="Walk through every plan"
    >
      <div ref={wrapRef} className="pc-wrap">
        <div className="pc-sticky">
          <div className="pc-stage">
            <header className="pc-head">
              <p className="pc-count" aria-hidden="true">
                {String(Math.min(step, N - 2) + 1).padStart(2, "0")}{" "}
                <span>/ 07</span>
              </p>
              <div className="pc-ctl">
                <div
                  className="pc-seg"
                  role="radiogroup"
                  aria-label="Billing period"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!yearly}
                    className={!yearly ? "on" : undefined}
                    onClick={() => setYearly(false)}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={yearly}
                    className={yearly ? "on" : undefined}
                    onClick={() => setYearly(true)}
                  >
                    Yearly<small>2 months free</small>
                  </button>
                </div>
                <button
                  type="button"
                  className="pc-np"
                  role="switch"
                  aria-checked={np}
                  title={
                    dk.npTier
                      ? "Non Profit pricing"
                      : "Non Profit pricing applies from Business up"
                  }
                  data-on={np ? "1" : undefined}
                  data-dim={dk.npTier ? undefined : "1"}
                  onClick={() => setNp((v) => !v)}
                >
                  <span className="pc-np-track" aria-hidden="true">
                    <span />
                  </span>
                  Non Profit
                </button>
              </div>
            </header>

            <nav className="pc-rail" aria-label="The ladder">
              <span className="pc-k">The ladder</span>
              <ol className="pc-rail-list">
                <span className="pc-rail-track" aria-hidden="true" />
                <span
                  ref={railRef}
                  className="pc-rail-fill"
                  aria-hidden="true"
                />
                {STEPS.map((k, i) => {
                  const s = k === "final" ? null : byId(k);
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        className="pc-rail-btn"
                        aria-current={i === step ? "step" : undefined}
                        data-state={
                          i === step ? "now" : i < step ? "done" : "next"
                        }
                        style={vars({ "--pc-c": `var(--pc-hue-${k})` })}
                        onClick={() => goTo.current(i)}
                      >
                        <span className="pc-dot" aria-hidden="true" />
                        <span className="pc-rail-t">
                          <b>{s ? tierName(s) : "Your turn"}</b>
                          <i>{s ? s.sub : "pick a plan"}</i>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              <span className="pc-cue" data-hide={p > 0 ? "1" : undefined}>
                <span aria-hidden="true">↓</span>Scroll, swipe or use the arrows
              </span>
              <a className="pc-skip" href="#path-end">
                Skip the walk-through
              </a>
            </nav>

            <div className="pc-main">
              <div className="pc-copycol">
                <div className="pc-copy">
                  {STEPS.map((k, i) => {
                    const s = k === "final" ? null : byId(k);
                    const d = Math.abs(i - p);
                    const pr = s ? priceOf(s) : null;
                    const hue = k === "final" ? sel : k;
                    const here = i === p;
                    return (
                      <section
                        key={k}
                        className="pc-panel"
                        aria-hidden={i === step ? undefined : true}
                        data-final={k === "final" ? "1" : undefined}
                        style={{
                          ...vars({
                            "--pc-c": `var(--pc-hue-${hue})`,
                            "--pc-fade": `${FADE_S}s`,
                            "--pc-dl": here ? ".12s" : "0s",
                          }),
                          visibility: d < 1.5 ? "visible" : "hidden",
                          opacity: clamp(1 - d * 2.4),
                          transform: `translateY(${((i - p) * 28).toFixed(1)}px)`,
                          filter: here ? "blur(0px)" : "blur(6px)",
                          pointerEvents: here ? "auto" : "none",
                        }}
                      >
                        <p className="pc-act">{ACT[k]}</p>
                        <p className="pc-k pc-eyebrow">
                          <span className="pc-dot" aria-hidden="true" />
                          {s
                            ? `${String(i + 1).padStart(2, "0")} / 07${s.recommended ? " · Recommended" : ""}`
                            : "Pick your plan"}
                        </p>
                        <p className="pc-tier fq-iri-text">
                          {s ? tierName(s) : "Your turn"}
                        </p>
                        {pr && (
                          <p className="pc-price">
                            {pr.was && (
                              <s>
                                <span className="sr-only">Was </span>
                                {pr.was}
                              </s>
                            )}
                            <b>{price(pr)}</b>
                            <em>{pr.per}</em>
                          </p>
                        )}
                        <span className="pc-rule" aria-hidden="true" />
                        <h3 className="pc-idea">
                          {s ? s.idea : "Where do you see yourself?"}
                        </h3>
                        <p className="pc-line">
                          {s
                            ? s.line
                            : "Pick the picture that looks like your community. Hover to see it."}
                        </p>
                        {s && (
                          <p className="pc-for">
                            <em>Made for</em>
                            {s.who.map((w) => (
                              <span key={w} className="pc-chip">
                                {w}
                              </span>
                            ))}
                          </p>
                        )}
                        {k === "final" && (
                          <div
                            className="pc-picks"
                            role="group"
                            aria-label="Pick a plan"
                          >
                            {PICKS.map((id) => {
                              const ps = byId(id);
                              const pp = priceOf(ps);
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  className="pc-pick"
                                  aria-pressed={sel === id}
                                  style={vars({
                                    "--pc-c": `var(--pc-hue-${id})`,
                                  })}
                                  onClick={() => setSel(id)}
                                  onMouseEnter={() => setSel(id)}
                                >
                                  <span>
                                    <i aria-hidden="true" />
                                    <b>{tierName(ps)}</b>
                                  </span>
                                  <small>
                                    {pp.amount === "Free"
                                      ? "Free"
                                      : `${price(pp)} ${pp.per}`.trim()}
                                  </small>
                                  {ps.recommended && (
                                    <em className="pc-flag">Recommended</em>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
                <div className="pc-nav" role="group" aria-label="Step by step">
                  <button
                    type="button"
                    onClick={() => goTo.current(p - 1)}
                    disabled={p === 0}
                    aria-label="Previous step"
                  >
                    <span aria-hidden="true">‹</span>Back
                  </button>
                  <span aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => goTo.current(p + 1)}
                    disabled={p === N - 1}
                    aria-label="Next step"
                  >
                    Next<span aria-hidden="true">›</span>
                  </button>
                </div>
              </div>

              <div ref={visRef} className="pc-vis" aria-hidden="true">
                <div
                  ref={boxRef}
                  className="pc-box"
                  style={{ width: visS, height: visS }}
                >
                  <div ref={haloRef} className="pc-halo" />
                  {Array.from({ length: RING_COUNT }, (_, r) => (
                    <div key={r} data-ring={r} className="pc-ring" />
                  ))}
                  {NODE_IDS.map((id, i) => (
                    <span
                      key={id}
                      data-node={i}
                      className={nodeClass(id)}
                      style={
                        id.startsWith("P")
                          ? {
                              backgroundImage: `url(/brand/frequency/photos/${PHOTOS[Number(id.slice(1)) - 1]})`,
                            }
                          : undefined
                      }
                    />
                  ))}
                  {(Object.keys(LAYOUTS) as CalcStepId[]).flatMap((k) =>
                    LAYOUTS[k].lb.map((lb, i) => (
                      <span
                        key={`${k}-${i}`}
                        className={`pc-label ${lb.k === "u" ? "is-out" : lb.k === "big" ? "is-in is-big" : "is-in"}`}
                        style={{
                          left: `${lb.x}%`,
                          top: `${lb.y}%`,
                          opacity: k === curKey ? 1 : 0,
                          ...(lb.k === "big"
                            ? {
                                fontSize: Math.max(9, Math.round(visS * 0.027)),
                              }
                            : undefined),
                        }}
                      >
                        {lb.t}
                      </span>
                    )),
                  )}
                </div>
                {steps.map((s) =>
                  s.badge ? (
                    <span
                      key={s.id}
                      className="pc-badge"
                      style={vars({
                        "--pc-c": `var(--pc-hue-${s.id})`,
                        opacity: s.id === curKey ? 1 : 0,
                      })}
                    >
                      <i aria-hidden="true" />
                      {s.badge}
                    </span>
                  ) : null,
                )}
              </div>
            </div>

            <div
              className="pc-dock"
              style={vars({ "--pc-c": `var(--pc-hue-${dkId})` })}
            >
              <div className="pc-dock-row">
                <div className="pc-dock-plan">
                  <span className="pc-k">
                    <i aria-hidden="true" />
                    {tierName(dk)}
                    {dkId === recommended ? " · Recommended" : ""}
                  </span>
                  <span className="pc-dock-price">
                    {dockPrice.was && (
                      <s>
                        <span className="sr-only">Was </span>
                        {dockPrice.was}
                      </s>
                    )}
                    <b>{price(dockPrice)}</b>
                    <em>{dockPrice.per}</em>
                  </span>
                </div>
                <div className="pc-dock-pitch">
                  <b>{dk.pitch}</b>
                  <span data-bad={bad ? "1" : undefined}>
                    {bad
                      ? "Give your Space a name to start."
                      : `${yearly && /\$/.test(dockPrice.amount) ? "2 months free on yearly. " : ""}${dk.note}`}
                  </span>
                </div>
                {isSpace ? (
                  fold ? (
                    <span className="pc-dock-done">
                      <i aria-hidden="true" />
                      Two quick picks and {name.trim() || "your Space"} is
                      ready.
                    </span>
                  ) : (
                    <form className="pc-form" noValidate onSubmit={submit}>
                      <Input
                        variant="seamless"
                        type="text"
                        value={name}
                        maxLength={80}
                        placeholder={
                          dkId === "network"
                            ? "Name your organization"
                            : "Name your Space"
                        }
                        aria-label={
                          dkId === "network"
                            ? "Name your organization"
                            : "Name your Space"
                        }
                        aria-invalid={bad || undefined}
                        data-bad={bad ? "1" : undefined}
                        onChange={(ev) => {
                          setName(ev.target.value);
                          setBad(false);
                        }}
                      />
                      <button type="submit" className="pc-cta">
                        {dk.ctaLabel}
                      </button>
                    </form>
                  )
                ) : (
                  dk.href && (
                    <Link className="pc-cta" href={dk.href}>
                      {dk.ctaLabel}
                    </Link>
                  )
                )}
              </div>

              <div className="pc-fold" data-open={compact ? "1" : undefined}>
                <div className="pc-fold-in">
                  <div className="pc-fold-name">
                    <span className="pc-k">Your Space</span>
                    <b className="fq-iri-text">{name.trim() || "Your Space"}</b>
                    <span className="pc-blips" aria-hidden="true">
                      {filled.map((on, i) => (
                        <i key={i} data-on={on ? "1" : undefined} />
                      ))}
                    </span>
                    <button
                      type="button"
                      className="pc-link"
                      onClick={() => setFold(false)}
                      tabIndex={compact ? 0 : -1}
                    >
                      Change name
                    </button>
                  </div>
                  <div className="pc-fold-q">
                    <span className="pc-q">
                      <i
                        data-on={what.length > 0 ? "1" : undefined}
                        aria-hidden="true"
                      />
                      What happens at {name.trim() || "your Space"}? Pick
                      several.
                    </span>
                    <div
                      className="pc-opts"
                      role="group"
                      aria-label="What happens at your Space"
                    >
                      {WHAT.map((w) => (
                        <button
                          key={w}
                          type="button"
                          aria-pressed={what.includes(w)}
                          onClick={() => toggleWhat(w)}
                          tabIndex={compact ? 0 : -1}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                    <Link
                      className="pc-launch"
                      href={launchHref}
                      tabIndex={compact ? 0 : -1}
                    >
                      Launch your Space<span aria-hidden="true">→</span>
                    </Link>
                    <small className="pc-fold-note">
                      You sign in next, then we set up{" "}
                      {name.trim() || "your Space"} with these picks.
                    </small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <span id="path-end" className="pc-end" aria-hidden="true" />
    </div>
  );
}
