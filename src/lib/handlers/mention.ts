import type { App } from "@slack/bolt";
import { log } from "../logging/logger.js";
import { extractGitHubContext } from "../agent/context-extractor.js";

const logger = log.child({ name: "mentions" });

export const registerMentionHandler = (app: App): void => {
  app.event("app_mention", async ({ event, client, say }) => {
    const threadTs = event.thread_ts ?? event.ts;
    const channelId = event.channel;

    logger.debug({ channel: channelId, user: event.user }, "Mention received");

    const thread = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 1,
    });

    const parentText = thread.messages?.[0]?.text ?? "";

    const context = extractGitHubContext(parentText);
    if (!context) {
      await say({
        text: "I couldn't find a GitHub Actions run URL in this thread. Paste the run URL (e.g. `github.com/org/repo/actions/runs/123`) and I'll diagnose it.",
        thread_ts: threadTs,
      });

      return;
    }

    logger.debug({ run_url: context.run_url, owner: context.owner, repo: context.repo }, "GitHub context extracted");

    await say({
      text: `Found run: *${context.owner}/${context.repo}* — <${context.run_url}|Run #${context.run_id}>${context.branch ? ` on \`${context.branch}\`` : ""}`,
      thread_ts: threadTs,
    });
  });
};
