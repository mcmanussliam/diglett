import type { Tool } from "@anthropic-ai/sdk/resources/messages.js";
import type { JsonSchema7Type } from "zod-to-json-schema";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod/v3";
import type { SlackRtsClient } from "../../integrations/slack-rts.js";
import type { GitHubRunContext } from "../context-extractor.js";

export type AgentToolInput = Record<string, unknown>;
type AgentToolSchema = z.ZodType<AgentToolInput>;

/**
 * Per-diagnosis dependencies available to tool executors.
 *
 * Keep this object request-scoped. Tools should receive clients through this context rather than
 * constructing their own user-specific clients at module load.
 */
export interface AgentToolContext {
  run: GitHubRunContext;
  slackRts?: SlackRtsClient;
}

/** A Claude-callable capability with its Anthropic schema and request-scoped executor. */
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

/**
 * Convert a Zod object schema into the subset of JSON Schema Anthropic expects for tool inputs.
 *
 * Tool definitions use `zod/v3` schemas because `zod-to-json-schema@3.25.x` supports Zod v4 as
 * a peer dependency but converts v3-style schemas.
 */
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

/**
 * Define a Claude-callable tool.
 *
 * The Zod schema is the source of truth: it generates the Anthropic schema and validates
 * model-supplied input before the executor runs.
 */
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

/** Register the complete tool list and fail fast if two tools expose the same name. */
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

/**
 * Execute a tool by name and convert all expected failure modes into text Claude can read.
 *
 * Tool failures are returned as tool results instead of thrown so one flaky external API does not
 * crash the whole diagnosis loop.
 */
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

/** Return tools that are usable for the current request context. */
export function getAvailableTools(
  tools: readonly AgentTool[],
  context: AgentToolContext,
): AgentTool[] {
  return tools.filter((tool) => tool.isAvailable(context));
}

/** Extract Anthropic tool schemas from executable tool definitions. */
export function getToolSchemas(tools: readonly AgentTool[]): Tool[] {
  return tools.map((tool) => tool.schema);
}
