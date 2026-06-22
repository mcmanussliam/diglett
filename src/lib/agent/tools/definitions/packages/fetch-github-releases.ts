import { z } from "zod/v3";
import { github } from "../../../../integrations/github.js";
import { defineTool } from "../../define-tool.js";

export const fetchGitHubReleasesTool = defineTool({
  name: "fetch_github_releases",
  description:
    "Fetch recent releases for any GitHub-hosted tool or dependency. Use this when logs or code reference a specific tool and you want to check for recent breaking changes.",
  inputSchema: z.object({
    owner: z.string().min(1).describe("GitHub owner or organisation"),
    repo: z.string().min(1).describe("GitHub repository name"),
    limit: z.number().int().positive().max(25).default(10).describe("Number of releases to fetch"),
  }),
  execute: async (input) => {
    const result = await github.fetchReleases(input.owner, input.repo, input.limit);
    return result.ok ? result.value : `Failed to fetch releases: ${result.error.message}`;
  },
});
