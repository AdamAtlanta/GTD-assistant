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
- Gather Google Keep notes for task suggestions when the Keep feature flag and Workspace-approved scope are enabled
- Triage unread Gmail messages
- Pull recent Slack channel activity for review context
- Generate an AI summary with suggested actions and mind-sweep prompts
- Mark tasks complete
- Edit task wording and update the real Google Tasks item
- Convert emails into Google Tasks
- Convert calendar events into Google Tasks
- Convert Google Keep suggestions into Google Tasks when that parked feature is enabled
- Import exported Google Keep note files as a fallback when live Keep API access is unavailable
- Keep a local undo log for recent task, email, and calendar mutations
- Keep parked SMS follow-up support behind a feature flag for later phone-bridge work

## Current Architecture

- App router UI: `src/app/page.tsx`
- Server actions: `src/app/actions.ts`
- Google auth: `src/app/api/auth/[...nextauth]/route.ts`
- Gmail integration: `src/lib/gmail.ts`
- Google Tasks integration: `src/lib/tasks.ts`
- Google Calendar integration: `src/lib/calendar.ts`
- Google Keep integration: `src/lib/keep.ts`
- Slack integration: `src/lib/slack.ts`
- Gemini orchestration and response validation: `src/lib/ai.ts`
- SMS webhook and local persistence: `src/app/api/sms/route.ts`, `src/lib/sms.ts`
- SMS sync endpoint: `src/app/api/sms/sync/route.ts`

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
ENABLE_SMS_FOLLOWUPS=false
NEXT_PUBLIC_ENABLE_SMS_FOLLOWUPS=false
ENABLE_KEEP_SUGGESTIONS=false
NEXT_PUBLIC_ENABLE_KEEP_SUGGESTIONS=false
GOOGLE_KEEP_IMPERSONATED_USER=
GOOGLE_KEEP_SERVICE_ACCOUNT_EMAIL=
GOOGLE_KEEP_SERVICE_ACCOUNT_KEY_FILE=
# or use GOOGLE_KEEP_SERVICE_ACCOUNT_JSON_BASE64 for hosted deployments
```

Notes:

- `SLACK_BOT_TOKEN` is optional. If omitted, Slack review data is skipped.
- `SMS_WEBHOOK_SECRET` is optional unless you want to post texts to `/api/sms`.
- SMS follow-ups are parked by default. Set both SMS follow-up flags to `true`
  only when you are ready to connect a phone bridge.
- Google Keep suggestions are parked by default. Google's Keep API requires
  Workspace/admin-approved Keep access. Live Keep sync uses a service account
  with domain-wide delegation because the Keep scope cannot be shown on the
  regular Google sign-in consent screen. The preferred local setup is keyless:
  set `GOOGLE_KEEP_SERVICE_ACCOUNT_EMAIL` to the service account email, set
  `GOOGLE_KEEP_IMPERSONATED_USER` to the Workspace email whose Keep notes should
  be reviewed, authenticate local development with Google Application Default
  Credentials, and grant that local developer principal permission to sign JWTs
  for the service account. If your organization permits JSON keys, the app also
  supports `GOOGLE_KEEP_SERVICE_ACCOUNT_KEY_FILE`,
  `GOOGLE_KEEP_SERVICE_ACCOUNT_JSON`, or `GOOGLE_KEEP_SERVICE_ACCOUNT_JSON_BASE64`.
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
archive emails or update/delete a calendar event. Live Google Keep sync uses
`https://www.googleapis.com/auth/keep.readonly` through a Workspace
domain-wide-delegated service account rather than the normal sign-in flow.

## Personal Workflow Assumptions

The tool assumes you keep the following Google Tasks lists:

- `Next Action`
- `Waiting for`
- `Long Range`
- `Talk to Ryan`

List-name matching is case-insensitive, but the workflow assumes those exact
categories exist.

## Local SMS Storage

Incoming SMS webhook payloads and Android bridge sync batches are stored in
`data/sms-inbox.json`.

- The JSON file is ignored by git.
- This is intended for a personal local deployment.
- If the app is deployed publicly, protect the webhook secret carefully.
- SMS follow-up support is currently parked because a same-Wi-Fi phone bridge is
  too limiting for the intended phone-first workflow.
- See `docs/android-sms-bridge.md` for the deferred phone-side bridge setup plan.

## Undo Log

Recent dashboard mutations are kept in browser local storage and can be undone
from the dashboard. Undo currently covers completing tasks, renaming tasks,
creating tasks, archiving/trashing emails, renaming calendar events, and
restoring deleted calendar events when the app captured the event before
conversion.

## Google Keep Fallback Import

The dashboard can read exported Keep `.json`, `.html`, `.htm`, and `.txt` files
in the browser, normalize them, and send the imported note text through Gemini
for task suggestions. This provides a fallback path when the live Keep API scope
is not available.

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
- Revisit SMS follow-ups after choosing a phone-friendly sync path that works on cellular data
- Add a manual notes layer on top of AI suggestions

Later:

- Clio matter lookup for calendar-linked client work
- Better filtering, retry logic, and observability across integrations
