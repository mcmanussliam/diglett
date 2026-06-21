import { github } from "../../../integrations/github.js";
import { defineTool } from "../define-tool.js";

export const fetchGitHubReleasesTool = defineTool({
  name: "fetch_github_releases",
  description:
    "Fetch recent releases for any GitHub-hosted tool or dependency. Use this when logs or code reference a specific tool and you want to check for recent breaking changes.",
  inputSchema: {
    type: "object",
    properties: {
      owner: { type: "string", description: "GitHub owner or organisation" },
      repo: { type: "string", description: "GitHub repository name" },
      limit: { type: "number", description: "Number of releases to fetch (default 10)" },
    },
    required: ["owner", "repo"],
  },
  execute: async (input) => {
    const owner = typeof input.owner === "string" ? input.owner : "";
    const repo = typeof input.repo === "string" ? input.repo : "";
    const limit = typeof input.limit === "number" ? input.limit : 10;

    if (!owner) {
      return "Missing required tool input: owner";
    }
    if (!repo) {
      return "Missing required tool input: repo";
    }

    const result = await github.fetchReleases(owner, repo, limit);
    return result.ok ? result.value : `Failed to fetch releases: ${result.error.message}`;
  },
});
