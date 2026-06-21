import { fetchDockerHubTagsTool } from "./definitions/fetch-docker-hub-tags.js";
import { fetchGitHubReleasesTool } from "./definitions/fetch-github-releases.js";
import { fetchRepoFileTool } from "./definitions/fetch-repo-file.js";
import { searchSlackTool } from "./definitions/search-slack.js";
import { defineTools } from "./define-tool.js";

export { defineTools, executeToolByName, getAvailableTools, getToolSchemas } from "./define-tool.js";
export type { AgentTool, AgentToolContext, AgentToolInput } from "./define-tool.js";

export const AGENT_TOOLS = defineTools([
  fetchRepoFileTool,
  fetchGitHubReleasesTool,
  fetchDockerHubTagsTool,
  searchSlackTool,
]);
