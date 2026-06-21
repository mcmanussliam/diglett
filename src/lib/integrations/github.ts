import { Octokit } from "@octokit/rest";
import { log } from "../logging/logger.js";
import { env } from "../../util/env.js";
import { ok, err, type Result } from "../../util/result.js";
import type { GitHubRunContext } from "../agent/context-extractor.js";

export interface CommitInfo {
  sha: string;
  author: string;
  message: string;
  changed_files: string[];
}

export interface WorkflowRunSummary {
  total_recent: number;
  recent_failures: number;
  last_success_at: string | null;
}

export class GitHubClient {
  private readonly octokit = new Octokit({ auth: env.GITHUB_PAT });

  private readonly logger = log.child({ name: "github" });

  private async resolveJobId(context: GitHubRunContext): Promise<string | null> {
    if (context.job_id) {
      return context.job_id;
    }

    const { data } = await this.octokit.actions.listJobsForWorkflowRun({
      owner: context.owner,
      repo: context.repo,
      run_id: Number.parseInt(context.run_id, 10),
    });

    const failed = data.jobs.find((j) => j.conclusion === "failure");
    if (!failed) {
      this.logger.warn({ run_id: context.run_id }, "no failed job found in run");
      return null;
    }

    this.logger.debug({ job_id: failed.id }, "resolved failed job from run");
    return String(failed.id);
  }

  async fetchJobLogs(context: GitHubRunContext): Promise<Result<string>> {
    try {
      const jobId = await this.resolveJobId(context);
      if (!jobId) {
        return err(new Error("could not resolve a failed job ID for this run"));
      }

      const response = await this.octokit.actions.downloadJobLogsForWorkflowRun({
        owner: context.owner,
        repo: context.repo,
        job_id: Number.parseInt(jobId, 10),
      });

      const text =
        typeof response.data === "string" ? response.data : JSON.stringify(response.data);
      this.logger.debug({ job_id: jobId, chars: text.length }, "job logs fetched");
      return ok(text);
    } catch (e) {
      this.logger.error({ err: e }, "failed to fetch job logs");
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async fetchCommit(context: GitHubRunContext): Promise<Result<CommitInfo | null>> {
    if (!context.commit_sha) {
      return ok(null);
    }

    try {
      const { data } = await this.octokit.repos.getCommit({
        owner: context.owner,
        repo: context.repo,
        ref: context.commit_sha,
      });

      return ok({
        sha: data.sha,
        author: data.commit.author?.name ?? "unknown",
        message: data.commit.message.split("\n")[0] ?? "",
        changed_files: (data.files ?? []).map((f) => f.filename).slice(0, 20),
      });
    } catch (e) {
      this.logger.warn({ err: e }, "failed to fetch commit info");
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async fetchRunHistory(
    context: GitHubRunContext,
    workflowFile: string,
  ): Promise<Result<WorkflowRunSummary>> {
    try {
      const { data } = await this.octokit.actions.listWorkflowRuns({
        owner: context.owner,
        repo: context.repo,
        workflow_id: workflowFile,
        per_page: 10,
      });

      const runs = data.workflow_runs;
      const lastSuccess = runs.find((r) => r.conclusion === "success");

      return ok({
        total_recent: runs.length,
        recent_failures: runs.filter((r) => r.conclusion === "failure").length,
        last_success_at: lastSuccess?.created_at ?? null,
      });
    } catch (e) {
      this.logger.warn({ err: e }, "failed to fetch run history");
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}

export const github = new GitHubClient();
