import { z } from "zod/v3";
import { defineTool } from "../../define-tool.js";

export const listLogSectionsTool = defineTool({
  name: "list_log_sections",
  description:
    "List GitHub Actions log sections with line ranges and signal counts. Use this before fetching a whole section.",
  inputSchema: z.object({}),
  execute: async (_input, context) => context.logs.formatSectionList(),
});
