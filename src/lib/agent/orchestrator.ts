import type {
  MessageParam,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages.js";
import { err, ok, type Result } from "../../util/result.js";
import { anthropic, type Diagnosis, parseDiagnosis } from "../integrations/anthropic.js";
import { github, type WorkflowRunMetadata } from "../integrations/github.js";
import { SlackRtsClient } from "../integrations/slack-rts.js";
import { log } from "../logging/logger.js";
import type { GitHubRunContext } from "./context-extractor.js";
import type { LogIndex } from "./log-index.js";
import { buildLogIndex } from "./log-index.js";
import {
  AGENT_TOOLS,
  type AgentTool,
  type AgentToolContext,
  executeToolByName,
  getAvailableTools,
  getToolSchemas,
} from "./tools/index.js";

const logger = log.child({ name: "orchestrator" });

const MAX_ITERATIONS = 10;
const SOFT_LIMIT_ITERATION = 6;

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

async function buildInitialMessage(context: GitHubRunContext, logs: LogIndex): Promise<string> {
  const [workflowResult, runMetadataResult] = await Promise.all([
    github.fetchWorkflowFile(context),
    github.fetchRunMetadata(context),
  ]);
  const workflowSection =
    workflowResult.ok && workflowResult.value
      ? `\n\n--- Workflow file ---\n${workflowResult.value}`
      : "";

  return [
    `Repository: ${context.owner}/${context.repo}`,
    `Run: ${context.run_url}`,
    context.branch ? `Branch: ${context.branch}` : null,
    context.commit_sha ? `Commit: ${context.commit_sha}` : null,
    formatRunMetadata(runMetadataResult.ok ? runMetadataResult.value : null),
    "",
    "--- Initial log evidence ---",
    logs.buildInitialOverview(),
    workflowSection,
    "",
    "Investigate the failure using the available tools, then respond with a JSON diagnosis.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function formatRunMetadata(runMetadata: WorkflowRunMetadata | null): string | null {
  if (!runMetadata) {
    return null;
  }

  const lines = [
    "",
    "--- Run metadata ---",
    field("Workflow", runMetadata.name),
    field("Event", runMetadata.event),
    field("Status", runMetadata.status),
    field("Conclusion", runMetadata.conclusion),
    field("Created", runMetadata.created_at),
    field("Started", runMetadata.run_started_at),
    field("Updated", runMetadata.updated_at),
  ].filter((line) => line !== null);

  return lines.length > 2 ? lines.join("\n") : null;
}

function field(label: string, value: string | null): string | null {
  return value ? `${label}: ${value}` : null;
}

function isToolUseBlock(block: unknown): block is ToolUseBlock {
  return (
    typeof block === "object" && block !== null && "type" in block && block.type === "tool_use"
  );
}

async function runToolRound(
  messages: MessageParam[],
  iteration: number,
  toolContext: AgentToolContext,
  tools: readonly AgentTool[],
): Promise<Result<Diagnosis | null>> {
  const chatResult = await anthropic.chat(messages, getToolSchemas(tools));
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

  const toolUseBlocks: ToolUseBlock[] = response.content.filter(isToolUseBlock);
  const results = await Promise.all(
    toolUseBlocks.map((block) => {
      logger.debug({ tool: block.name }, "executing tool");
      return executeToolByName(tools, block.name, block.input, toolContext);
    }),
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
  const logs = buildLogIndex(rawLogs);
  const toolContext: AgentToolContext = {
    run: context,
    logs,
    ...(userToken ? { slackRts: new SlackRtsClient(userToken) } : {}),
  };
  const tools = getAvailableTools(AGENT_TOOLS, toolContext);

  const initialMessage = await buildInitialMessage(context, logs);
  const messages: MessageParam[] = [{ role: "user", content: initialMessage }];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const roundResult = await runToolRound(messages, i, toolContext, tools);
    if (!roundResult.ok) {
      return err(roundResult.error);
    }
    if (roundResult.value !== null) {
      return ok(roundResult.value);
    }
  }

  return err(new Error("agent exceeded maximum iterations without a diagnosis"));
}
