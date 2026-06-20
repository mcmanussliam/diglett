import { registerMentionHandler } from "./lib/handlers/mention.js";
import { registerAssistantHandlers } from "./lib/handlers/assistant.js";
import { registerActionHandlers } from "./lib/handlers/actions.js";
import { App, ExpressReceiver } from "@slack/bolt";
import { env } from "./util/env.js";
import { log } from "./lib/logging/logger.js";
import { initBoltLogger, PINO_TO_BOLT_LOG_LEVEL_MAPPING } from "./lib/logging/bolt-logger.js";
import { packageJson } from "./util/package-json.js";

function init(): [App, ExpressReceiver] {
  const logger = initBoltLogger();

  const receiver = new ExpressReceiver({ signingSecret: env.SLACK_SIGNING_SECRET, logger });
  const app = new App({
    token: env.SLACK_BOT_TOKEN,
    receiver,
    logger,
    logLevel: PINO_TO_BOLT_LOG_LEVEL_MAPPING[env.LOG_LEVEL],
  });

  return [app, receiver];
}

async function bootstrap(): Promise<void> {
  const logger = log.child({ name: bootstrap.name });

  const [app, receiver] = init();
  logger.debug("receiver and app initialised");

  registerMentionHandler(app);
  registerAssistantHandlers(app);
  registerActionHandlers(app);
  logger.debug("handlers registered");

  receiver.router.get("/health", (_req, res) => {
    res.json({
      ok: true,
      port: env.PORT,
      uptime: process.uptime(),
      environment: env.NODE_ENV,
      version: packageJson.version,
    });
  });

  await app.start(env.PORT);
  logger.info(`listening: ${env.PORT}`);
}

void bootstrap();
