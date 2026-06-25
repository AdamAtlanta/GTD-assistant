# Android SMS Bridge

Status: parked for later. The code remains in the project, but SMS follow-ups
are disabled unless `ENABLE_SMS_FOLLOWUPS` and
`NEXT_PUBLIC_ENABLE_SMS_FOLLOWUPS` are both set to `true`.

The executive assistant is a webapp, so it cannot directly read Android text
messages from the browser. Android requires a phone-side bridge with SMS
permission. The bridge reads recent messages on the phone and sends them to the
assistant.

## Recommended Setup

1. Keep using the native Android Messages app.
2. Install a private phone-side bridge. The easiest first bridge is usually
   Tasker or MacroDroid. A custom Android app can come later if needed.
3. Configure the bridge to sync both inbound and outbound SMS messages from the
   last 3 or 4 days.
4. Send the messages to:

```text
POST /api/sms/sync
```

5. Include the `SMS_WEBHOOK_SECRET` value as a bearer token:

```text
Authorization: Bearer YOUR_SMS_WEBHOOK_SECRET
```

## Payload Shape

The sync endpoint expects this JSON shape:

```json
{
  "messages": [
    {
      "id": "phone-message-id",
      "conversationId": "thread-or-phone-number",
      "address": "+14045551212",
      "contactName": "Example Person",
      "direction": "inbound",
      "text": "Can you send me that file?",
      "timestamp": "2026-04-18T14:30:00.000Z"
    }
  ]
}
```

Use `"direction": "outbound"` for texts sent by Adam. The assistant needs both
directions so it can tell whether the other person texted last.

## What The Assistant Flags

The dashboard's Text Follow-Ups section looks at the last 4 days by default and
flags conversations where:

- The most recent message in the conversation is inbound.
- There is no later outbound reply.
- The latest inbound message does not look like a verification code, receipt,
  delivery notice, or other automated text.

Each flagged item can be opened as a text thread, dismissed from the current
view, or converted into a Google Task.

## Phone-First Note

When the assistant is running at `localhost:3000` on a computer, the Android
phone cannot post to that exact address. For phone-first use, run the assistant
at a reachable address, such as a private HTTPS tunnel or deployed private URL.

This is the reason the SMS feature is parked for now. A same-Wi-Fi bridge is too
fragile for regular phone use on cellular data.
