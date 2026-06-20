import { LogLevel as BoltLogLevel, type Logger as BoltLogger } from "@slack/bolt";
import { log } from "./logger.js";
import { env } from "../../util/env.js";
import type { Level as PinoLogLevel } from "pino";

export const PINO_TO_BOLT_LOG_LEVEL_MAPPING: Record<PinoLogLevel, BoltLogLevel> = {
  trace: BoltLogLevel.DEBUG,
  debug: BoltLogLevel.DEBUG,
  info: BoltLogLevel.INFO,
  warn: BoltLogLevel.WARN,
  error: BoltLogLevel.ERROR,
  fatal: BoltLogLevel.ERROR,
};

export function initBoltLogger(): BoltLogger {
  const state = {
    level: PINO_TO_BOLT_LOG_LEVEL_MAPPING[env.LOG_LEVEL],
    child: log.child({ name: "bolt" }),
  };

  return {
    debug: (...msgs) => state.child.debug(msgs.join(" ")),
    info: (...msgs) => state.child.info(msgs.join(" ")),
    warn: (...msgs) => state.child.warn(msgs.join(" ")),
    error: (...msgs) => state.child.error(msgs.join(" ")),
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
