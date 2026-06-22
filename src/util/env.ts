import "dotenv/config";
import { z } from "zod";
import { resolveWithSchema } from "./resolve-with-schema.js";

const environmentSchema = z.object({
  // slack oauth
  SLACK_CLIENT_ID: z.string().min(1),
  SLACK_CLIENT_SECRET: z.string().min(1),
  SLACK_SIGNING_SECRET: z.string().min(1),
  SLACK_STATE_SECRET: z.string().min(1),
  SLACK_REDIRECT_URI: z.url(),

  // claude
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().default(4096),
  ANTHROPIC_EFFORT_LEVEL: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),

  // github
  GITHUB_PAT: z.string().min(1),

  // database
  DB_PATH: z.string().min(1).default("./diglett.db"),

  // server
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  MAX_TOOL_ITERATIONS: z.coerce.number(),
});

/** Values resolved from `.env` */
export const env = resolveWithSchema("Environment", () => process.env, environmentSchema);
