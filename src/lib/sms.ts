import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type SmsDirection = "inbound" | "outbound";

export type SmsMessage = {
  id: string;
  conversationId: string;
  address: string;
  contactName?: string;
  direction: SmsDirection;
  text: string;
  timestamp: string;
};

export type SmsMessageInput = Partial<{
  id: string;
  conversationId: string;
  address: string;
  contactName: string;
  direction: SmsDirection;
  sender: string;
  text: string;
  timestamp: string;
}>;

export type SmsFollowUpCandidate = {
  id: string;
  conversationId: string;
  address: string;
  contactName?: string;
  lastInboundText: string;
  lastInboundAt: string;
  lastMessageAt: string;
  messageCount: number;
  reason: string;
  suggestedAction: string;
};

const smsDataDirectory = path.join(process.cwd(), "data");
const smsDataFile = path.join(smsDataDirectory, "sms-inbox.json");
const automatedMessagePatterns = [
  /verification code/i,
  /security code/i,
  /one[- ]time/i,
  /\botp\b/i,
  /\b2fa\b/i,
  /do not reply/i,
  /don'?t reply/i,
  /appointment reminder/i,
  /delivery notification/i,
  /your order/i,
  /receipt/i,
  /statement/i,
];

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

    return parsed
      .map((message, index) => normalizeSmsMessage(message, index))
      .filter((message): message is SmsMessage => Boolean(message))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  } catch {
    return [];
  }
}

export async function appendSmsMessage(message: SmsMessageInput) {
  return upsertSmsMessages([message]);
}

export async function upsertSmsMessages(messages: SmsMessageInput[]) {
  const existingMessages = await readSmsInbox();
  const byId = new Map(existingMessages.map((existingMessage) => [existingMessage.id, existingMessage]));

  for (const message of messages) {
    const normalized = normalizeSmsMessage(message);
    if (normalized) {
      byId.set(normalized.id, normalized);
    }
  }

  const nextMessages = Array.from(byId.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  await writeFile(smsDataFile, JSON.stringify(nextMessages, null, 2), "utf8");
  return nextMessages;
}

export async function getRecentSmsMessages(days = 4) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const messages = await readSmsInbox();
  return messages.filter((message) => {
    const timestamp = new Date(message.timestamp).getTime();
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  });
}

export async function findSmsFollowUps(days = 4): Promise<SmsFollowUpCandidate[]> {
  const messages = await getRecentSmsMessages(days);
  const conversations = new Map<string, SmsMessage[]>();

  for (const message of messages) {
    const key = message.conversationId || message.address;
    conversations.set(key, [...(conversations.get(key) || []), message]);
  }

  const candidates: SmsFollowUpCandidate[] = [];

  for (const [conversationId, conversationMessages] of conversations) {
    const sortedMessages = [...conversationMessages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const lastMessage = sortedMessages.at(-1);

    if (!lastMessage || lastMessage.direction !== "inbound") {
      continue;
    }

    if (looksAutomated(lastMessage)) {
      continue;
    }

    const lastInbound = [...sortedMessages].reverse().find((message) => message.direction === "inbound");

    if (!lastInbound) {
      continue;
    }

    const displayName = lastInbound.contactName || lastInbound.address;

    candidates.push({
      id: `${conversationId}:${lastInbound.timestamp}`,
      conversationId,
      address: lastInbound.address,
      contactName: lastInbound.contactName,
      lastInboundText: truncate(lastInbound.text, 280),
      lastInboundAt: lastInbound.timestamp,
      lastMessageAt: lastMessage.timestamp,
      messageCount: sortedMessages.length,
      reason: `${displayName} sent the most recent text in this conversation.`,
      suggestedAction: `Review and decide whether to reply to ${displayName}.`,
    });
  }

  return candidates.sort(
    (a, b) => new Date(b.lastInboundAt).getTime() - new Date(a.lastInboundAt).getTime(),
  );
}

function normalizeSmsMessage(value: unknown, fallbackIndex = 0): SmsMessage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as SmsMessageInput;
  const text = candidate.text?.trim();
  const timestamp = candidate.timestamp?.trim();
  const rawAddress = candidate.address || candidate.sender;
  const address = rawAddress?.trim();
  const parsedTimestamp = timestamp ? new Date(timestamp) : null;

  if (!address || !text || !timestamp || !parsedTimestamp || Number.isNaN(parsedTimestamp.getTime())) {
    return null;
  }

  const direction = candidate.direction === "outbound" ? "outbound" : "inbound";
  const conversationId = (candidate.conversationId || address).trim();
  const id =
    candidate.id?.trim() ||
    [
      conversationId,
      direction,
      parsedTimestamp.toISOString(),
      address,
      text,
      fallbackIndex,
    ].join("|");
  const contactName = candidate.contactName?.trim();

  return {
    id,
    conversationId,
    address,
    contactName: contactName || undefined,
    direction,
    text,
    timestamp: parsedTimestamp.toISOString(),
  };
}

function looksAutomated(message: SmsMessage) {
  if (automatedMessagePatterns.some((pattern) => pattern.test(message.text))) {
    return true;
  }

  const mostlyDigits = message.text.replace(/\D/g, "").length >= Math.max(6, message.text.length * 0.5);
  return mostlyDigits && message.text.length < 80;
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trim()}...`;
}
