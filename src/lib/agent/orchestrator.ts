import type {
  MessageParam,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages.js";
import { err, ok, type Result } from "../../util/result.js";
import { anthropic, type Diagnosis } from "../integrations/anthropic.js";
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
import { env } from "../../util/env.js";

const logger = log.child({ name: "orchestrator" });

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

  return JSON.stringify({
    task: "diagnose_ci_failure",
    repository: {
      owner: context.owner,
      repo: context.repo,
    },
    run: {
      id: context.run_id,
      url: context.run_url,
      branch: context.branch,
      commit_sha: context.commit_sha,
      metadata: runMetadataResult.ok ? compactRunMetadata(runMetadataResult.value) : null,
    },
    workflow_file: workflowResult.ok ? workflowResult.value : null,
    initial_log_evidence: logs.buildInitialEvidence(),
    guidance:
      "Use search_logs or fetch_log_window if the initial_log_evidence is missing the exact failing file, command, or diagnostic block. Respond with the required JSON diagnosis.",
  });
}

export function compactRunMetadata(
  runMetadata: WorkflowRunMetadata | null,
): Record<string, string> | null {
  if (!runMetadata) {
    return null;
  }

  return Object.fromEntries(
    Object.entries({
      workflow: runMetadata.name,
      event: runMetadata.event,
      status: runMetadata.status,
      conclusion: runMetadata.conclusion,
      created_at: runMetadata.created_at,
      run_started_at: runMetadata.run_started_at,
      updated_at: runMetadata.updated_at,
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
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
    return anthropic.parse(text);
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
  messages.push({
    role: "user",
    content: Array.isArray(toolResultContent) ? toolResultContent : [toolResultContent]
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

  for (let i = 0; i < env.MAX_TOOL_ITERATIONS; i++) {
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
