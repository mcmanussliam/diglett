import Anthropic from "@anthropic-ai/sdk";
import { log } from "../logging/logger.js";
import { env } from "../../util/env.js";
import { ok, err, type Result } from "../../util/result.js";
import type { GitHubRunContext } from "../agent/context-extractor.js";

const logger = log.child({ name: "anthropic" });

export interface Diagnosis {
  summary: string;
  root_cause: string;
  fix_suggestion: string;
  confidence: "high" | "medium" | "low";
}

const SYSTEM_PROMPT = `
You are Diglett, a CI/CD failure diagnosis assistant embedded in Slack.
You receive compressed GitHub Actions logs and return a structured JSON diagnosis.

Rules:
- Be concise — engineers read this in Slack, not a report
- Focus on root cause, not symptoms
- If logs are insufficient, say so in root_cause
- Always respond with valid JSON matching the schema exactly`;

const RESPONSE_SCHEMA = `
{
  "summary": "one sentence description of what failed",
  "root_cause": "the underlying cause, not just the symptom",
  "fix_suggestion": "concrete actionable fix",
  "confidence": "high | medium | low"
}`;

function createAnthropicClient() {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  async function diagnose(
    context: GitHubRunContext,
    compressedLogs: string,
  ): Promise<Result<Diagnosis>> {
    const userMessage = [
      `Repository: ${context.owner}/${context.repo}`,
      `Run: ${context.run_url}`,
      context.branch ? `Branch: ${context.branch}` : null,
      context.commit_sha ? `Commit: ${context.commit_sha}` : null,
      "",
      "--- Compressed logs ---",
      compressedLogs,
      "",
      `Respond with JSON only, matching this schema:\n${RESPONSE_SCHEMA}`,
    ]
      .filter((l) => l !== null)
      .join("\n");

    logger.debug({ owner: context.owner, repo: context.repo }, "sending logs to claude");

    try {
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const text = message.content.find((b) => b.type === "text")?.text ?? "";

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return err(new Error("Claude response contained no JSON"));
      }

      const diagnosis = JSON.parse(jsonMatch[0]) as Diagnosis;
      logger.debug({ confidence: diagnosis.confidence }, "diagnosis complete");
      return ok(diagnosis);
    } catch (e) {
      logger.error({ err: e }, "failed to get diagnosis from claude");
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  return { diagnose };
}

export const anthropic = createAnthropicClient();
