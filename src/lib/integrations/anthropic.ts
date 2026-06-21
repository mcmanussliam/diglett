import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import type { MessageParam, Tool, Message } from "@anthropic-ai/sdk/resources/messages.js";
import { log } from "../logging/logger.js";
import { env } from "../../util/env.js";
import { err, type Result } from "../../util/result.js";

export interface Diagnosis {
  summary: string;
  root_cause: string;
  fix_suggestion: string;
  confidence: "high" | "medium" | "low";
}

export const SYSTEM_PROMPT = `You are Diglett, a CI/CD failure diagnosis assistant embedded in Slack.
You have tools to investigate failures deeply. Use them to find the actual root cause — not just what the logs say.

Strategy:
1. Read the logs and any workflow file provided
2. Fetch relevant source files to understand what the code is actually doing
3. If failures involve Docker images, external tools, or dependencies, check recent releases for breaking changes
4. Correlate all findings to identify the true root cause

When you have enough information, respond with JSON only:
{
  "summary": "one sentence description of what failed",
  "root_cause": "the underlying cause, not just the symptom",
  "fix_suggestion": "concrete actionable fix",
  "confidence": "high | medium | low"
}

Be concise — engineers read this in Slack.`;

export class AnthropicClient {
  private readonly client: Anthropic;

  private readonly logger = log.child({ name: "anthropic" });

  constructor(options?: ClientOptions) {
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...options });
  }

  async chat(messages: MessageParam[], tools?: Tool[]): Promise<Result<Message>> {
    this.logger.debug({ turns: messages.length }, "calling claude");

    try {
      const message = await this.client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: tools ?? [],
        messages,
      });

      return { ok: true, value: message };
    } catch (e) {
      this.logger.error({ err: e }, "claude api call failed");
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}

export const anthropic = new AnthropicClient();
