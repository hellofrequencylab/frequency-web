import { defineBlock } from "../define-block";
import { fieldsForBlock } from "../block-content";
import { contentFromFields, textOfContent } from "./from-fields";

// THE MEMBERSHIPS BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const membershipsBlock = defineBlock({
  type: "memberships",
  v: 1,
  kinds: ["space"],
  reads: "live",
  content: contentFromFields("memberships"),
  fields: fieldsForBlock("memberships"),
  migrations: [],
  surfaces: {
    "space-profile": { density: "standard", fields: "*" },
    "space-site": { density: "standard", fields: "*" },
  },
  render: {
    web: () => import("@/components/entity-blocks/blocks/memberships.web"),
    email: null,
  },
  toText: (content) => textOfContent(content, "memberships"),
});
