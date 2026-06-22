import { z } from "zod/v3";
import type { SlackRtsResult } from "../../../../integrations/slack-rts.js";
import { defineTool } from "../../define-tool.js";

function formatSlackResults(
  results: Pick<SlackRtsResult, "text" | "permalink" | "channel">[],
): string {
  if (results.length === 0) {
    return "No Slack messages found for this query.";
  }

  return results.map((r, i) => `[${i + 1}] #${r.channel}\n${r.text}\n${r.permalink}`).join("\n\n");
}

export const searchSlackTool = defineTool({
  name: "search_slack",
  description:
    "Search past Slack conversations for similar CI failures or relevant context about this repository or error message. Use this when you want to find if this error has been seen and discussed before.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("Search query, e.g. the error message, repo name, or workflow name"),
    limit: z
      .number()
      .int()
      .positive()
      .max(10)
      .default(5)
      .describe("Max number of results to return"),
  }),
  isAvailable: (context) => context.slackRts !== undefined,
  execute: async (input, context) => {
    if (!context.slackRts) {
      return "Slack search is not available for this workspace.";
    }

    const result = await context.slackRts.search(input.query, input.limit);
    return result.ok
      ? formatSlackResults(result.value)
      : `Slack search failed: ${result.error.message}`;
  },
});
