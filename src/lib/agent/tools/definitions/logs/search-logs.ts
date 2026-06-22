import { z } from "zod/v3";
import { defineTool } from "../../define-tool.js";

export const searchLogsTool = defineTool({
  name: "search_logs",
  description:
    "Search the raw GitHub Actions job log and return line-numbered context windows. Use this for exact error text, file paths, commands, or package names.",
  inputSchema: z.object({
    query: z.string().min(1).describe("Exact text to search for in the job log"),
    context_lines: z
      .number()
      .int()
      .min(0)
      .max(50)
      .default(8)
      .describe("Lines of context before and after each match"),
  }),
  execute: async (input, context) => context.logs.search(input.query, input.context_lines),
});
