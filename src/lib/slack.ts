import { WebClient } from "@slack/web-api";

import type { SlackChannelMessages } from "@/lib/gtd";

const slackToken = process.env.SLACK_BOT_TOKEN ?? "";

function getSlackClient() {
  return new WebClient(slackToken);
}

export async function fetchUnreadSlackMessages() {
  if (!slackToken) {
    console.warn("SLACK_BOT_TOKEN is not defined.");
    return [];
  }

  try {
    const slackClient = getSlackClient();
    // 1. Get the list of channels the bot has access to
    const channelsRes = await slackClient.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 50,
    });

    const channels = channelsRes.channels || [];
    const unreadMessages: SlackChannelMessages[] = [];

    const twentyFourHoursAgo = (Date.now() / 1000) - (24 * 60 * 60);

    for (const channel of channels) {
      if (!channel.id) continue;
      
      const historyRes = await slackClient.conversations.history({
        channel: channel.id,
        oldest: twentyFourHoursAgo.toString(),
        limit: 10,
      });

      if (historyRes.messages && historyRes.messages.length > 0) {
        unreadMessages.push({
          channelName: channel.name ?? channel.id,
          messages: historyRes.messages.flatMap((message) =>
            typeof message.text === "string" ? [message.text] : [],
          ),
        });
      }
    }

    return unreadMessages;

  } catch (error) {
    console.error("Error fetching Slack messages:", error);
    return [];
  }
}
