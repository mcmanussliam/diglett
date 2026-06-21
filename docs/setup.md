# Setup

## Requirements

- Node.js 20 or newer
- A Slack app with OAuth enabled
- A public HTTPS URL for local development (ngrok works well)
- A GitHub PAT with access to the repositories you want to diagnose
- An Anthropic API key

## Environment

```bash
cp .env.example .env
```

```env
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=https://YOUR_DOMAIN/slack/oauth_redirect
SLACK_STATE_SECRET=
SLACK_SIGNING_SECRET=
ANTHROPIC_API_KEY=sk-ant-
GITHUB_PAT=ghp_
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug
```

`SLACK_REDIRECT_URI` must exactly match a configured Slack OAuth redirect URL.

## Slack App

Configure these URLs in your Slack app settings:

```
OAuth Redirect URL:         https://YOUR_DOMAIN/slack/oauth_redirect
Event Subscriptions URL:    https://YOUR_DOMAIN/slack/events
Interactivity Request URL:  https://YOUR_DOMAIN/slack/events
```

Required bot scopes, inserting manifest should handle these.

```
app_mentions:read  assistant:write  channels:history
channels:read      chat:write       im:history
im:read            im:write
```

Required user scope: `search:read` - used for Slack Real-Time Search context.

## Local Development

```bash
ngrok http 3000
npm install
npm run dev
```

Visit `https://YOUR_DOMAIN/slack/install` to install or reauthorize the app.

Confirm the install was stored:

```bash
sqlite3 diglett.db "select id from installations;"
# should return something like team:T...
```

## Smoke Test

1. Invite Diglett to a channel.
2. Post a message with a GitHub Actions run URL.
3. Reply in the thread: `@diglett why did this fail?`
4. The bot fetches the logs and replies with a diagnosis card.
