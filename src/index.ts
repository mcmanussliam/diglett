import { registerMentionHandler } from "./lib/handlers/mention.js";
import { registerAssistantHandlers } from "./lib/handlers/assistant.js";
import { registerActionHandlers } from "./lib/handlers/actions.js";
import { App, ExpressReceiver } from "@slack/bolt";
import { env } from "./util/env.js";
import { log } from "./lib/logging/logger.js";

function init(): [App, ExpressReceiver] {
  const receiver = new ExpressReceiver({signingSecret: env.SLACK_SIGNING_SECRET});
  const app =  new App({token: env.SLACK_BOT_TOKEN, receiver});

  return [app, receiver];
}

async function bootstrap(): Promise<void> {
  const logger = log.child({name: bootstrap.name});

  const [app, receiver] = init();
  logger.debug('Successfully initialised receiver and app');

  registerMentionHandler(app);
  registerAssistantHandlers(app);
  registerActionHandlers(app);
  logger.debug('Successfully registered handlers');

  receiver.router.get("/health", (_req, res) => {
    res.json({
      ok: true,
      port: env.PORT,
      uptime: process.uptime()
    })
  });

  await app.start(env.PORT);
  logger.info(`Listening on port ${env.PORT}`);
}

void bootstrap();
