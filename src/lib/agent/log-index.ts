const INITIAL_OVERVIEW_CHARS = 12_000;
const TOOL_RESULT_CHARS = 18_000;
const DEFAULT_CONTEXT_LINES = 10;
const MAX_SEARCH_RESULTS = 8;

const SIGNAL_RE =
  /\b(error|failed|failure|fatal|exception|panic|abort|cannot|could not|no such|permission denied|exit code [1-9]|found \d+ errors?)\b|[×✖]/i;
const SECTION_START_RE = /^(?:\d{4}-\d{2}-\d{2}T[^\s]+\s+)?(?:##\[group\])?(Run .+)$/;
const ANNOTATION_RE = /^(?:\d{4}-\d{2}-\d{2}T[^\s]+\s+)?::(error|warning)\b/i;
const ESC = String.fromCharCode(27);

export interface LogSectionSummary {
  id: string;
  title: string;
  startLine: number;
  endLine: number;
  lineCount: number;
  signalCount: number;
  preview: string;
}

interface LogSection extends LogSectionSummary {
  lines: string[];
}

interface SignalWindow {
  lineNumber: number;
  sectionId: string;
  reason: string;
  lines: string[];
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

function detectSectionTitle(line: string): string | null {
  const trimmed = line.trim();
  const match = trimmed.match(SECTION_START_RE);
  if (match?.[1]) {
    return match[1].trim();
  }

  return null;
}

function isSignalLine(line: string): boolean {
  return SIGNAL_RE.test(line) || ANNOTATION_RE.test(line);
}

function trimToBudget(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n...(truncated)`;
}

function formatLine(lineNumber: number, text: string): string {
  return `${String(lineNumber).padStart(5, " ")} | ${text}`;
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * Indexed, request-scoped view over one GitHub Actions job log.
 *
 * The index gives Claude a compact initial overview plus exact reveal operations for sections,
 * search hits, and line windows. This avoids hiding the diagnostic block behind an aggressive
 * global compressor while still keeping the first prompt small.
 */
export class LogIndex {
  private readonly lines: string[];

  private readonly sections: LogSection[];

  constructor(raw: string) {
    this.lines = normalizeLines(raw);
    this.sections = this.buildSections();
  }

  get lineCount(): number {
    return this.lines.length;
  }

  listSections(): LogSectionSummary[] {
    return this.sections.map(({ lines: _lines, ...summary }) => summary);
  }

  buildInitialOverview(): string {
    if (this.lines.length === 0) {
      return "(no log output available)";
    }

    const signalWindows = this.collectSignalWindows(DEFAULT_CONTEXT_LINES);
    const sectionSummary = this.formatSectionList();
    const signalSummary =
      signalWindows.length > 0
        ? signalWindows
            .slice(0, MAX_SEARCH_RESULTS)
            .map((window) => this.formatWindow(window))
            .join("\n\n")
        : this.formatWindow({
            lineNumber: Math.max(1, this.lines.length),
            sectionId: this.sections.at(-1)?.id ?? "log",
            reason: "tail",
            lines: this.getWindowLines(Math.max(1, this.lines.length), 30, 0),
          });

    return trimToBudget(
      [
        `Log lines: ${this.lines.length}`,
        "",
        "--- Log sections ---",
        sectionSummary,
        "",
        "--- Failure-focused excerpts ---",
        signalSummary,
        "",
        "Use list_log_sections, fetch_log_section, search_logs, or fetch_log_window when you need more exact log context.",
      ].join("\n"),
      INITIAL_OVERVIEW_CHARS,
    );
  }

  formatSectionList(): string {
    if (this.sections.length === 0) {
      return "(no sections)";
    }

    return this.sections
      .map(
        (section) =>
          `${section.id}: ${section.title} (lines ${section.startLine}-${section.endLine}, ${section.signalCount} signal lines)\n  ${section.preview}`,
      )
      .join("\n");
  }

  fetchSection(sectionId: string): string {
    const section = this.sections.find((candidate) => candidate.id === sectionId);
    if (!section) {
      return `Unknown log section: ${sectionId}`;
    }

    const body = section.lines
      .map((line, offset) => formatLine(section.startLine + offset, line))
      .join("\n");

    return trimToBudget(
      `Section ${section.id}: ${section.title} (lines ${section.startLine}-${section.endLine})\n${body}`,
      TOOL_RESULT_CHARS,
    );
  }

  search(query: string, contextLines: number): string {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return "Search query was empty.";
    }

    const matches = this.lines
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter(({ line }) => line.toLowerCase().includes(normalizedQuery))
      .slice(0, MAX_SEARCH_RESULTS);

    if (matches.length === 0) {
      return `No log lines matched "${query}".`;
    }

    const windows = matches.map(({ lineNumber }) =>
      this.formatWindow({
        lineNumber,
        sectionId: this.findSectionForLine(lineNumber)?.id ?? "log",
        reason: `matched "${query}"`,
        lines: this.getWindowLines(lineNumber, contextLines, contextLines),
      }),
    );

    return trimToBudget(windows.join("\n\n"), TOOL_RESULT_CHARS);
  }

  fetchWindow(lineNumber: number, before: number, after: number): string {
    if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > this.lines.length) {
      return `Line ${lineNumber} is outside the log range 1-${this.lines.length}.`;
    }

    return trimToBudget(
      this.formatWindow({
        lineNumber,
        sectionId: this.findSectionForLine(lineNumber)?.id ?? "log",
        reason: "requested window",
        lines: this.getWindowLines(lineNumber, before, after),
      }),
      TOOL_RESULT_CHARS,
    );
  }

  private buildSections(): LogSection[] {
    if (this.lines.length === 0) {
      return [];
    }

    const starts = this.lines
      .map((line, index) => ({ title: detectSectionTitle(line), index }))
      .filter((item): item is { title: string; index: number } => item.title !== null);

    const boundaries = starts.length > 0 ? starts : [{ title: "Full log", index: 0 }];

    return boundaries.map((boundary, i) => {
      const nextBoundary = boundaries[i + 1];
      const endIndex = nextBoundary ? nextBoundary.index - 1 : this.lines.length - 1;
      const sectionLines = this.lines.slice(boundary.index, endIndex + 1);
      const signalCount = sectionLines.filter(isSignalLine).length;
      const preview = this.buildPreview(sectionLines);
      const startLine = boundary.index + 1;
      const endLine = endIndex + 1;

      return {
        id: `section_${i + 1}`,
        title: boundary.title,
        startLine,
        endLine,
        lineCount: sectionLines.length,
        signalCount,
        preview,
        lines: sectionLines,
      };
    });
  }

  private buildPreview(lines: string[]): string {
    const firstSignal = lines.find((line) => isSignalLine(line) && line.trim().length > 0);
    const firstNonEmpty = lines.find((line) => line.trim().length > 0);
    return (firstSignal ?? firstNonEmpty ?? "(empty section)").trim().slice(0, 180);
  }

  private collectSignalWindows(contextLines: number): SignalWindow[] {
    const signalLineNumbers = this.lines
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter(({ line }) => isSignalLine(line))
      .map(({ lineNumber }) => lineNumber);

    const clustered = uniqueSorted(signalLineNumbers).filter(
      (lineNumber, index, all) => index === 0 || lineNumber - (all[index - 1] ?? 0) > contextLines,
    );

    return clustered.map((lineNumber) => ({
      lineNumber,
      sectionId: this.findSectionForLine(lineNumber)?.id ?? "log",
      reason: "signal line",
      lines: this.getWindowLines(lineNumber, contextLines, contextLines),
    }));
  }

  private getWindowLines(lineNumber: number, before: number, after: number): string[] {
    const safeBefore = Math.max(0, Math.min(before, 80));
    const safeAfter = Math.max(0, Math.min(after, 120));
    const start = Math.max(1, lineNumber - safeBefore);
    const end = Math.min(this.lines.length, lineNumber + safeAfter);

    return this.lines.slice(start - 1, end).map((line, offset) => formatLine(start + offset, line));
  }

  private formatWindow(window: SignalWindow): string {
    return [
      `[${window.sectionId}] around line ${window.lineNumber} (${window.reason})`,
      ...window.lines,
    ].join("\n");
  }

  private findSectionForLine(lineNumber: number): LogSection | undefined {
    return this.sections.find(
      (section) => lineNumber >= section.startLine && lineNumber <= section.endLine,
    );
  }
}

export function buildLogIndex(raw: string): LogIndex {
  return new LogIndex(raw);
}
