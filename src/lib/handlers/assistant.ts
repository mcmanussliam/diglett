import { type App, Assistant, type AssistantUserMessageMiddleware } from "@slack/bolt";
import { extractGitHubContext } from "../agent/context-extractor.js";
import { diagnose } from "../agent/orchestrator.js";
import type { SqliteInstallationStore } from "../db/installation-store.js";
import { github } from "../integrations/github.js";
import { log } from "../logging/logger.js";
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

type UserMessageArgs = Parameters<AssistantUserMessageMiddleware>[0];

async function handleUserMessage(
  { message, say, setStatus, setTitle }: UserMessageArgs,
  installationStore: SqliteInstallationStore,
): Promise<void> {
  const text = "text" in message && typeof message.text === "string" ? message.text : "";
  const teamId = "team" in message && typeof message.team === "string" ? message.team : "";

  logger.debug("assistant message received");

  await setStatus("Looking for a GitHub Actions run URL...");

  const context = extractGitHubContext(text);

  if (!context) {
    await say({ text: "Paste a GitHub Actions run URL and I'll diagnose what went wrong." });
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

  await setStatus("Diagnosing with Claude...");

  const tokenResult = installationStore.fetchUserToken(teamId);
  if (!tokenResult.ok) {
    logger.debug(
      { teamId, err: tokenResult.error.message },
      "no installation found for team, skipping slack search",
    );
  }

  const diagnosisResult = await diagnose(
    context,
    logsResult.value,
    tokenResult.ok ? tokenResult.value : undefined,
  );
  if (!diagnosisResult.ok) {
    await say({
      text: "Fetched the logs but couldn't generate a diagnosis. Try again in a moment.",
    });
    return;
  }

  await say(buildDiagnosisCard(context, diagnosisResult.value));
}

export const registerAssistantHandlers = (
  app: App,
  installationStore: SqliteInstallationStore,
): void => {
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

    userMessage: (args) => handleUserMessage(args, installationStore),
  });

  app.assistant(assistant);
};
