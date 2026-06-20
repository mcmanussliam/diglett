const JOB_URL_RE = /github\.com\/([^/\s]+)\/([^/\s]+)\/actions\/runs\/(\d+)\/jobs\/(\d+)/;
const RUN_URL_RE = /github\.com\/([^/\s]+)\/([^/\s]+)\/actions\/runs\/(\d+)/;
const BRANCH_RE = /(?:branch|ref):\s*([^\s,*]+)/i;
const COMMIT_RE = /(?:commit|sha):\s*([0-9a-f]{7,40})/i;

export interface GitHubRunContext {
  owner: string;
  repo: string;
  run_id: string;
  job_id: string | null;
  branch: string | null;
  commit_sha: string | null;
  run_url: string;
}

export function extractGitHubContext(text: string): GitHubRunContext | null {
  const jobMatch = text.match(JOB_URL_RE);
  const runMatch = text.match(RUN_URL_RE);

  const match = jobMatch ?? runMatch;
  if (!match) {
    return null;
  }

  const [, owner, repo, run_id] = match;
  if (!owner || !repo || !run_id) {
    return null;
  }

  return {
    owner,
    repo,
    run_id,
    job_id: jobMatch?.[4] ?? null,
    branch: text.match(BRANCH_RE)?.[1] ?? null,
    commit_sha: text.match(COMMIT_RE)?.[1] ?? null,
    run_url: `https://github.com/${owner}/${repo}/actions/runs/${run_id}`,
  };
};
