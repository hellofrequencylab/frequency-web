# Local Zod3 upper-size gate

`zod@3.25.76.patch` is a local backport, not an upstream patched release or an advisory dismissal. It follows the security intent of [official Zod PR6652](https://github.com/colinhacks/zod/pull/6652), which fixes [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) in Zod4.6.6: reject an oversized constrained collection before parsing its elements.

Expo CLI requires Zod3.25.76. The patch changes only its CJS/ESM array `.max`, oversized array `.length`, and set `.max` branches to abort after recording their original size issue. Lower-bound and valid inputs retain parsing behavior. Zod3 maps have no size-bound API. Direct app Zod4.6.7 is unaffected.

As in the upstream fix, oversized invalid input stops element and outer refinements and suppresses later element errors. Consumers relying on those side effects must not use invalid input as an execution mechanism. Unconstrained collections remain unconstrained; this patch adds no global input budget. The mobile tests exercise bounded sync/async inputs, issue metadata, valid transforms, lower bounds, preprocessing, both module formats, and actual Expo schema/signing consumers. Native/device and provider acceptance are separate.
