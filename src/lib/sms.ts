import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type SmsMessage = {
  sender: string;
  text: string;
  timestamp: string;
};

const smsDataDirectory = path.join(process.cwd(), "data");
const smsDataFile = path.join(smsDataDirectory, "sms-inbox.json");

async function ensureSmsStore() {
  await mkdir(smsDataDirectory, { recursive: true });

  try {
    await readFile(smsDataFile, "utf8");
  } catch {
    await writeFile(smsDataFile, "[]", "utf8");
  }
}

export async function readSmsInbox() {
  await ensureSmsStore();
  const raw = await readFile(smsDataFile, "utf8");

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isSmsMessage);
  } catch {
    return [];
  }
}

export async function appendSmsMessage(message: SmsMessage) {
  const existingMessages = await readSmsInbox();
  const nextMessages = [...existingMessages, message];
  await writeFile(smsDataFile, JSON.stringify(nextMessages, null, 2), "utf8");
  return nextMessages;
}

function isSmsMessage(value: unknown): value is SmsMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SmsMessage>;

  return (
    typeof candidate.sender === "string" &&
    typeof candidate.text === "string" &&
    typeof candidate.timestamp === "string"
  );
}
