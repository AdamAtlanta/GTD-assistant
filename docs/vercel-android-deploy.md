# Deploy Executive Assistant To Vercel And Android

Use this when you have about 30 minutes to turn the local Executive Assistant into a webapp you can open from your Android phone.

Plain-English picture:

- Localhost is your laptop-only copy.
- Vercel gives the app a real internet address.
- Google OAuth must be told that new internet address is allowed.
- Google Keep needs Vercel keyless access, similar to the temporary badge setup we used locally.
- Android Chrome can then install the site to your home screen.

## Current Status

- The app runs locally at `http://localhost:3000`.
- Google Keep works locally using keyless Google Cloud credentials.
- The app has Android/PWA basics: manifest, app name, theme color, and app icons.
- The code builds successfully.
- The Vercel deployment itself has not been completed yet.

## Step 1: Put Latest Code On GitHub

The repository is connected to:

```txt
https://github.com/AdamAtlanta/GTD-assistant.git
```

Before deploying, commit and push the latest local changes.

Codex can help do this when you are ready.

## Step 2: Create The Vercel Project

1. Go to `https://vercel.com`.
2. Sign in.
3. Click **Add New**.
4. Click **Project**.
5. Choose GitHub.
6. Import:

```txt
GTD-assistant
```

7. Framework should be **Next.js**.
8. Root directory should be the folder that contains `package.json`.
9. Click **Deploy**.

Vercel will create a URL similar to:

```txt
https://gtd-assistant-something.vercel.app
```

Google sign-in may not work yet. That is expected.

## Step 3: Add Vercel Environment Variables

In Vercel:

```txt
Project > Settings > Environment Variables
```

Add the same values used locally, including:

```txt
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXTAUTH_SECRET
NEXTAUTH_URL
GEMINI_API_KEY
ENABLE_KEEP_SUGGESTIONS
NEXT_PUBLIC_ENABLE_KEEP_SUGGESTIONS
GOOGLE_KEEP_IMPERSONATED_USER
GOOGLE_KEEP_SERVICE_ACCOUNT_EMAIL
```

Set:

```txt
ENABLE_KEEP_SUGGESTIONS=true
NEXT_PUBLIC_ENABLE_KEEP_SUGGESTIONS=true
GOOGLE_KEEP_IMPERSONATED_USER=Adam@SwingleLevin.com
GOOGLE_KEEP_SERVICE_ACCOUNT_EMAIL=executive-assistant-keep-reade@gtd-assistant-490800.iam.gserviceaccount.com
```

Set `NEXTAUTH_URL` to the final Vercel URL, for example:

```txt
NEXTAUTH_URL=https://your-vercel-url.vercel.app
```

Do not paste private secrets into chat. Enter them directly in Vercel, or let Codex guide you carefully.

## Step 4: Tell Google OAuth About The Vercel URL

In Google Cloud Console:

```txt
APIs & Services > Credentials
```

Open the OAuth web client used by this app.

Add this authorized redirect URI:

```txt
https://your-vercel-url.vercel.app/api/auth/callback/google
```

If Google shows an authorized JavaScript origins section, add:

```txt
https://your-vercel-url.vercel.app
```

Save.

## Step 5: Redeploy On Vercel

After adding environment variables and Google OAuth URLs, redeploy the Vercel project.

Then test:

1. Open the Vercel URL.
2. Sign in with Google.
3. Confirm the app loads.
4. Click **Run review**.

## Step 6: Connect Google Keep On Vercel

This is the special keyless Keep step.

Locally, your laptop asks Google for a temporary badge. On Vercel, the Vercel deployment needs its own temporary badge path.

Set up:

```txt
Google Cloud Workload Identity Federation
```

Needed values:

```txt
Vercel team/account slug
Vercel project name
Google project number
Workload Identity Pool ID
Provider ID
```

The Vercel provider should use:

```txt
Issuer URL: https://oidc.vercel.com/[TEAM_SLUG]
Audience: https://vercel.com/[TEAM_SLUG]
```

The Google principal usually follows this shape:

```txt
principal://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/subject/owner:VERCEL_TEAM:project:VERCEL_PROJECT:environment:production
```

Grant that principal access to impersonate:

```txt
executive-assistant-keep-reade@gtd-assistant-490800.iam.gserviceaccount.com
```

with the needed service-account impersonation permission.

Codex should walk through this slowly when you are ready.

## Step 7: Install On Android

On Android:

1. Open Chrome.
2. Go to the Vercel URL.
3. Sign in with Google.
4. Confirm the dashboard works.
5. Tap the Chrome menu.
6. Tap **Add to Home screen** or **Install app**.

After that, Executive Assistant should open from your Android home screen like an app.

## Things To Check Before Calling It Done

- Google sign-in works on Vercel.
- Tasks load.
- Calendar events load.
- Gmail inbox items load.
- Google Keep suggestions load.
- Keep suggestions can become tasks.
- Recent changes drawer works.
- Android home-screen install works.
- Slack warning is either fixed or Slack is intentionally disabled.

