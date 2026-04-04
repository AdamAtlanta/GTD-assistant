import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import type { JWT } from "next-auth/jwt";

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

async function refreshGoogleAccessToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) {
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const refreshedTokens = (await response.json()) as
      | GoogleTokenResponse
      | { error?: string; error_description?: string };

    if (!response.ok || !("access_token" in refreshedTokens)) {
      throw new Error(
        "error_description" in refreshedTokens && refreshedTokens.error_description
          ? refreshedTokens.error_description
          : "Google token refresh failed.",
      );
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + refreshedTokens.expires_in,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (error) {
    console.error("Failed to refresh Google access token:", error);

    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/tasks",
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/gmail.modify"
          ].join(" "),
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token ?? token.refreshToken;
        token.expiresAt =
          account.expires_at ??
          Math.floor(Date.now() / 1000) + Number(account.expires_in ?? 3600);
        token.error = undefined;
        return token;
      }

      if (token.expiresAt && Date.now() < token.expiresAt * 1000 - 60_000) {
        return token;
      }

      return refreshGoogleAccessToken(token);

      return token;
    },
    async session({ session, token }) {
      session.accessToken =
        typeof token.accessToken === "string" ? token.accessToken : undefined;
      session.error =
        token.error === "RefreshAccessTokenError"
          ? "RefreshAccessTokenError"
          : undefined;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
