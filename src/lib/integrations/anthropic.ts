import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import type { Message, MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages.js";
import { z } from "zod";
import { env } from "../../util/env.js";
import { err, ok, type Result } from "../../util/result.js";
import { getSystemPrompt } from "../../util/system-prompt.js";
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

export class AnthropicClient {
  private readonly client: Anthropic;

  private readonly logger = log.child({ name: "anthropic" });

  constructor(options?: ClientOptions) {
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...options });
  }

  /** Send one agent turn to Claude with the currently available tool schemas. */
  async chat(messages: MessageParam[], tools?: Tool[]): Promise<Result<Message>> {
    this.logger.debug({ turns: messages.length }, "calling claude");

    try {
      const message = await this.client.messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: env.ANTHROPIC_MAX_TOKENS,
        thinking: {
          type: "adaptive",
        },
        output_config: {
          effort: env.ANTHROPIC_EFFORT_LEVEL,
        },
        system: await getSystemPrompt(),
        tools: tools ?? [],
        messages,
      });

      return { ok: true, value: message };
    } catch (e) {
      this.logger.error({ err: e }, "claude api call failed");
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  parse(text: string): Result<Diagnosis> {
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
}

export const anthropic = new AnthropicClient();
