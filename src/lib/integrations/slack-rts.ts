import { WebClient } from "@slack/web-api";
import { err, ok, type Result } from "../../util/result.js";
import { log } from "../logging/logger.js";

const logger = log.child({ name: "slack-rts" });

export interface SlackRtsResult {
  text: string;
  permalink: string;
  channel: string;
  ts: string;
}

interface RtsMessage {
  text?: string;
  permalink?: string;
  ts?: string;
  channel?: {
    name?: string;
  };
}

interface RtsResponse {
  messages?: {
    matches?: RtsMessage[];
  };
}

export function normalizeRtsResponse(response: unknown): SlackRtsResult[] {
  const rtsResponse = response as RtsResponse;
  const matches = rtsResponse.messages?.matches ?? [];

  return matches
    .filter((match): match is RtsMessage & { text: string; permalink: string } =>
      Boolean(match.text && match.permalink),
    )
    .map((match) => ({
      text: match.text.slice(0, 500),
      permalink: match.permalink,
      channel: match.channel?.name ?? "unknown",
      ts: match.ts ?? "",
    }));
}

export class SlackRtsClient {
  private readonly client: WebClient;

  constructor(userToken: string) {
    this.client = new WebClient(userToken);
  }

  async search(query: string, limit = 5): Promise<Result<SlackRtsResult[]>> {
    try {
      const response = await this.client.apiCall("assistant.search.context", {
        query,
        limit,
      });
      const results = normalizeRtsResponse(response);

      logger.debug({ query, count: results.length }, "slack rts search complete");
      return ok(results);
    } catch (e) {
      logger.warn({ err: e, query }, "slack rts search failed");
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
