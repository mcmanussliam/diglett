import { type Line, LogParser, Command } from "@robherley/actions-log-parser";

const CHAR_BUDGET = 15_000;
const ERROR_KEYWORDS =
  /\b(error|fail|fatal|exception|panic|abort|cannot|could not|no such|permission denied)\b/i;

function isSignificant(cmd: Command | undefined, content: string): boolean {
  return cmd === Command.Error || cmd === Command.Warning || ERROR_KEYWORDS.test(content);
}

function isStructural(cmd: Command | undefined): boolean {
  return cmd === Command.Group || cmd === Command.EndGroup;
}

function expandGroup(line: Line): string[] {
  return line.group?.children.filter((s) => !isStructural(s.cmd)).map((s) => s.content) ?? [];
}

function collectLines(lines: Line[]): string[] {
  const output: string[] = [];

  for (const line of lines) {
    if (isStructural(line.cmd)) {
      continue;
    }

    if (line.group) {
      if (isSignificant(line.cmd, line.content)) {
        output.push(...expandGroup(line));
      }
      continue;
    }

    if (isSignificant(line.cmd, line.content)) {
      output.push(line.content);
    }
  }

  return output;
}

function dedupe(lines: string[]): string[] {
  return lines.filter((line, i) => lines[i - 1] !== line);
}

function applyBudget(text: string): string {
  if (text.length <= CHAR_BUDGET) {
    return text;
  }

  const tail = text.slice(-CHAR_BUDGET);
  return `[...truncated]\n${tail.slice(tail.indexOf("\n") + 1)}`;
}

export function compressLogs(raw: string): string {
  const parser = new LogParser();
  parser.addRaw(raw);

  const lines = collectLines(parser.lines);
  const joined = dedupe(lines).join("\n").trim();
  return applyBudget(joined);
}
