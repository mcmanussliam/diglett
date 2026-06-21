import type { App } from "@slack/bolt";

/** Acknowledge URL button interactions. Slack still sends payloads for URL buttons. */
export const registerActionHandlers = (app: App): void => {
  app.action("view_run", async ({ ack }) => {
    await ack();
  });
};
