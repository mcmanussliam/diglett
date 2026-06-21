import type { KnownBlock } from "@slack/types";
import type { GitHubRunContext } from "../agent/context-extractor.js";
import type { Diagnosis } from "../integrations/anthropic.js";

/** Build the Slack Block Kit message shown in the CI failure thread. */
export function buildDiagnosisCard(
  context: GitHubRunContext,
  diagnosis: Diagnosis,
): { text: string; blocks: KnownBlock[] } {
  const { summary, root_cause, fix_suggestion, confidence } = diagnosis;
  const hasRelatedSlackThread = Boolean(
    diagnosis.related_slack_thread_url && diagnosis.related_slack_thread_preview,
  );

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: ":mag: Pipeline Failure Analysis",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${summary}*`,
      },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: "Open GitHub Run",
          emoji: true,
        },
        url: context.run_url,
        action_id: "view_run",
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Root Cause*\n${root_cause}`,
        },
        {
          type: "mrkdwn",
          text: `*Confidence*\n${confidence}`,
        },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Suggested Fix*\n${fix_suggestion}`,
      },
    },
    ...(hasRelatedSlackThread
      ? ([
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Possible recurring issue*\nSimilar context appeared in Slack before: _${diagnosis.related_slack_thread_preview}_\n<${diagnosis.related_slack_thread_url}|View related thread>`,
            },
          },
        ] satisfies KnownBlock[])
      : []),
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${context.owner}/${context.repo} · <${context.run_url}|Run #${context.run_id}>${context.branch ? ` · \`${context.branch}\`` : ""}`,
        },
      ],
    },
  ];

  return {
    text: summary,
    blocks,
  };
}
