import { google } from "googleapis";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function getAuthenticatedSession() {
  const session = await getServerSession(authOptions);

  if (!session) {
    throw new Error("You must be signed in to use GTD Assistant.");
  }

  if (session.error === "RefreshAccessTokenError") {
    throw new Error("Your Google session expired. Please sign out and sign back in.");
  }

  return session;
}

export async function getGoogleAccessToken() {
  const session = await getAuthenticatedSession();

  if (!session.accessToken) {
    throw new Error("No Google access token found in session.");
  }

  return session.accessToken;
}

export async function getGoogleOAuthClient() {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: await getGoogleAccessToken() });
  return oauth2Client;
}
