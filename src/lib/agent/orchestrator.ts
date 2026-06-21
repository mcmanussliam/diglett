import type {
  MessageParam,
  Tool,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages.js";
import { err, ok, type Result } from "../../util/result.js";
import { anthropic, type Diagnosis } from "../integrations/anthropic.js";
import { fetchDockerHubTags } from "../integrations/docker-hub.js";
import { github } from "../integrations/github.js";
import { SlackRtsClient } from "../integrations/slack-rts.js";
import { log } from "../logging/logger.js";
import type { GitHubRunContext } from "./context-extractor.js";
import { compressLogs } from "./log-compressor.js";

const logger = log.child({ name: "orchestrator" });

const MAX_ITERATIONS = 10;
const SOFT_LIMIT_ITERATION = 6;

const TOOLS: Tool[] = [
  {
    name: "fetch_repo_file",
    description:
      "Fetch the contents of a file from the repository being diagnosed. Use this to read CI workflow files, shell scripts, Dockerfiles, and any other code referenced in the logs.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "File path relative to repository root, e.g. '.github/workflows/deploy.yml' or 'scripts/retag.sh'",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "fetch_github_releases",
    description:
      "Fetch recent releases for any GitHub-hosted tool or dependency. Use this when logs or code reference a specific tool and you want to check for recent breaking changes.",
    input_schema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "GitHub owner or organisation" },
        repo: { type: "string", description: "GitHub repository name" },
        limit: { type: "number", description: "Number of releases to fetch (default 10)" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "fetch_docker_hub_tags",
    description:
      "Fetch recent tags for a Docker Hub image. Use this when logs or code reference Docker image pulls without a pinned digest.",
    input_schema: {
      type: "object",
      properties: {
        image: {
          type: "string",
          description:
            "Image name. For official images use 'library/alpine', for others use 'namespace/image'",
        },
      },
      required: ["image"],
    },
  },
  {
    name: "search_slack",
    description:
      "Search past Slack conversations for similar CI failures or relevant context about this repository or error message. Use this when you want to find if this error has been seen and discussed before.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query, e.g. the error message, repo name, or workflow name",
        },
        limit: {
          type: "number",
          description: "Max number of results to return (default 5)",
        },
      },
      required: ["query"],
    },
  },
];

function formatSlackResults(
  results: { text: string; permalink: string; channel: string }[],
): string {
  if (results.length === 0) {
    return "No Slack messages found for this query.";
  }

  return results.map((r, i) => `[${i + 1}] #${r.channel}\n${r.text}\n${r.permalink}`).join("\n\n");
}

async function toolFetchRepoFile(
  input: Record<string, unknown>,
  context: GitHubRunContext,
): Promise<string> {
  const path = input["path"] as string;
  const result = await github.fetchRepoFile(context, path);
  return result.ok && result.value ? result.value : `File not found: ${path}`;
}

async function toolFetchGitHubReleases(input: Record<string, unknown>): Promise<string> {
  const owner = input["owner"] as string;
  const repo = input["repo"] as string;
  const limit = typeof input["limit"] === "number" ? input["limit"] : 10;
  const result = await github.fetchReleases(owner, repo, limit);
  return result.ok ? result.value : `Failed to fetch releases: ${result.error.message}`;
}

async function toolFetchDockerHubTags(input: Record<string, unknown>): Promise<string> {
  const image = input["image"] as string;
  const result = await fetchDockerHubTags(image);
  return result.ok ? result.value : `Failed to fetch Docker tags: ${result.error.message}`;
}

async function toolSearchSlack(
  input: Record<string, unknown>,
  slackSearch?: SlackRtsClient,
): Promise<string> {
  if (!slackSearch) {
    return "Slack search is not available for this workspace.";
  }
  const query = input["query"] as string;
  const limit = typeof input["limit"] === "number" ? input["limit"] : 5;
  const result = await slackSearch.search(query, limit);
  return result.ok
    ? formatSlackResults(result.value)
    : `Slack search failed: ${result.error.message}`;
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  context: GitHubRunContext,
  slackSearch?: SlackRtsClient,
): Promise<string> {
  logger.debug({ tool: name }, "executing tool");

  if (name === "fetch_repo_file") {
    return toolFetchRepoFile(input, context);
  }
  if (name === "fetch_github_releases") {
    return toolFetchGitHubReleases(input);
  }
  if (name === "fetch_docker_hub_tags") {
    return toolFetchDockerHubTags(input);
  }
  if (name === "search_slack") {
    return toolSearchSlack(input, slackSearch);
  }

  return `Unknown tool: ${name}`;
}

