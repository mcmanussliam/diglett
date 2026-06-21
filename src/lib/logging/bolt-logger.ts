import { type Logger as BoltLogger, LogLevel as BoltLogLevel } from "@slack/bolt";
import type { Level as PinoLogLevel } from "pino";
import { env } from "../../util/env.js";
import { log } from "./logger.js";

export const PINO_TO_BOLT_LOG_LEVEL_MAPPING: Record<PinoLogLevel, BoltLogLevel> = {
  trace: BoltLogLevel.DEBUG,
  debug: BoltLogLevel.DEBUG,
  info: BoltLogLevel.INFO,
  warn: BoltLogLevel.WARN,
  error: BoltLogLevel.ERROR,
  fatal: BoltLogLevel.ERROR,
};

function parse(msg: unknown): [Record<string, unknown>, string] {
  if (msg instanceof Error) {
    return [{ err: msg }, msg.message];
  }

  if (typeof msg === "object" && msg !== null && !Array.isArray(msg)) {
    return [msg as Record<string, unknown>, ""];
  }

  if (typeof msg !== "string") {
    return [{ value: msg }, String(msg)];
  }

  return [{}, msg];
}

export function initBoltLogger(): BoltLogger {
  const state = {
    level: PINO_TO_BOLT_LOG_LEVEL_MAPPING[env.LOG_LEVEL],
    child: log.child({ name: "bolt" }),
  };

  return {
    debug: (msg) => state.child.debug(...parse(msg)),
    info: (msg) => state.child.info(...parse(msg)),
    warn: (msg) => state.child.warn(...parse(msg)),
    error: (msg) => state.child.error(...parse(msg)),
    setLevel: (l) => {
      state.level = l;
      state.child = state.child.child({}, { level: l });
    },
    getLevel: () => state.level,
    setName: (name) => {
      state.child = log.child({ name, level: state.level });
    },
  };
}
