import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import type { Message, MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages.js";
import { z } from "zod";
import { env } from "../../util/env.js";
import { err, ok, type Result } from "../../util/result.js";
import { log } from "../logging/logger.js";

export const diagnosisSchema = z.object({
  summary: z.string().min(1),
  root_cause: z.string().min(1),
  fix_suggestion: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
  related_slack_thread_url: z.string().url().nullable().optional().default(null),
  related_slack_thread_preview: z.string().nullable().optional().default(null),
});

export type Diagnosis = z.infer<typeof diagnosisSchema>;

export const SYSTEM_PROMPT = `You are Diglett, a CI/CD failure diagnosis assistant embedded in Slack.
You have tools to investigate failures. Use them surgically — only fetch what is directly relevant to the error.

Rules:
- Only read files explicitly referenced in the logs, error output, or the workflow file
- Do not read files speculatively or to understand the broader codebase
- Check dependency/image releases only when the logs suggest a version-related failure (unexpected 404, format error, API change)
- Aim to diagnose in 3 tool calls or fewer — stop as soon as you have enough to identify root cause

When you have enough information, respond with JSON only:
{
  "summary": "one sentence description of what failed",
  "root_cause": "the underlying cause, not just the symptom",
  "fix_suggestion": "concrete actionable fix",
  "confidence": "high | medium | low",
  "related_slack_thread_url": "Slack permalink string or null",
  "related_slack_thread_preview": "short preview of the related Slack context or null"
}

If search_slack returns a relevant prior discussion, include its permalink and a short preview in the related Slack fields. If no relevant prior discussion is found, set both related Slack fields to null.

Be concise — engineers read this in Slack.`;

export function parseDiagnosis(text: string): Result<Diagnosis> {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return err(new Error("Claude response contained no JSON diagnosis"));
  }

  try {
    const parsedJson = JSON.parse(jsonMatch[0]) as unknown;
    const parsedDiagnosis = diagnosisSchema.safeParse(parsedJson);
    if (!parsedDiagnosis.success) {
      return err(parsedDiagnosis.error);
    }

    return ok(parsedDiagnosis.data);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

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
