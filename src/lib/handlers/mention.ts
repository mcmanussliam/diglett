import type { App } from "@slack/bolt";

export const registerMentionHandler = (app: App): void => {
  app.event("app_mention", async ({ event, say }) => {
    await say({ text: "test", thread_ts: event.thread_ts ?? event.ts });
  });
};
