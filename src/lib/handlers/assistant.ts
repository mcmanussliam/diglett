import { Assistant, App } from "@slack/bolt";
import { log } from "../logging/logger.js";
import { extractGitHubContext } from "../agent/context-extractor.js";
import { github } from "../integrations/github.js";
import { compressLogs } from "../agent/log-compressor.js";
import { anthropic } from "../integrations/anthropic.js";
import { buildDiagnosisCard } from "../ui/diagnosis-card.js";

const logger = log.child({ name: "assistant" });

const SUGGESTED_PROMPTS = [
  {
    title: "Diagnose a failing run",
    message: "Paste a GitHub Actions run URL and I'll diagnose what went wrong.",
  },
  {
    title: "Why did my last deploy fail?",
    message: "Why did my last deploy fail?",
  },
];

export const registerAssistantHandlers = (app: App): void => {
  const assistant = new Assistant({
    threadStarted: async ({ setSuggestedPrompts, setTitle }) => {
      await setTitle("CI Failure Diagnosis");
      await setSuggestedPrompts({
        title: "What can I help with?",
        prompts: SUGGESTED_PROMPTS,
      });
    },

    threadContextChanged: async ({ saveThreadContext }) => {
      await saveThreadContext();
    },

    userMessage: async ({ message, say, setStatus, setTitle }) => {
      const text = "text" in message && typeof message.text === "string" ? message.text : "";

      logger.debug("assistant message received");

      await setStatus("Looking for a GitHub Actions run URL...");

      const context = extractGitHubContext(text);

      if (!context) {
        await say({
          text: "Paste a GitHub Actions run URL and I'll diagnose what went wrong.",
        });
        return;
      }

      await setTitle(`${context.owner}/${context.repo} #${context.run_id}`);
      await setStatus("Fetching logs from GitHub...");

      const logsResult = await github.fetchJobLogs(context);
      if (!logsResult.ok) {
        await say({
          text: "Found the run but couldn't fetch logs. Check that the run is complete and the repo is accessible.",
        });

        return;
      }

      const compressed = compressLogs(logsResult.value);
      logger.debug(
        { raw_chars: logsResult.value.length, compressed_chars: compressed.length },
        "logs compressed",
      );

      await setStatus("Diagnosing with Claude...");

      const diagnosisResult = await anthropic.diagnose(context, compressed);
      if (!diagnosisResult.ok) {
        await say({
          text: "Fetched the logs but couldn't generate a diagnosis. Try again in a moment.",
        });

        return;
      }

      const card = buildDiagnosisCard(context, diagnosisResult.value);
      await say(card);
    },
  });

  app.assistant(assistant);
};
