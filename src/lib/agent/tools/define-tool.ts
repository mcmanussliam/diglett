import type { Tool } from "@anthropic-ai/sdk/resources/messages.js";
import type { JsonSchema7Type } from "zod-to-json-schema";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod/v3";
import type { SlackRtsClient } from "../../integrations/slack-rts.js";
import type { GitHubRunContext } from "../context-extractor.js";

export type AgentToolInput = Record<string, unknown>;
type AgentToolSchema = z.ZodType<AgentToolInput>;

export interface AgentToolContext {
  run: GitHubRunContext;
  slackRts?: SlackRtsClient;
}

export interface AgentTool {
  name: string;
  schema: Tool;
  isAvailable: (context: AgentToolContext) => boolean;
  execute: (input: AgentToolInput, context: AgentToolContext) => Promise<string>;
}

interface AgentToolDefinition<TSchema extends AgentToolSchema> {
  name: string;
  description: string;
  inputSchema: TSchema;
  isAvailable?: (context: AgentToolContext) => boolean;
  execute: (input: z.infer<TSchema>, context: AgentToolContext) => Promise<string>;
}

function toAnthropicInputSchema(schema: AgentToolSchema): Tool["input_schema"] {
  const jsonSchema = zodToJsonSchema(schema, {
    $refStrategy: "none",
    target: "jsonSchema7",
  }) as JsonSchema7Type;
  const objectSchema =
    typeof jsonSchema === "object" && jsonSchema !== null && !Array.isArray(jsonSchema)
      ? jsonSchema
      : {};

  return {
    type: "object",
    properties: "properties" in objectSchema ? objectSchema.properties : {},
    required: "required" in objectSchema ? objectSchema.required : null,
  };
}

export function defineTool<TSchema extends AgentToolSchema>(
  definition: AgentToolDefinition<TSchema>,
): AgentTool {
  return {
    name: definition.name,
    schema: {
      name: definition.name,
      description: definition.description,
      input_schema: toAnthropicInputSchema(definition.inputSchema),
    },
    isAvailable: definition.isAvailable ?? (() => true),
    execute: async (input, context) =>
      definition.execute(definition.inputSchema.parse(input), context),
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
    if (e instanceof Error && e.name === "ZodError") {
      return `Tool "${name}" received invalid input: ${e.message}`;
    }
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
