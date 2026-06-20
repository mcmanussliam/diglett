import { LogParser, Command } from "@robherley/actions-log-parser";

const CHAR_BUDGET = 15_000;
const ERROR_KEYWORDS = /\b(error|fail|fatal|exception|panic|abort|cannot|could not|no such|permission denied)\b/i;

function isSignificant(cmd: Command | undefined, content: string): boolean {
  return (
    cmd === Command.Error ||
    cmd === Command.Warning ||
    ERROR_KEYWORDS.test(content)
  );
}

export function compressLogs(raw: string): string {
  const parser = new LogParser();
  parser.addRaw(raw);

  const output: string[] = [];

  for (const line of parser.lines) {
    if (line.cmd === Command.Group || line.cmd === Command.EndGroup) {
      continue;
    }

    if (line.group) {
      if (!isSignificant(line.cmd, line.content)) {
        continue;
      }

      for (const sibling of line.group.children) {
        if (sibling.cmd === Command.Group || sibling.cmd === Command.EndGroup) {
          continue;
        }

        output.push(sibling.content);
      }

      continue;
    }

    if (isSignificant(line.cmd, line.content)) {
      output.push(line.content);
    }
  }

  const deduped: string[] = [];
  for (const line of output) {
    if (deduped.at(-1) !== line) {
      deduped.push(line);
    }
  }

  const joined = deduped.join("\n").trim();
  if (joined.length <= CHAR_BUDGET) {
    return joined;
  }

  const tail = joined.slice(-CHAR_BUDGET);
  return `[...truncated]\n${tail.slice(tail.indexOf("\n") + 1)}`;
}
