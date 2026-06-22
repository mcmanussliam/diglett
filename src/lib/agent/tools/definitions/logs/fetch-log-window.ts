import { z } from "zod/v3";
import { defineTool } from "../../define-tool.js";

export const fetchLogWindowTool = defineTool({
  name: "fetch_log_window",
  description:
    "Fetch raw log lines around a specific line number. Use this after the overview or search results identify a useful line.",
  inputSchema: z.object({
    line: z.number().int().positive().describe("One-based line number in the job log"),
    before: z.number().int().min(0).max(80).default(15).describe("Lines to include before line"),
    after: z.number().int().min(0).max(120).default(30).describe("Lines to include after line"),
  }),
  execute: async (input, context) =>
    context.logs.fetchWindow(input.line, input.before, input.after),
});
