# The five new gates — implementation spec

> **The answer, first.** Four of the five are static AST guards in the `check-menu.mjs` mould; one
> (`check:doc-safety`) cannot be, because it has to *run* the round trip. **All five land at E0**
> ([ADR-975](DECISIONS.md) D-10) — four pass on today's tree, so each starts green and provable, and
> the first time one goes red it is telling you something true.
>
> ⚠️ **Two of them, as first specced, would have failed on a clean tree.** Both are corrected here.
>
> Parent: [`EDITOR-ARCHITECTURE.md`](EDITOR-ARCHITECTURE.md) §7 · Decisions:
> [ADR-972](DECISIONS.md) · [ADR-975](DECISIONS.md). Models to copy: `scripts/check-menu.mjs`,
> `check-elements.mjs`, `check-render-path.mjs`, `check-adoption.mjs`.

---

## 0. Why AST, not regex, not runtime

`check-menu.mjs` already settled this and the reasoning transfers: the guards are plain `.mjs` run by
bare `node`, and the registry graph is TS/TSX pulling `LucideIcon`, React and `server-only`. There is
no loader, and a runtime import would need a bundler in the gate — which is how a 13-second guard step
becomes a build step.

For the one genuinely runtime question — *"is `content` a Zod schema?"* — apply check-menu rule 4's
answer: **do not check the value, check the shape the contract allows.** `content` must be a call
expression rooted at the identifier `z`. `content: mySchema` fails, not because it is wrong but
because the contract says a block's schema is declared where the gate can read it. That is a real
constraint, stated in the failure message, not a limitation apologised for.

---

## 1. `check:blocks`

**Invariant:** every registry row resolves to a real renderer for every surface it offers, carries a
text projection, carries a complete migration chain, and declares a schema the inspector can build
fields from.

| # | Assertion | Fails when |
|---|---|---|
| **B0** | **Integrity.** The registry root exists, holds ≥ `MIN_BLOCKS`, and every declared surface id is used by ≥1 block | The registry moved or emptied, or a dead surface makes "every block covers it" vacuously true. The `MIN_CORPUS_FILES` lesson: *"the thing I measure disappeared" must never be spelled the same way as "the debt disappeared"* |
| **B1** | **Singularity**, name-blind and shape-based | A second registry is declared, however it is named |
| **B2** | **Surface ⇒ renderer** for that surface's target | `surfaces: {'space-site':{}}` with `render.web: null` |
| **B3** | **Renderer resolves to a file on disk**, and is exactly `() => import('…')` | A renderer pointing at a module that does not exist |
| **B4** | **`toText` present**, non-empty body | Missing, or `() => ''` |
| **B5** | **`content` roots at `z`** | `content: {}` / `sharedSchema` / `z` |
| **B6** | **Migration chain contiguous**, ids `type/2…v`, each with **both `up` and `down`** | `v:3` with only `/2`; an entry with only `up` (§3 rule 7: *retrofitting `down` is impossible*) |
| **B7** | **`reads:'live'` ⇒ no email renderer, unless `resolveAt:'send'`** names a registered resolver whose file exports the symbol | ⚠️ **Without the exception this fails on a clean tree** — `productCard` is live-reading *and* renders to email |
| **B8** | **Surface/kind coherence** | Offering `space-site` on a `kinds:['member']` block |
| **B9** | **`type` matches `/^frq\/[a-z][a-zA-Z0-9-]*$/`, unique; `v` a positive integer literal** | Two blocks claiming one type |
| **B10** | **No orphan renderer** — every renderer-map key is a block type and vice versa | 🔴 **The live `faq` case**: `SPACE_PROFILE_BLOCKS` has 14 keys, `PROFILE_BLOCKS` has 13 rows |

**No ratchet on B2–B9.** A block missing its renderer is not a population to sweep, it is one row
that is wrong. Only `blocks-without-totext` is ratcheted, because it starts at 304.

