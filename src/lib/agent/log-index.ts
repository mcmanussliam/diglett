const INITIAL_EXCERPT_CONTEXT_LINES = 10;
const MAX_INITIAL_EXCERPTS = 6;
const MAX_SEARCH_RESULTS = 8;
const TOOL_RESULT_CHARS = 18_000;

const SIGNAL_RE =
  /\b(error|failed|failure|fatal|exception|panic|abort|cannot|could not|no such|permission denied|exit code [1-9]|found \d+ errors?)\b|[×✖]/i;
const ANNOTATION_RE = /^(?:\d{4}-\d{2}-\d{2}T[^\s]+\s+)?::(error|warning)\b/i;
const ESC = String.fromCharCode(27);

export interface LogExcerpt {
  around_line: number;
  reason: string;
  lines: string[];
}

export interface InitialLogEvidence {
  line_count: number;
  excerpts: LogExcerpt[];
}

function normalizeLines(raw: string): string[] {
  const withoutAnsi = stripAnsi(raw);
  const lines = withoutAnsi.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  return lines.length === 1 && lines[0] === "" ? [] : lines;
}

function stripAnsi(raw: string): string {
  let output = "";

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== ESC) {
      output += raw[i];
      continue;
    }

    while (i < raw.length && raw[i] !== "m") {
      i++;
    }
  }

  return output;
}

function isSignalLine(line: string): boolean {
  return SIGNAL_RE.test(line) || ANNOTATION_RE.test(line);
}

function formatLine(lineNumber: number, text: string): string {
  return `${lineNumber}: ${text}`;
}

function trimToBudget(text: string): string {
  return text.length <= TOOL_RESULT_CHARS ? text : `${text.slice(0, TOOL_RESULT_CHARS)}\n...`;
}

/**
 * Request-scoped line index over one GitHub Actions job log.
 *
 * This keeps only the raw lines and exposes two reveal operations: exact text search and
 * line-number windows. The initial prompt receives a small JSON-safe evidence object.
 */
export class LogIndex {
  private readonly lines: string[];

  constructor(raw: string) {
    this.lines = normalizeLines(raw);
  }

  buildInitialEvidence(): InitialLogEvidence {
    if (this.lines.length === 0) {
      return { line_count: 0, excerpts: [] };
    }

    const signalLines = this.lines
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter(({ line }) => isSignalLine(line))
      .map(({ lineNumber }) => lineNumber);

    const excerptLines = this.clusterLineNumbers(signalLines).slice(0, MAX_INITIAL_EXCERPTS);
    const fallbackLines = excerptLines.length > 0 ? excerptLines : [Math.max(1, this.lines.length)];

    return {
      line_count: this.lines.length,
      excerpts: fallbackLines.map((lineNumber) => ({
        around_line: lineNumber,
        reason: excerptLines.length > 0 ? "signal" : "tail",
        lines: this.getWindowLines(
          lineNumber,
          excerptLines.length > 0 ? INITIAL_EXCERPT_CONTEXT_LINES : 30,
          excerptLines.length > 0 ? INITIAL_EXCERPT_CONTEXT_LINES : 0,
        ),
      })),
    };
  }

  search(query: string, contextLines: number): string {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return JSON.stringify({ query, matches: [], error: "Search query was empty." });
    }

    const matches = this.lines
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter(({ line }) => line.toLowerCase().includes(normalizedQuery))
      .slice(0, MAX_SEARCH_RESULTS);

    if (matches.length === 0) {
      return JSON.stringify({ query, matches: [] });
    }

    return trimToBudget(
      JSON.stringify({
        query,
        matches: matches.map(({ lineNumber }) => ({
          around_line: lineNumber,
          lines: this.getWindowLines(lineNumber, contextLines, contextLines),
        })),
      }),
    );
  }

  fetchWindow(lineNumber: number, before: number, after: number): string {
    if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > this.lines.length) {
      return JSON.stringify({
        line: lineNumber,
        error: `Line ${lineNumber} is outside the log range 1-${this.lines.length}.`,
      });
    }

    return trimToBudget(
      JSON.stringify({
        around_line: lineNumber,
        lines: this.getWindowLines(lineNumber, before, after),
      }),
    );
  }

  private clusterLineNumbers(lineNumbers: number[]): number[] {
    const sorted = [...new Set(lineNumbers)].sort((a, b) => a - b);
    return sorted.filter(
      (lineNumber, index, all) =>
        index === 0 || lineNumber - (all[index - 1] ?? 0) > INITIAL_EXCERPT_CONTEXT_LINES,
    );
  }

  private getWindowLines(lineNumber: number, before: number, after: number): string[] {
    const safeBefore = Math.max(0, Math.min(before, 80));
    const safeAfter = Math.max(0, Math.min(after, 120));
    const start = Math.max(1, lineNumber - safeBefore);
    const end = Math.min(this.lines.length, lineNumber + safeAfter);

    return this.lines.slice(start - 1, end).map((line, offset) => formatLine(start + offset, line));
  }
}

export function buildLogIndex(raw: string): LogIndex {
  return new LogIndex(raw);
}
