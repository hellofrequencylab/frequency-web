import { defineBlock } from "../define-block";
import { fieldsForBlock } from "../block-content";
import { contentFromFields, textOfContent } from "./from-fields";

// THE JOURNEYS BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const journeysBlock = defineBlock({
  type: "journeys",
  v: 1,
  kinds: ["space"],
  reads: "live",
  content: contentFromFields("journeys"),
  fields: fieldsForBlock("journeys"),
  migrations: [],
  surfaces: {
    "space-profile": { density: "standard", fields: "*" },
    "space-site": { density: "standard", fields: "*" },
  },
  render: {
    web: () => import("@/components/entity-blocks/blocks/journeys.web"),
    email: null,
  },
  toText: (content) => textOfContent(content, "journeys"),
});
