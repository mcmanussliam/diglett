import type { KnownBlock } from "@slack/types";
import type { Diagnosis } from "../integrations/anthropic.js";
import type { GitHubRunContext } from "../agent/context-extractor.js";

export function buildDiagnosisCard(
  context: GitHubRunContext,
  diagnosis: Diagnosis,
): { text: string; blocks: KnownBlock[] } {
  const { summary, root_cause, fix_suggestion, confidence } = diagnosis;

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `:mag: Pipeline Failure Analysis`,
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
          text: "View Run",
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