**Escape hatch:** `// block-ok: <reason>` on the declaration line, or a `NOT_A_BLOCK` map naming the
system a lookalike *does* belong to — check-menu's `NOT_A_MENU` verbatim, and the better hatch
because it forces a classification.

**Cannot see:** whether the renderer renders the right thing (§7.4's harnesses own output) · whether
`toText` is any *good* · whether `up`/`down` are true inverses (structural presence only;
`check:doc-safety` D6 proves it over real documents) · whether the Zod schema is correct (`z.any()`
passes) · a renderer that exists but throws · a block reached through a runtime string.

---

## 2. `check:doc-safety`

**Invariant:** a document that goes into the registry comes back out identical, including the parts
the registry does not understand.

**Runtime, necessarily** — no amount of AST reading proves a round trip. So: a vitest contract test,
plus a **plain-node corpus-integrity preamble**. The preamble is not ceremony: *a green round trip
over an edited corpus is green over nothing*, which is `check-adoption.mjs`'s absent-root lesson.

**The corpus.** Real stored documents carry tenant copy, so they are **captured and scrubbed**: every
string leaf replaced with a length-matched token, **shape preserved exactly** — keys, types, nesting,
array lengths, node ids, and *every unknown block type kept verbatim*. Loss is a structural property;
scrubbing text does not weaken the test. A manifest pins `sha256`, `source`, `capturedAt`, `nodes`,
`types` and `whyIncluded` per fixture.

| # | Assertion |
|---|---|
| **D0** | Corpus integrity — sha match, no orphans either direction, ≥1 fixture per storage `source` |
| **D1** | `serialize(parse(doc))` deep-equals `doc` |
| **D2** | **Unknown types survive byte-for-byte** — injected at root, in a slot, and nested |
| **D3** | **An unknown type does not condemn its siblings** — the document is not replaced by a template |
| **D4** | **Node ids stable, duplicates survive** — locks today's `rows-ops.ts` dedupe as a *failure* |
| **D5** | `migrate(migrate(doc))` equals `migrate(doc)` |
| **D6** | `down(up(c))` equals `c`, over schema defaults **and** every corpus instance |
| **D7** | No undeclared drops — every dropped path is in `QUARANTINE` with a reason and an ADR |

🔴 **No line-level escape hatch, deliberately.** `// doc-ok:` on a lossy round trip is a licence to
lose tenant data. The only two exits are loud: a `QUARANTINE` entry (printed on **every** run, may
only shrink, stale entries fail) or a re-capture that records the new sha, date and reason.

**Cannot see:** documents no tenant has written yet (the corpus is a sample) · loss at the DB
boundary · rendering · publish safety · concurrency.

🔴 **Goes in the `checks` job, not `test`.** It runs vitest, so `test` is the instinctive home and the
wrong one — `checks` and `analyze` are the only required contexts, so a hard gate in `test` cannot
block a merge.

---

## 3. `check:surface-binding`

**Invariant:** an App that says it presents a surface can be shown on it. **Adds a sixth rule to
`check:menu`'s five**, importing its manifests so the two gates cannot disagree about what a lane is.

⚠️ **The measured correction.** "Unbound" has two readings an order of magnitude apart:

| Reading | Today |
|---|---:|
| Surface **descriptor is an empty object literal** | **157** — `PAGE_APPS`, and only `PAGE_APPS` |
| Surface **cannot resolve to a component** | **0** — 157 `LAYOUT_MODULES` ids ⇄ 157 `COMPONENTS` keys, perfect |

So the 157 page surfaces *do* resolve — by id, through a registry the App contract knows nothing
about. What is missing is a **declared** binding, which is why `defaultTemplate`/`defaultSlot` are
read nowhere and the multi-surface badge has never fired. **Assert both, name them separately,
ratchet only the descriptor count — and pin which reading the entry means**, or the next re-measure
books a 157-site phantom win.

| # | Assertion |
|---|---|
| **S0** | Integrity — every binding file exists and exports its symbol; every `AppSurfaceKind` has an entry |
| **S1** | Every lane mints the surface it is registered for |
| **S2** | Bijection both directions, per surface kind |
| **S3** | Descriptor carries ≥1 required field — **ratcheted at 157** |
| **S4** | Link and rail surfaces resolve a destination — 72/72 clean today, so the floor is 0 |
| **S5** | No unregistered surface key |

**Escape hatches:** `// surface-ok:` per row; a `RETIRED_BINDINGS` map (component kept to render old
documents, no longer offered — the legitimate `CORE_PROFILE_BLOCK_IDS` pattern), **ratcheted
downward** so retired components stay visible and finite.

---

## 4. `check:loom-integrity`

**Two arms**, because a write-time validator that validates against a drifted registry is worse than
none — it authorises what it cannot honour.

| Arm | When | What |
|---|---|---|
| **A · the validator** | Write time, in-process, fail-closed | `validateLoomFunction(decl)` — pure, no IO, called before every insert/update |
| **B · the manifest gate** | CI, `checks` job | Proves the registry the validator validates *against* is real |

**Arm A** (L1–L9): every `op` names a real primitive · args match the declared signature · schema and
field references resolve **against the Zod shape, not a string list**, so a schema edit invalidates
references automatically · the graph is acyclic and bounded · **zero free identifiers and no raw
JavaScript anywhere** (ADR-973's cap, mechanically enforced) · output satisfies the output schema ·
gates exist · **validation is total — no partial persist** · and the read side fails safe, so a
function whose primitive vanished resolves to nothing and logs rather than throwing.

**Arm B** (M1–M6): every primitive names a module + export that exist · every schema roots at `z` ·
manifests declared once · **`.from('loom_functions')` only in `lib/loom/store.ts`** (lifted verbatim
from `check-elements.mjs`) · the store's write path actually calls the validator.

🔴 **No `// loom-ok:` on arm A.** A per-row bypass on a write-time validator is a plugin platform
with extra steps. The exit is a PR adding a primitive — Layer 1, engineers, CI-gated — which is
exactly [ADR-973](DECISIONS.md)'s split.

⚠️ **Arm B should land with E2**, when `LOOM_PRIMITIVES` first exists. **A manifest with no gate is
how `library_usages` got dropped five days after creation.**

**Cannot see:** whether a composition is useful or fast · cost · **functions already stored when a
primitive is later retired** — until `block_usage` exists, *retiring a primitive is not reversible
from CI*, and the header must say so · prompt-injected declarations (arm A proves well-formed, not
intended).

---

## 5. `check:email-blocks`

**Invariant:** the email offer and the email renderer are the same set, and nothing that touches the
database *inside a renderer* is in it.

⚠️ **The measured correction.** §7.2 first said *"`KNOWN_BLOCK_IDS` ⇄ renderer switch."* That gate
**fails on a clean tree**: `KNOWN_BLOCK_IDS` is all **36** entity ids (`block-content.ts:1286` — it is
the *prototype-pollution allowlist*, deliberately the whole registry) while the switch has **14**. The
bijection that holds is **`EMAIL_PALETTE_BLOCK_IDS` ⇄ switch, 14 ⇄ 14, exact both directions.**
`KNOWN_BLOCK_IDS`' correct assertion is *superset, and **derived** rather than restated*.

| # | Assertion | Today |
|---|---|---|
| **E1** | `EMAIL_PALETTE_BLOCK_IDS` ⇄ switch cases, exact | ✅ 14 ⇄ 14 |
| **E2/E3** | Palette ⇄ `kinds` includes `'email'`, both directions | ✅ 14/14 |
| **E4** | No `reads:'live'` in the palette without `resolveAt:'send'` + a registered resolver | `productCard`, legal once declared |
| **E5** | `KNOWN_BLOCK_IDS` ⊇ palette **and derived**, never a restated literal | ✅ |
| **E6** | The switch has a `default:` returning empty — fail-closed on a cron | ✅ |
| **E7** | `MAX_COLUMNS_BY_KIND.email === 1` | ✅ |
| **E8** | Send-path integrity — the three crons still reach the renderer through `compileEmailDoc` | ✅ |
| **E9** | **Integrity: if the walker stops finding `renderBlockInner`, that is a hard failure** | — |

**E9 is the important one.** A parser that silently finds zero cases would report a perfect bijection
against an empty set. `check-render-path.mjs` already learned this: *fix it; do not lower the floor.*

**Why AST and not grep, concretely:** a naive `grep "case '"` returns **27** hits in `render.ts`; the
AST walk over `renderBlockInner`'s body returns exactly the **14** that matter.

**Cannot see:** whether the HTML renders in Outlook (this proves *coverage*, not *correctness* — the
golden-string harness is the output gate and does not exist yet) · merge tags, voice, contrast ·
send-time resolution falling back to a stale snapshot (by design) · deliverability.

**Ships with E0**, ~120 lines, passes today — protecting the send path *before* block ids start
moving, which is precisely when one is most likely to move.

---

## 6. The five ratchets

### They go in `scripts/block-baselines.json`, not `adoption-baselines.json`

`check:adoption` is a **regex-over-a-file-corpus** harness whose `frozen.basis` fingerprints
`patterns`. These are **structural counts over parsed ASTs**. Forcing them into `patterns` reproduces
the `adhoc-progress` failure — *the pattern named a class that no longer exists* — the moment a symbol
is renamed.

A sibling ledger reusing `basisFingerprint`, `auditProvenance`, `mergeBaselines` and
`formatScoreboard` keeps provenance integrity, the asymmetric merge and `--allow-raise` identical.
**Only `basis` changes: it fingerprints the manifest, not the patterns.** Same principle, one level
up — *change what you count and the number stops being comparable.*

| Key | First draft | **Measured** | Direction |
|---|---:|---:|---|
| `block-systems` | ~~3~~ | **5** | → 1 |
| `unbound-app-surfaces` | 157 | **157** ✅ | → 0 |
| `block-types-total` | ~~~138~~ | **304** | → ~49 |
| `blocks-without-totext` | all | **304** — zero `toText` in the repo | → 0 |
| `raw-css-paths` | — | **0** | **must stay 0** ([ADR-974](DECISIONS.md) D-1) |

Each is emitted by the guard that owns it (`--ratchet`), so the number and its assertions share one
manifest and cannot drift apart. Seed all five in **one PR, one `--update` per key** — the harness
already refuses a multi-key update sharing one reason — with `frozen.reason` recording that the
3 / ~138 figures were **superseded by measurement**, so the correction is auditable in the ledger and
not only in prose.

---

## 7. Wiring

```json
"check:blocks":          "node scripts/check-blocks.mjs",
"check:doc-safety":      "node scripts/check-doc-safety.mjs && vitest run test/contract/doc-safety.test.ts",
"check:surface-binding": "node scripts/check-surface-binding.mjs",
"check:loom-integrity":  "node scripts/check-loom-integrity.mjs",
"check:email-blocks":    "node scripts/check-email-blocks.mjs"
```

In `ci.yml`'s `checks` loop: `surface-binding` beside `menu` (shared manifests), `email-blocks` beside
`blocks` (shared `SEND_RESOLVERS`).

⚠️ **The success line is already stale** — `ci.yml` echoes *"All 21 contract guards passed"* while the
loop runs **23**, and it goes to **28**. **Derive it** (`${#guards[@]}`) so it cannot rot again.

Measured budget: four AST guards ≈1–2 s against a 13 s aggregate; doc-safety's single-file vitest run
≈3–5 s. The job goes ~55 s → ~60 s.

---

## 8. One thing worth saying plainly

**Four of these five would pass on the tree as it stands**, or pass after a two-line manifest entry.
`check:email-blocks` is green right now — 14 ⇄ 14, exact, both directions.

That is the whole argument for E0. A gate written against the tree it is about to protect can be
verified green on day one, so the first time it goes red it is telling you something true. A gate
written *after* the change it was meant to catch never gets that moment — as `check:menu` learned,
spending its first year enforcing a naming convention while the invariant walked past it.
