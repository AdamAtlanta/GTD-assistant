import { gmail_v1, google } from "googleapis";

import { getGoogleOAuthClient } from "@/lib/google-auth";

export async function getGmailClient(): Promise<gmail_v1.Gmail> {
  return google.gmail({ version: "v1", auth: await getGoogleOAuthClient() });
}

export async function getUnopenedEmails() {
  const gmail = await getGmailClient();
  const res = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread in:inbox -category:promotions -category:social",
    maxResults: 20,
  });

  const messages = res.data.messages || [];
  const fullMessages: gmail_v1.Schema$Message[] = [];

  for (const m of messages) {
    if (m.id) {
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: m.id,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"],
      });
      fullMessages.push(msgRes.data);
    }
  }

  return fullMessages;
}

export async function archiveEmail(messageId: string) {
  const gmail = await getGmailClient();
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      removeLabelIds: ["INBOX"],
    },
  });
}

export async function unarchiveEmail(messageId: string) {
  const gmail = await getGmailClient();
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds: ["INBOX"],
    },
  });
}

export async function deleteEmail(messageId: string) {
  const gmail = await getGmailClient();
  await gmail.users.messages.trash({
    userId: "me",
    id: messageId,
  });
}

export async function untrashEmail(messageId: string) {
  const gmail = await getGmailClient();
  await gmail.users.messages.untrash({
    userId: "me",
    id: messageId,
  });
}
