import { type Logger as BoltLogger, LogLevel } from "@slack/bolt";
import { log } from "./logger.js";

export function initBoltLogger(): BoltLogger {
  const state = {
    level: LogLevel.DEBUG,
    child: log.child({ name: "bolt" }),
  };

  return {
    debug: (...msgs) => state.child.debug(msgs),
    info: (...msgs) => state.child.info(msgs),
    warn: (...msgs) => state.child.warn(msgs),
    error: (...msgs) => state.child.error(msgs),
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
