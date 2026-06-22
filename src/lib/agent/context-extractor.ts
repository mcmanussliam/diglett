import { log } from "../logging/logger.js";

export interface GitHubRunContext {
  owner: string;
  repo: string;
  run_id: string;
  job_id: string | null;
  branch: string | null;
  commit_sha: string | null;
  run_url: string;
}

const logger = log.child({name: extractGitHubContext.name})

const JOB_URL_RE = /github\.com\/([^/\s]+)\/([^/\s]+)\/actions\/runs\/(\d+)\/jobs\/(\d+)/;
const RUN_URL_RE = /github\.com\/([^/\s]+)\/([^/\s]+)\/actions\/runs\/(\d+)/;
const BRANCH_RE = /(?:branch|ref):\s*([^\s,*]+)/i;
const COMMIT_RE = /(?:commit|sha):\s*([0-9a-f]{7,40})/i;

/**
 * Given a slack message extract the GitHub Actions run referenced.
 *
 * @param text to extract from.
 * @returns GitHubContext or null if no context can be resolved
 */
export function extractGitHubContext(text: string): GitHubRunContext | null {
  const jobMatch = text.match(JOB_URL_RE);
  const runMatch = text.match(RUN_URL_RE);

  const match = jobMatch ?? runMatch;
  if (!match) {
    logger.trace({text}, 'No match found in message');
    return null;
  }

  const [, owner, repo, run_id] = match;
  if (!owner || !repo || !run_id) {
    logger.trace({text}, 'No `owner`, `repo` or run `run_id` found within message');
    return null;
  }

  const context = {
    owner,
    repo,
    run_id,
    job_id: jobMatch?.[4] ?? null,
    branch: text.match(BRANCH_RE)?.[1] ?? null,
    commit_sha: text.match(COMMIT_RE)?.[1] ?? null,
    run_url: `https://github.com/${owner}/${repo}/actions/runs/${run_id}`,
  };

  logger.trace(
    { run_url: context.run_url, owner: context.owner, repo: context.repo },
    'Successfully resolved GitHub context'
  );

  return context;
}
