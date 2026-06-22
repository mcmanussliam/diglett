import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import { packageJson } from "../src/util/package-json.js";

interface Commit {
  hash: string;
  subject: string;
}

interface ParsedCommit {
  type: string;
  scope: string | null;
  breaking: boolean;
  description: string;
}

interface RenderInput {
  title: string;
  version: string;
  date: string;
  commits: Commit[];
}

const TYPE_HEADINGS: Record<string, string> = {
  feat: "Features",
  fix: "Fixes",
  docs: "Documentation",
  refactor: "Refactors",
  perf: "Performance",
  test: "Tests",
  build: "Build",
  ci: "CI",
  chore: "Chores",
  revert: "Reverts",
};

const TYPE_ORDER = ["feat", "fix", "perf", "refactor", "docs", "test", "build", "ci", "chore", "revert"];

export function parseConventionalCommit(subject: string): ParsedCommit | null {
  const match = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/);
  if (!match?.[1] || !match[4]) {
    return null;
  }

  return {
    type: match[1],
    scope: match[2] ?? null,
    breaking: match[3] === "!",
    description: match[4],
  };
}

export function renderChangelog(input: RenderInput): string {
  const groups = new Map<string, string[]>();

  for (const commit of input.commits) {
    const parsed = parseConventionalCommit(commit.subject);
    if (!parsed) {
      continue;
    }

    const scope = parsed.scope ? `(${parsed.scope}) ` : "";
    const breaking = parsed.breaking ? "**BREAKING** " : "";
    const line = `- ${breaking}${scope}${parsed.description} (\`${commit.hash}\`)`;
    const existing = groups.get(parsed.type) ?? [];
    existing.push(line);
    groups.set(parsed.type, existing);
  }

  const sections = TYPE_ORDER.flatMap((type) => {
    const entries = groups.get(type);
    if (!entries?.length) {
      return [];
    }

    return [`### ${TYPE_HEADINGS[type] ?? type}\n\n${entries.join("\n")}`];
  });

  return [
    `# ${input.title}`,
    "",
    `## ${input.version} - ${input.date}`,
    "",
    sections.length ? sections.join("\n\n") : "_No conventional commits found._",
    "",
  ].join("\n");
}

function readCommits(range?: string): Commit[] {
  const args = ["log", "--pretty=format:%h%x00%s"];
  if (range) {
    args.push(range);
  }

  const output = execFileSync("git", args, { encoding: "utf8" }).trim();
  if (!output) {
    return [];
  }

  return output.split("\n").map((line) => {
    const [hash = "", subject = ""] = line.split("\0");
    return { hash, subject };
  });
}

function parseArgs(args: string[]): { output: string; range?: string } {
  const parsed = {
    output: "CHANGELOG.md",
    range: undefined as string | undefined,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--output" || arg === "-o") {
      parsed.output = args[i + 1] ?? parsed.output;
      i++;
      continue;
    }

    if (arg === "--range" || arg === "-r") {
      parsed.range = args[i + 1];
      i++;
    }
  }

  return parsed;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isCliEntrypoint(): boolean {
  return basename(process.argv[1] ?? "") === "changelog.ts";
}

if (isCliEntrypoint()) {
  const args = parseArgs(process.argv.slice(2));
  const markdown = renderChangelog({
    title: "Changelog",
    version: packageJson.version,
    date: today(),
    commits: readCommits(args.range),
  });

  writeFileSync(args.output, markdown);
}
