import type {
  MessageParam,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages.js";
import { err, ok, type Result } from "../../util/result.js";
import { anthropic, type Diagnosis } from "../integrations/anthropic.js";
import { github } from "../integrations/github.js";
import { SlackRtsClient } from "../integrations/slack-rts.js";
import { log } from "../logging/logger.js";
import type { GitHubRunContext } from "./context-extractor.js";
import { compressLogs } from "./log-compressor.js";
import {
  AGENT_TOOLS,
  executeToolByName,
  getAvailableTools,
  getToolSchemas,
  type AgentTool,
  type AgentToolContext,
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

function parseDiagnosis(text: string): Result<Diagnosis> {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return err(new Error("Claude response contained no JSON diagnosis"));
  }

  try {
    return ok(JSON.parse(jsonMatch[0]) as Diagnosis);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
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

function isToolUseBlock(block: unknown): block is ToolUseBlock {
  return typeof block === "object" && block !== null && "type" in block && block.type === "tool_use";
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
  const toolContext: AgentToolContext = {
    run: context,
    ...(userToken ? { slackRts: new SlackRtsClient(userToken) } : {}),
  };
  const tools = getAvailableTools(AGENT_TOOLS, toolContext);

  const compressed = compressLogs(rawLogs);
  const initialMessage = await buildInitialMessage(context, compressed);
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
