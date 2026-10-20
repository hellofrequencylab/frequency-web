import { defineBlock } from "../define-block";
import { fieldsForBlock } from "../block-content";
import { contentFromFields, textOfContent } from "./from-fields";

// THE HIGHLIGHTS BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const statsBlock = defineBlock({
  type: "stats",
  v: 1,
  kinds: ["member", "space"],
  reads: "live",
  content: contentFromFields("stats"),
  fields: fieldsForBlock("stats"),
  migrations: [],
  surfaces: {
    "profile-inapp": { density: "standard", fields: "*" },
    "spotlight-public": { density: "standard", fields: "*" },
    "space-profile": { density: "standard", fields: "*" },
    "space-site": { density: "standard", fields: "*" },
  },
  render: {
    web: () => import("@/components/entity-blocks/blocks/stats.web"),
    email: null,
  },
  toText: (content) => textOfContent(content, "stats"),
});
