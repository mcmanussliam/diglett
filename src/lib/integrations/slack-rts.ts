import { WebClient } from "@slack/web-api";
import { z } from "zod";
import { err, ok, type Result } from "../../util/result.js";
import { log } from "../logging/logger.js";

const logger = log.child({ name: "slack-rts" });

export interface SlackRtsResult {
  text: string;
  permalink: string;
  channel: string;
  ts: string;
}

const rtsMessageSchema = z
  .object({
    text: z.string().optional(),
    permalink: z.string().optional(),
    ts: z.string().optional(),
    channel: z.object({ name: z.string().optional() }).optional(),
  })
  .passthrough();

const rtsResponseSchema = z
  .object({
    messages: z
      .object({
        matches: z.array(rtsMessageSchema).optional(),
      })
      .optional(),
  })
  .passthrough();

/**
 * Normalize Slack RTS responses into the compact shape used by the agent.
 *
 * Slack's SDK does not currently expose a typed `assistant.search.context` helper, so the response
 * is treated as unknown and validated here at the integration boundary.
 */
export function normalizeRtsResponse(response: unknown): SlackRtsResult[] {
  const parsed = rtsResponseSchema.safeParse(response);
  if (!parsed.success) {
    return [];
  }

  const rtsResponse = parsed.data;
  const matches = rtsResponse.messages?.matches ?? [];

  const out: SlackRtsResult[] = [];

  for (const match of matches) {
    if (!match.text || !match.permalink) {
      continue;
    }

    out.push({
      text: match.text?.slice(0, 500) ?? "",
      permalink: match.permalink ?? "",
      channel: match.channel?.name ?? "unknown",
      ts: match.ts ?? "",
    });
  }

  return out;
}

export class SlackRtsClient {
  private readonly client: WebClient;

  constructor(userToken: string) {
    this.client = new WebClient(userToken);
  }

  /** Search workspace context through Slack RTS using the installed user's token. */
  async search(query: string, limit = 5): Promise<Result<SlackRtsResult[]>> {
    try {
      const response = await this.client.apiCall("assistant.search.context", {
        query,
        limit,
      });

      const results = normalizeRtsResponse(response);

      logger.debug({ query, count: results.length }, "Slack rts search complete");
      return ok(results);

    } catch (e) {
      logger.warn({ err: e, query }, "Slack rts search failed");
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
