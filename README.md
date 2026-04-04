# GTD Assistant

GTD Assistant is a personal executive-assistant dashboard built with Next.js.
It pulls together Google Tasks, Gmail, Google Calendar, and Slack, then sends
that context to Gemini to generate a guided "brain dump and alignment" review.

This repo is optimized for a single user and a single Google account. It is not
trying to be a multi-tenant SaaS app.

## What It Does

- Sign in with Google
- Read GTD task lists from Google Tasks
- Review recent and upcoming Google Calendar events
- Triage unread Gmail messages
- Pull recent Slack channel activity for review context
- Generate an AI summary with suggested actions and mind-sweep prompts
- Mark tasks complete
- Convert emails into Google Tasks
- Convert calendar events into Google Tasks
- Accept SMS webhook posts and store them locally for future review features

## Current Architecture

- App router UI: `src/app/page.tsx`
- Server actions: `src/app/actions.ts`
- Google auth: `src/app/api/auth/[...nextauth]/route.ts`
- Gmail integration: `src/lib/gmail.ts`
- Google Tasks integration: `src/lib/tasks.ts`
- Google Calendar integration: `src/lib/calendar.ts`
- Slack integration: `src/lib/slack.ts`
- Gemini orchestration and response validation: `src/lib/ai.ts`
- SMS webhook and local persistence: `src/app/api/sms/route.ts`, `src/lib/sms.ts`

## Requirements

- Node.js 20+
- A Google Cloud OAuth app
- A Gemini API key
- A Slack bot token if you want Slack context

## Environment Variables

Create `.env.local` with:

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
GEMINI_API_KEY=
SLACK_BOT_TOKEN=
SMS_WEBHOOK_SECRET=
```

Notes:

- `SLACK_BOT_TOKEN` is optional. If omitted, Slack review data is skipped.
- `SMS_WEBHOOK_SECRET` is optional unless you want to post texts to `/api/sms`.
- After changing Google OAuth scopes, sign out and sign back in so Google issues
  a new token set.

## Google OAuth Scopes

The app currently requests:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/tasks`
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/gmail.modify`

These scopes are needed because the app reads tasks/calendar/email and can also
archive emails or delete a calendar event after converting it into a task.

## Personal Workflow Assumptions

The tool assumes you keep the following Google Tasks lists:

- `Next Action`
- `Waiting for`
- `Long Range`
- `Talk to Ryan`

List-name matching is case-insensitive, but the workflow assumes those exact
categories exist.

## Local SMS Storage

Incoming SMS webhook payloads are stored in `data/sms-inbox.json`.

- The JSON file is ignored by git.
- This is intended for a personal local deployment.
- If the app is deployed publicly, protect the webhook secret carefully.

## Running Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality Checks

```bash
npm run lint
```

## Known Limitations

- This is still a personal-tool prototype, not a hardened product.
- Slack "unread" is approximated by recent channel history available to the bot.
- SMS messages are stored locally in a JSON file rather than a database.
- There is no historical audit log yet.
- The dashboard is only as reliable as the connected APIs and granted scopes.

## Suggested Next Improvements

Near-term:

- Save audit history so reviews are not ephemeral
- Add richer explanations for why Gemini suggested an action
- Expand calendar review to additional calendars or trial-specific calendars
- Surface SMS review directly in the dashboard
- Add a manual notes layer on top of AI suggestions

Later:

- Clio matter lookup for calendar-linked client work
- Better filtering, retry logic, and observability across integrations
