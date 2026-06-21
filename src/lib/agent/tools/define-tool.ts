import type { Tool } from "@anthropic-ai/sdk/resources/messages.js";
import type { SlackRtsClient } from "../../integrations/slack-rts.js";
import type { GitHubRunContext } from "../context-extractor.js";

export type AgentToolInput = Record<string, unknown>;

export interface AgentToolContext {
  run: GitHubRunContext;
  slackRts?: SlackRtsClient;
}

export interface AgentTool<TInput extends AgentToolInput = AgentToolInput> {
  name: string;
  schema: Tool;
  isAvailable: (context: AgentToolContext) => boolean;
  execute: (input: TInput, context: AgentToolContext) => Promise<string>;
}

interface AgentToolDefinition<TInput extends AgentToolInput> {
  name: string;
  description: string;
  inputSchema: Tool["input_schema"];
  isAvailable?: (context: AgentToolContext) => boolean;
  execute: (input: TInput, context: AgentToolContext) => Promise<string>;
}

export function defineTool<TInput extends AgentToolInput>(
  definition: AgentToolDefinition<TInput>,
): AgentTool<TInput> {
  return {
    name: definition.name,
    schema: {
      name: definition.name,
      description: definition.description,
      input_schema: definition.inputSchema,
    },
    isAvailable: definition.isAvailable ?? (() => true),
    execute: definition.execute,
  };
}

export function defineTools<const TTools extends readonly AgentTool[]>(tools: TTools): TTools {
  const names = new Set<string>();

  for (const tool of tools) {
    if (names.has(tool.name)) {
      throw new Error(`Duplicate agent tool name: ${tool.name}`);
    }

    names.add(tool.name);
  }

  return tools;
}

export async function executeToolByName(
  tools: readonly AgentTool[],
  name: string,
  input: unknown,
  context: AgentToolContext,
): Promise<string> {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) {
    return `Unknown tool: ${name}`;
  }

  try {
    return await tool.execute(toAgentToolInput(input), context);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return `Tool "${name}" failed: ${message}`;
  }
}

function toAgentToolInput(input: unknown): AgentToolInput {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as AgentToolInput)
    : {};
}

export function getAvailableTools(
  tools: readonly AgentTool[],
  context: AgentToolContext,
): AgentTool[] {
  return tools.filter((tool) => tool.isAvailable(context));
}

export function getToolSchemas(tools: readonly AgentTool[]): Tool[] {
  return tools.map((tool) => tool.schema);
}
