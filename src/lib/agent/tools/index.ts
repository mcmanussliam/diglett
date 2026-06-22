import type { AgentTool } from "./define-tool.js";
import { defineTools } from "./define-tool.js";
import { fetchLogSectionTool } from "./definitions/logs/fetch-log-section.js";
import { fetchLogWindowTool } from "./definitions/logs/fetch-log-window.js";
import { listLogSectionsTool } from "./definitions/logs/list-log-sections.js";
import { searchLogsTool } from "./definitions/logs/search-logs.js";
import { fetchDockerHubTagsTool } from "./definitions/packages/fetch-docker-hub-tags.js";
import { fetchGitHubReleasesTool } from "./definitions/packages/fetch-github-releases.js";
import { fetchRepoFileTool } from "./definitions/repository/fetch-repo-file.js";
import { searchSlackTool } from "./definitions/slack/search-slack.js";

export type { AgentTool, AgentToolContext, AgentToolInput } from "./define-tool.js";
export {
  defineTools,
  executeToolByName,
  getAvailableTools,
  getToolSchemas,
} from "./define-tool.js";

export const AGENT_TOOLS = defineTools([
  // logs
  listLogSectionsTool,
  fetchLogSectionTool,
  searchLogsTool,
  fetchLogWindowTool,

  // dependencies
  fetchGitHubReleasesTool,
  fetchDockerHubTagsTool,

  // repo
  fetchRepoFileTool,

  // slack
  searchSlackTool,
] satisfies AgentTool[]);
