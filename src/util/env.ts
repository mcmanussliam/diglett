import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  // slack
  SLACK_BOT_TOKEN: z.string().min(1),
  SLACK_SIGNING_SECRET: z.string().min(1),

  // integrations
  ANTHROPIC_API_KEY: z.string().min(1),
  GITHUB_PAT: z.string().min(1),

  // server
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']),
});

type Env = z.infer<typeof environmentSchema>;

function init(): Env {
  const parsed = environmentSchema.safeParse(process.env);
  if (!parsed.success) {
    const tree = z.treeifyError(parsed.error);
    throw new Error(`Invalid environment variables:\n${JSON.stringify(tree, undefined, 2)}`);
  }

  return parsed.data;
}

export const env = init();
