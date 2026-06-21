import type { App } from "@slack/bolt";
import { log } from "../logging/logger.js";
import { extractGitHubContext } from "../agent/context-extractor.js";
import { github } from "../integrations/github.js";
import { compressLogs } from "../agent/log-compressor.js";
import { anthropic } from "../integrations/anthropic.js";
import { buildDiagnosisCard } from "../ui/diagnosis-card.js";

const logger = log.child({ name: "mentions" });

export const registerMentionHandler = (app: App): void => {
  app.event("app_mention", async ({ event, client, say }) => {
    const threadTs = event.thread_ts ?? event.ts;
    const channelId = event.channel;

    logger.debug({ channel: channelId, user: event.user }, "mention received");

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

    logger.debug(
      { run_url: context.run_url, owner: context.owner, repo: context.repo },
      "github context extracted",
    );

    const logsResult = await github.fetchJobLogs(context);
    if (!logsResult.ok) {
      await say({
        text: "Found the run but couldn't fetch logs from GitHub. Check that the run is complete and the repo is accessible.",
        thread_ts: threadTs,
      });
      return;
    }

    const compressed = compressLogs(logsResult.value);
    logger.debug(
      { raw_chars: logsResult.value.length, compressed_chars: compressed.length },
      "logs compressed",
    );

    const diagnosisResult = await anthropic.diagnose(context, compressed);
    if (!diagnosisResult.ok) {
      await say({
        text: "Fetched the logs but couldn't generate a diagnosis. Try again in a moment.",
        thread_ts: threadTs,
      });
      return;
    }

    const card = buildDiagnosisCard(context, diagnosisResult.value);

    await say({
      ...card,
      thread_ts: threadTs,
    });
  });
};
