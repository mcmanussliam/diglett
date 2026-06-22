import { z } from "zod/v3";
import { defineTool } from "../../define-tool.js";

export const fetchLogSectionTool = defineTool({
  name: "fetch_log_section",
  description:
    "Fetch one raw GitHub Actions log section by section ID. Use this when the overview points to a relevant step but more exact lines are needed.",
  inputSchema: z.object({
    section_id: z.string().min(1).describe("Section ID from list_log_sections, e.g. section_2"),
  }),
  execute: async (input, context) => context.logs.fetchSection(input.section_id),
});
