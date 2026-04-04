import { NextResponse } from "next/server";

import { getAuthenticatedSession } from "@/lib/google-auth";
import { appendSmsMessage, readSmsInbox } from "@/lib/sms";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");
    const webhookSecret = process.env.SMS_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return NextResponse.json(
        { error: "SMS webhook is not configured." },
        { status: 500 },
      );
    }

    const expectedToken = `Bearer ${webhookSecret}`;

    if (authHeader !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = (await req.json()) as Partial<{ sender: string; text: string }>;
    const sender = data.sender?.trim();
    const text = data.text?.trim();

    if (!sender || !text) {
      return NextResponse.json({ error: "Missing sender or text field." }, { status: 400 });
    }

    const messages = await appendSmsMessage({
      sender,
      text,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, count: messages.length });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 500 });
  }
}

export async function GET() {
  try {
    await getAuthenticatedSession();
    const messages = await readSmsInbox();
    return NextResponse.json({ messages });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
