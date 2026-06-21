import { WebClient } from "@slack/web-api";
import { err, ok, type Result } from "../../util/result.js";
import { log } from "../logging/logger.js";

const logger = log.child({ name: "slack-search" });

export interface SlackSearchResult {
  text: string;
  permalink: string;
  channel: string;
  ts: string;
}

export class SlackSearchClient {
  private readonly client: WebClient;

  constructor(userToken: string) {
    this.client = new WebClient(userToken);
  }

  async search(query: string, limit = 10): Promise<Result<SlackSearchResult[]>> {
    try {
      const response = await this.client.search.messages({
        query,
        count: limit,
        highlight: false,
        sort: "timestamp",
        sort_dir: "desc",
      });

      const matches = response.messages?.matches ?? [];
      const results = matches.map((m) => ({
        text: m.text ?? "",
        permalink: m.permalink ?? "",
        channel:
          typeof m.channel === "object" && m.channel !== null && "name" in m.channel
            ? String(m.channel.name)
            : "",
        ts: m.ts ?? "",
      }));

      logger.debug({ query, count: results.length }, "slack search complete");
      return ok(results);
    } catch (e) {
      logger.warn({ err: e, query }, "slack search failed");
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
