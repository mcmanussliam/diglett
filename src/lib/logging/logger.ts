import pino, { type Logger as PinoLogger, type LevelWithSilentOrString, transport } from "pino";
import { env } from "../../util/env.js";

function init(): PinoLogger {
  const isDevelopment = env.NODE_ENV !== "production";

  const level: LevelWithSilentOrString = isDevelopment ? "debug" : "info";
  const stream = isDevelopment ? transport({ target: "pino-pretty", options: { colorize: true } }) : undefined;

  return pino({level}, stream);
}

export const log = init();
