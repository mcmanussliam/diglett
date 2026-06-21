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

function parse(msg: string): [Record<string, unknown>, string] {
  const jsonStart = msg.indexOf("{");
  if (jsonStart === -1) {
    return [{}, msg];
  }

  try {
    const context = JSON.parse(msg.slice(jsonStart));
    const label = msg.slice(0, jsonStart).trim().replace(/:$/, "");
    return [context, label];
  } catch {
    return [{}, msg];
  }
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
