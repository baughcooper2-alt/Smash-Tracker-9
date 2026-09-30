# Cloud sync setup

Cloud sync keeps every game, fighter pick, KO count, roster name and portrait in a free [Supabase](https://supabase.com) database. The tracker and the phone remote (`remote.html`) read and write it live, so a game logged on your phone shows up on the tracker right away, even if the tracker was closed.

You only do this once, and it takes about 5 minutes.

## 1. Create the database and connect it to Vercel

**Easiest:** in the [Vercel dashboard](https://vercel.com/dashboard), open the **smash-tracker-9** project → **Storage** → **Create Database** → **Supabase**. Follow the prompts, and connect it to this project for all environments. Vercel adds the Supabase URL and key to the project for you.

**Or by hand:** create a project at [supabase.com](https://supabase.com). Then in Vercel go to **Settings → Environment Variables** and add:

| Name | Value (Supabase → Project Settings → API) |
| --- | --- |
| `SUPABASE_URL` | Project URL, like `https://abcd1234.supabase.co` |
| `SUPABASE_ANON_KEY` | the `anon` public key (or the publishable key) |

Never add the `service_role` or secret key. The site only needs the public key.

## 2. Create the tables

In Supabase open **SQL Editor → New query**. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and press **Run**. It's safe to run again later.

## 3. Turn off email confirmation

In Supabase go to **Authentication → Sign In / Providers → Email** and switch off **Confirm email**, then save. Otherwise you'd have to click a confirmation email before your first sign-in.

## 4. Redeploy

In Vercel go to **Deployments**, open the latest one, and choose **⋯ → Redeploy**. The new keys only reach deployments made after you added them.

## 5. Sign in

1. Open the tracker, go to the **SYNC** tab, type an email and a password, and tap **CREATE ACCOUNT**. The games already on that device upload automatically.
2. On your phone, scan the QR code on the SYNC tab (or open `/remote.html`), then sign in with the same email and password. Then use Share → **Add to Home Screen**.
3. Any other computer or tablet: open the tracker, go to **SYNC**, and tap **SIGN IN**. If that device has games the cloud doesn't, it asks whether to add them or throw them away.

Optional: once everyone who uses it has signed in, you can stop strangers from making accounts. In Supabase, go to **Authentication → Sign In / Providers** and turn off **Allow new users to sign up**. Each account only ever sees its own data either way.

## How it behaves

- **Offline:** every device keeps working and saves locally. Changes upload when it's back online, and the status pill says **OFFLINE** until then.
- **Same thing changed on two devices at once:** the most recent upload wins for that one setting or game. Different games never overwrite each other.
- **Deleting a game** (undo, or delete in the tracker) removes it on every device.
- **Backups:** the tracker's own export and backup files still work as before.

## Troubleshooting

- **SYNC tab says "NOT SET UP YET"** after you redeployed: check the environment variables are on the **Production** environment and named exactly as above. Opening `/api/sync-config` on your site should show a `url` and a `key`.
- **Wrong email or password** on a new device: the account is made once (step 5.1). After that, every device uses **SIGN IN**.
- **Not using Vercel:** on the SYNC tab, tap **ENTER KEYS BY HAND** and paste the Project URL and anon key. This saves on that device only.
