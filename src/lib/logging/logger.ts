import pino, { type Logger as PinoLogger, transport } from "pino";
import { env } from "../../util/env.js";

function init(): PinoLogger {
  const isDevelopment = env.NODE_ENV !== "production";
  const stream = isDevelopment
    ? transport({ target: "pino-pretty", options: { colorize: true } })
    : undefined;

  return pino({ level: env.LOG_LEVEL }, stream);
}

export const log = init();
