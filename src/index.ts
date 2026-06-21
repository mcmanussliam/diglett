import { App, ExpressReceiver } from "@slack/bolt";
import type { Request, Response } from "express";
import { SqliteInstallationStore } from "./lib/db/installation-store.js";
import { registerActionHandlers } from "./lib/handlers/actions.js";
import { registerAssistantHandlers } from "./lib/handlers/assistant.js";
import { registerMentionHandler } from "./lib/handlers/mention.js";
import { initBoltLogger, PINO_TO_BOLT_LOG_LEVEL_MAPPING } from "./lib/logging/bolt-logger.js";
import { log } from "./lib/logging/logger.js";
import { env } from "./util/env.js";
import { packageJson } from "./util/package-json.js";

function init(): [App, ExpressReceiver, SqliteInstallationStore] {
  const logger = initBoltLogger();
  const installationStore = new SqliteInstallationStore();

  const receiver = new ExpressReceiver({
    signingSecret: env.SLACK_SIGNING_SECRET,
    clientId: env.SLACK_CLIENT_ID,
    clientSecret: env.SLACK_CLIENT_SECRET,
    redirectUri: env.SLACK_REDIRECT_URI,
    stateSecret: env.SLACK_STATE_SECRET,
    installerOptions: {
      redirectUriPath: "/slack/oauth_redirect",
      userScopes: ["search:read"],
    },
    scopes: [
      "app_mentions:read",
      "assistant:write",
      "channels:history",
      "channels:read",
      "chat:write",
      "im:history",
      "im:read",
      "im:write",
    ],
    installationStore,
    logger,
  });

  const app = new App({
    receiver,
    logger,
    logLevel: PINO_TO_BOLT_LOG_LEVEL_MAPPING[env.LOG_LEVEL],
  });

  return [app, receiver, installationStore];
}

async function bootstrap(): Promise<void> {
  const logger = log.child({ name: bootstrap.name });

  const [app, receiver, installationStore] = init();
  logger.debug("app initialised");

  registerMentionHandler(app, installationStore);
  registerAssistantHandlers(app, installationStore);
  registerActionHandlers(app);
  logger.debug("handlers registered");

  receiver.router.get("/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      port: env.PORT,
      uptime: process.uptime(),
      environment: env.NODE_ENV,
      version: packageJson.version,
    });
  });

  await app.start(env.PORT);
  logger.info({ port: env.PORT }, "listening");
}

void bootstrap();