function buildToolResults(
  toolUseBlocks: { id: string; name: string; input: unknown }[],
  results: string[],
): ToolResultBlockParam[] {
  return toolUseBlocks.map((block, i) => ({
    type: "tool_result" as const,
    tool_use_id: block.id,
    content: results[i] ?? "no result",
  }));
}

function parseDiagnosis(text: string): Result<Diagnosis> {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return err(new Error("Claude response contained no JSON diagnosis"));
  }

  return ok(JSON.parse(jsonMatch[0]) as Diagnosis);
}

async function buildInitialMessage(context: GitHubRunContext, compressed: string): Promise<string> {
  const workflowResult = await github.fetchWorkflowFile(context);
  const workflowSection =
    workflowResult.ok && workflowResult.value
      ? `\n\n--- Workflow file ---\n${workflowResult.value}`
      : "";

  return [
    `Repository: ${context.owner}/${context.repo}`,
    `Run: ${context.run_url}`,
    context.branch ? `Branch: ${context.branch}` : null,
    context.commit_sha ? `Commit: ${context.commit_sha}` : null,
    "",
    "--- Compressed logs ---",
    compressed,
    workflowSection,
    "",
    "Investigate the failure using the available tools, then respond with a JSON diagnosis.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

type ToolUseBlock = { id: string; name: string; input: unknown };

async function runToolRound(
  messages: MessageParam[],
  iteration: number,
  context: GitHubRunContext,
  tools: Tool[],
  slackSearch?: SlackRtsClient,
): Promise<Result<Diagnosis | null>> {
  const chatResult = await anthropic.chat(messages, tools);
  if (!chatResult.ok) {
    return err(chatResult.error);
  }

  const response = chatResult.value;

  if (response.stop_reason === "end_turn") {
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    return parseDiagnosis(text);
  }

  if (response.stop_reason !== "tool_use") {
    return err(new Error(`Unexpected stop reason: ${response.stop_reason}`));
  }

  const toolUseBlocks = response.content.filter((b) => b.type === "tool_use") as ToolUseBlock[];
  const results = await Promise.all(
    toolUseBlocks.map((block) =>
      executeTool(block.name, block.input as Record<string, unknown>, context, slackSearch),
    ),
  );

  messages.push({ role: "assistant", content: response.content });

  const toolResultContent: MessageParam["content"] = buildToolResults(toolUseBlocks, results);
  const nudge =
    iteration >= SOFT_LIMIT_ITERATION
      ? "\n\nYou have used many tool calls. Stop fetching files and provide your final JSON diagnosis now based on what you have gathered."
      : "";

  messages.push({
    role: "user",
    content: nudge
      ? [
          ...(Array.isArray(toolResultContent) ? toolResultContent : [toolResultContent]),
          { type: "text", text: nudge },
        ]
      : toolResultContent,
  });

  logger.debug(
    { iteration: iteration + 1, tools: toolUseBlocks.map((b) => b.name) },
    "tool round complete",
  );
  return ok(null);
}

export async function diagnose(
  context: GitHubRunContext,
  rawLogs: string,
  userToken?: string,
): Promise<Result<Diagnosis>> {
  const slackSearch = userToken ? new SlackRtsClient(userToken) : undefined;
  const tools = slackSearch ? TOOLS : TOOLS.filter((t) => t.name !== "search_slack");

  const compressed = compressLogs(rawLogs);
  const initialMessage = await buildInitialMessage(context, compressed);
  const messages: MessageParam[] = [{ role: "user", content: initialMessage }];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const roundResult = await runToolRound(messages, i, context, tools, slackSearch);
    if (!roundResult.ok) {
      return err(roundResult.error);
    }
    if (roundResult.value !== null) {
      return ok(roundResult.value);
    }
  }

  return err(new Error("agent exceeded maximum iterations without a diagnosis"));
}
