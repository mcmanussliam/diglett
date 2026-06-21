import type { App } from "@slack/bolt";

export const registerActionHandlers = (app: App): void => {
  app.action("view_run", async ({ ack }) => {
    await ack();
  });
};
