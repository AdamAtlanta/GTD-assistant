import { NextResponse } from "next/server";

import { getAuthenticatedSession } from "@/lib/google-auth";
import { findSmsFollowUps, readSmsInbox, type SmsMessageInput, upsertSmsMessages } from "@/lib/sms";

type SmsSyncPayload = {
  messages?: SmsMessageInput[];
} & SmsMessageInput;

function isAuthorized(req: Request) {
  const webhookSecret = process.env.SMS_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return false;
  }

  return req.headers.get("Authorization") === `Bearer ${webhookSecret}`;
}

export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await parseSmsSyncPayload(req);
    const messages = Array.isArray(payload.messages) ? payload.messages : [payload];
    const timestampedMessages = messages.map((message) => ({
      ...message,
      timestamp: message.timestamp || new Date().toISOString(),
    }));

    if (timestampedMessages.length === 0) {
      return NextResponse.json({ error: "No SMS messages provided." }, { status: 400 });
    }

    const beforeCount = (await readSmsInbox()).length;
    const storedMessages = await upsertSmsMessages(timestampedMessages);
    const followUps = await findSmsFollowUps();

    return NextResponse.json({
      success: true,
      storedCount: storedMessages.length,
      importedCount: Math.max(0, storedMessages.length - beforeCount),
      followUps,
    });
  } catch (error) {
    console.error("SMS sync error:", error);
    return NextResponse.json({ error: "Invalid SMS sync request." }, { status: 500 });
  }
}

async function parseSmsSyncPayload(req: Request): Promise<SmsSyncPayload> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return (await req.json()) as SmsSyncPayload;
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await req.formData();
    const payload: Record<string, string> = {};

    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") {
        payload[key] = value;
      }
    }

    return payload as SmsSyncPayload;
  }

  const text = await req.text();
  return Object.fromEntries(new URLSearchParams(text).entries()) as SmsSyncPayload;
}

export async function GET() {
  try {
    await getAuthenticatedSession();
    const messages = await readSmsInbox();
    const followUps = await findSmsFollowUps();
    return NextResponse.json({ messages, followUps });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
