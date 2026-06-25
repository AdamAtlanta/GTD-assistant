import fs from "node:fs";
import path from "node:path";

import { google, keep_v1 } from "googleapis";
import {
  ExternalAccountClient,
  type BaseExternalAccountClient,
  type OAuth2Client,
} from "google-auth-library";

import type { KeepNoteForReview } from "@/lib/gtd";

const keepReadonlyScope = "https://www.googleapis.com/auth/keep.readonly";
const cloudPlatformScope = "https://www.googleapis.com/auth/cloud-platform";
const googleOAuthTokenUrl = "https://oauth2.googleapis.com/token";

type KeepServiceAccountKey = {
  client_email?: string;
  private_key?: string;
};

type JwtBearerTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

export async function getKeepClient(subjectEmail?: string): Promise<keep_v1.Keep> {
  const serviceAccount = getKeepServiceAccountKey();
  const serviceAccountEmail =
    serviceAccount?.client_email || process.env.GOOGLE_KEEP_SERVICE_ACCOUNT_EMAIL?.trim();
  const impersonatedUser = process.env.GOOGLE_KEEP_IMPERSONATED_USER?.trim() || subjectEmail;

  if (!serviceAccountEmail || !impersonatedUser) {
    throw new Error(
      "Live Google Keep sync needs a Workspace service account email and an impersonated user email.",
    );
  }

  const auth = serviceAccount?.private_key
    ? new google.auth.JWT({
        email: serviceAccountEmail,
        key: normalizePrivateKey(serviceAccount.private_key),
        scopes: [keepReadonlyScope],
        subject: impersonatedUser,
      })
    : await getKeylessKeepOAuthClient(serviceAccountEmail, impersonatedUser);

  return google.keep({ version: "v1", auth });
}

export async function fetchKeepNotesForReview(subjectEmail?: string): Promise<KeepNoteForReview[]> {
  const keepClient = await getKeepClient(subjectEmail);
  const notes: KeepNoteForReview[] = [];
  let pageToken: string | undefined;

  do {
    const res = await keepClient.notes.list({
      pageSize: 50,
      pageToken,
    });

    notes.push(
      ...(res.data.notes || [])
        .map(toKeepNoteForReview)
        .filter((note): note is KeepNoteForReview => Boolean(note)),
    );

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && notes.length < 150);

  return notes
    .sort((a, b) => new Date(b.updatedTime).getTime() - new Date(a.updatedTime).getTime())
    .slice(0, 75);
}

function toKeepNoteForReview(note: keep_v1.Schema$Note): KeepNoteForReview | null {
  if (!note.name) {
    return null;
  }

  const text = note.body?.text?.text?.trim() || "";
  const listItems = flattenListItems(note.body?.list?.listItems || []);

  if (!text && listItems.length === 0 && !note.title) {
    return null;
  }

  return {
    id: note.name,
    title: note.title?.trim() || "Untitled Keep note",
    text,
    listItems,
    updatedTime: note.updateTime || note.createTime || new Date(0).toISOString(),
  };
}

function flattenListItems(items: keep_v1.Schema$ListItem[]): string[] {
  const result: string[] = [];

  for (const item of items) {
    const text = item.text?.text?.trim();

    if (text && !item.checked) {
      result.push(text);
    }

    result.push(...flattenListItems(item.childListItems || []));
  }

  return result;
}

function getKeepServiceAccountKey(): KeepServiceAccountKey | null {
  const jsonBase64 = process.env.GOOGLE_KEEP_SERVICE_ACCOUNT_JSON_BASE64?.trim();

  if (jsonBase64) {
    return parseServiceAccountJson(Buffer.from(jsonBase64, "base64").toString("utf8"));
  }

  const json = process.env.GOOGLE_KEEP_SERVICE_ACCOUNT_JSON?.trim();

  if (json) {
    return parseServiceAccountJson(json);
  }

  const keyFile = process.env.GOOGLE_KEEP_SERVICE_ACCOUNT_KEY_FILE?.trim();

  if (keyFile) {
    const absolutePath = path.isAbsolute(keyFile) ? keyFile : path.join(process.cwd(), keyFile);
    return parseServiceAccountJson(fs.readFileSync(absolutePath, "utf8"));
  }

  const clientEmail = process.env.GOOGLE_KEEP_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_KEEP_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();

  if (clientEmail && privateKey) {
    return {
      client_email: clientEmail,
      private_key: privateKey,
    };
  }

  return null;
}

function parseServiceAccountJson(json: string): KeepServiceAccountKey {
  const parsed = JSON.parse(json) as KeepServiceAccountKey;

  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
  };
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

async function getKeylessKeepOAuthClient(
  serviceAccountEmail: string,
  impersonatedUser: string,
): Promise<OAuth2Client> {
  const accessToken = await getDomainWideDelegatedAccessToken(
    serviceAccountEmail,
    impersonatedUser,
  );
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}

async function getDomainWideDelegatedAccessToken(
  serviceAccountEmail: string,
  impersonatedUser: string,
): Promise<string> {
  const signingAuth = await getSigningAuthClient(serviceAccountEmail);
  const issuedAt = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: serviceAccountEmail,
    scope: keepReadonlyScope,
    aud: googleOAuthTokenUrl,
    exp: issuedAt + 3600,
    iat: issuedAt,
    sub: impersonatedUser,
  };
  const iamCredentials = google.iamcredentials({ version: "v1", auth: signingAuth });
  const signResponse = await iamCredentials.projects.serviceAccounts.signJwt({
    name: `projects/-/serviceAccounts/${serviceAccountEmail}`,
    requestBody: {
      payload: JSON.stringify(claimSet),
    },
  });
  const signedJwt = signResponse.data.signedJwt;

  if (!signedJwt) {
    throw new Error("Google did not return a signed Keep access request.");
  }

  const tokenResponse = await fetch(googleOAuthTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
  });
  const token = (await tokenResponse.json()) as JwtBearerTokenResponse;

  if (!tokenResponse.ok || !token.access_token) {
    throw new Error(
      token.error_description ||
        token.error ||
        "Google did not issue a Keep access token for the delegated user.",
    );
  }

  return token.access_token;
}

async function getSigningAuthClient(
  serviceAccountEmail: string,
): Promise<BaseExternalAccountClient | OAuth2Client> {
  if (hasVercelWorkloadIdentityConfig()) {
    const { getVercelOidcToken } = await import("@vercel/oidc");
    const projectNumber = process.env.GCP_PROJECT_NUMBER;
    const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
    const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
    const externalAccountClient = ExternalAccountClient.fromJSON({
      type: "external_account",
      audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      token_url: "https://sts.googleapis.com/v1/token",
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
      scopes: [cloudPlatformScope],
      subject_token_supplier: {
        getSubjectToken: async () => getVercelOidcToken(),
      },
    });

    if (!externalAccountClient) {
      throw new Error("Could not create Google Workload Identity client for Vercel.");
    }

    return externalAccountClient;
  }

  return (await google.auth.getClient({ scopes: [cloudPlatformScope] })) as OAuth2Client;
}

function hasVercelWorkloadIdentityConfig() {
  return Boolean(
    process.env.VERCEL === "1" &&
      process.env.GCP_PROJECT_NUMBER &&
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID &&
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID,
  );
}
