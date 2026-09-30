# Smash Tracker

A win/loss tracker for solo and doubles matches, built as an installable Progressive Web App (PWA).

## Files

- [index.html](index.html) — the app itself (self-contained, no build step required)
- [manifest.webmanifest](manifest.webmanifest) — PWA manifest (name, icons, theme colors)
- [service-worker.js](service-worker.js) — caches app assets for offline use
- [support.js](support.js) — generated runtime support code; do not edit by hand (see the file header for the rebuild command)
- [roster-seed.json](roster-seed.json) — seed/exported match and roster data
- [icon-192.png](icon-192.png) — app icon
- [remote.html](remote.html) — phone remote: a simplified controller that logs games straight into the synced data
- [sync.js](sync.js) — cloud sync engine shared by the tracker and the phone remote
- [api/sync-config.js](api/sync-config.js) — Vercel function that hands the browser the Supabase URL and public key
- [supabase/schema.sql](supabase/schema.sql) — database tables and access rules for cloud sync
- [vendor/](vendor/) — third-party libraries (supabase-js for sync, qrcode-generator for the phone QR code)

## Running locally

This is a static site with no build step. Serve the folder with any static file server and open it in a browser, for example:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Installing as a PWA

Once served over `http`/`https`, most browsers will offer an "Install" or "Add to Home Screen" option, using the icon and metadata from [manifest.webmanifest](manifest.webmanifest).

## Cloud sync and phone remote

Sign in on the tracker's **SYNC** tab and your games, fighters, KOs, roster and portraits live in a Supabase database that every signed-in device reads and writes live. The phone remote (`remote.html`, linked by QR code on the SYNC tab) is a stripped-down controller: pick fighters, count KOs, tap WIN/LOSS, pick stocks. It works even when the tracker is closed. Every device keeps a local copy, so it still works offline and catches up when it reconnects.

One-time setup (Supabase + Vercel): see [SYNC-SETUP.md](SYNC-SETUP.md). Without it the tracker works exactly as before, saving on the device only.
