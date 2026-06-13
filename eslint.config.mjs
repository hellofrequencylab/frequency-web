import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Transient agent worktrees (parallel Claude sandboxes): stale copies of
    // repo files that double-report fixed warnings. Never lint them.
    ".claude/worktrees/**",
  ]),
  // ADR-246: ban the untyped admin-client cast. Use the typed `createAdminClient()`
  // and cast the specific payload/value if a column/table needs it. Genuinely-untyped
  // cases (a dynamic table name, or a table not yet in the generated types) may opt out
  // with `// eslint-disable-next-line no-restricted-syntax -- <reason>`.
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression > TSTypeReference > Identifier[name='SupabaseClient']",
          message:
            "Don't cast the admin client to untyped SupabaseClient (ADR-246). Use typed createAdminClient() and cast the specific payload/value. Genuinely-untyped cases may eslint-disable with a reason.",
        },
      ],
    },
  },
]);

export default eslintConfig;
