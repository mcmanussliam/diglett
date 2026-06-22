import { Octokit } from "@octokit/rest";
import { env } from "../../util/env.js";
import { err, ok, type Result } from "../../util/result.js";
import type { GitHubRunContext } from "../agent/context-extractor.js";
import { log } from "../logging/logger.js";

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

export interface WorkflowRunMetadata {
  name: string | null;
  status: string | null;
  conclusion: string | null;
  event: string | null;
  created_at: string | null;
  run_started_at: string | null;
  updated_at: string | null;
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

  async fetchRunMetadata(context: GitHubRunContext): Promise<Result<WorkflowRunMetadata | null>> {
    try {
      const { data } = await this.octokit.actions.getWorkflowRun({
        owner: context.owner,
        repo: context.repo,
        run_id: Number.parseInt(context.run_id, 10),
      });

      return ok({
        name: data.name ?? null,
        status: data.status ?? null,
        conclusion: data.conclusion ?? null,
        event: data.event ?? null,
        created_at: data.created_at ?? null,
        run_started_at: data.run_started_at ?? null,
        updated_at: data.updated_at ?? null,
      });
    } catch (e) {
      this.logger.warn({ err: e }, "failed to fetch run metadata");
      return ok(null);
    }
  }

  async fetchWorkflowFile(context: GitHubRunContext): Promise<Result<string | null>> {
    try {
      const { data: run } = await this.octokit.actions.getWorkflowRun({
        owner: context.owner,
        repo: context.repo,
        run_id: Number.parseInt(context.run_id, 10),
      });

      const { data: workflow } = await this.octokit.actions.getWorkflow({
        owner: context.owner,
        repo: context.repo,
        workflow_id: run.workflow_id,
      });

      return this.fetchRepoFile(context, workflow.path);
    } catch (e) {
      this.logger.warn({ err: e }, "failed to fetch workflow file");
      return ok(null);
    }
  }

  async fetchRepoFile(context: GitHubRunContext, path: string): Promise<Result<string | null>> {
    try {
      const params = {
        owner: context.owner,
        repo: context.repo,
        path,
        ...(context.commit_sha ? { ref: context.commit_sha } : {}),
      };

      const { data } = await this.octokit.repos.getContent(params);

      if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
        return ok(null);
      }

      const content = Buffer.from(data.content, "base64").toString("utf-8");
      this.logger.debug({ path, chars: content.length }, "repo file fetched");
      return ok(content);
    } catch (e) {
      this.logger.warn({ err: e, path }, "failed to fetch repo file");
      return ok(null);
    }
  }

  async fetchReleases(owner: string, repo: string, limit = 10): Promise<Result<string>> {
    try {
      const { data } = await this.octokit.repos.listReleases({ owner, repo, per_page: limit });

      const summary = data
        .map((r) =>
          [
            `## ${r.tag_name} — ${r.name ?? ""} (${r.published_at ?? "unknown"})`,
            r.body?.slice(0, 800) ?? "(no release notes)",
          ].join("\n"),
        )
        .join("\n\n---\n\n");

      return ok(summary || "No releases found");
    } catch (e) {
      this.logger.warn({ err: e }, "failed to fetch releases");
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}

export const github = new GitHubClient();
