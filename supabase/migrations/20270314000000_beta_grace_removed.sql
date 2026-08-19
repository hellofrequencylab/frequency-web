-- BETA GRACE REMOVED — the feature-gate grace window is cleared, and the paid ladder bites from today.
--
-- OWNER DECISION, 2026-08-19: "beta grace for private invites to the $490 year. everything else
-- removed." The half that survives is the PRIVATE price grant (`spaces.beta_price_grant`, ADR-1061),
-- which is a per-Space fact the CHECKOUT reads and has nothing to do with this row. The half that is
-- removed is the platform-wide FEATURE-GATE grace window (`pricing_settings.beta_grace`, ADR-874),
-- which was still set to end 2026-09-01 for everyone.
--
-- WHY A ROW AND NOT A PER-SPACE FLAG. `featureGatesLive()` is ONE boolean read at ~25 call sites
-- across both entitlement axes. A per-Space grace variant would re-conflate the two switches ADR-874
-- exists to separate, and would have to be threaded through every gating seam. The private invite
-- does not need it: a named Space is served by `beta_price_grant` (the founding RATE) plus a direct
-- plan grant, both of which are one-field operator actions on /admin/spaces/[id].
--
-- WHAT FLIPS THE INSTANT THIS LANDS: featureGatesLive() = billingLive() && !betaGraceActive(...).
-- `billing_live` has been true in production since 2026-07-25, so clearing this row is the whole
-- change. The gates, the meters, the seat wall and the upsell teases all begin enforcing.
--
-- MEASURED CONSEQUENCE, production, 2026-08-19 (ADR-1087 carries the full reading): every non-root
-- Space holds 0 contacts and 0 QR codes, so no Space crosses a meter on the day this lands. The root
-- Space (`type = 'root'`, 573 contacts, 42 codes) is exempt from metering entirely
-- (lib/pricing/space-allowance.ts rule 2). The grandfather rule in `allowanceVerdict` means a cap
-- only ever stops the NEXT write, never hides or deletes what a Space already has.
--
-- 🔴 THIS ONE OVERWRITES, unlike the 20270201 seed beside it, and that difference is the decision.
-- That migration was insert-if-absent because it was making an invisible constant visible without
-- moving it, so an operator edit had to win. This one IS the operator edit, so it must land even
-- though a row already exists. `{"until": null}` is the EXPLICIT no-window value that `asBetaGrace`
-- honours (a missing / malformed value still fails safe to the code default window, which is why the
-- value is written explicitly rather than the row deleted).

-- `updated_by` is cleared rather than left pointing at the operator who last touched the row: this
-- edit was made by a migration, and an attribution that names somebody who did not make it is worse
-- than no attribution. The admin console writes a real profile id on every operator edit after this.

insert into public.pricing_settings (key, value)
values ('beta_grace', '{"until": null}'::jsonb)
on conflict (key) do update
  set value = excluded.value,
      updated_at = now(),
      updated_by = null;
