import "dotenv/config";
import { z } from "zod";
import { resolveWithSchema } from "./resolve-with-schema.js";

const environmentSchema = z.object({
  // slack
  SLACK_BOT_TOKEN: z.string().min(1),
  SLACK_SIGNING_SECRET: z.string().min(1),

  // integrations
  ANTHROPIC_API_KEY: z.string().min(1),
  GITHUB_PAT: z.string().min(1),

  // server
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
});

export const env = resolveWithSchema('Environment', () => process.env, environmentSchema);
