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

function init(options?: ClientOptions) {
  const logger = log.child({ name: 'anthropic' });
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...options });

  async function chat(messages: MessageParam[], tools?: Tool[]): Promise<Result<Message>> {
    logger.debug({ turns: messages.length }, "Calling Claude");

    try {
      const message = await client.messages.create({
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
      logger.error({ err: e }, "Claude api call failed");
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  function parse(text: string): Result<Diagnosis> {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return err(new Error("Claude response contained no JSON diagnosis"));
    }

    const parsedJson = JSON.parse(jsonMatch[0]) as unknown;
    const parsedDiagnosis = diagnosisSchema.safeParse(parsedJson);
    if (!parsedDiagnosis.success) {
      return err(parsedDiagnosis.error);
    }

    return ok(parsedDiagnosis.data);
  }

  return { chat, parse }
}

export const anthropic = init();
