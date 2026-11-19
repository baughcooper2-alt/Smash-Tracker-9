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
- [sounds/](sounds/) — recorded sound effects (CC0 / CC BY / CC BY-SA, see [sounds/CREDITS.txt](sounds/CREDITS.txt))
- [fx.js](fx.js) — win / loss / six-stock animations and the snow, shared by the tracker and the phone remote
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

- **iPhone / iPad:** open the site in Safari → Share → **Add to Home Screen**.
- **Mac (Safari):** File → **Add to Dock**.
- **Mac (Chrome):** the install icon at the right of the address bar, or ⋮ → Cast, save, and share → **Install page as app**.

An installed app keeps its own storage, separate from the browser tab. Open the app once, go to **SYNC** and sign in; after that it loads your data from the cloud every time, with no restoring from backups.

## Cloud sync and phone remote

Sign in on the tracker's **SYNC** tab and your games, fighters, KOs, roster and portraits live in a Supabase database that every signed-in device reads and writes live. The phone remote (`remote.html`, linked by QR code on the SYNC tab) is a stripped-down controller: pick fighters, count KOs, tap WIN/LOSS, pick stocks. It works even when the tracker is closed. Every device keeps a local copy, so it still works offline and catches up when it reconnects.

One-time setup (Supabase + Vercel): see [SYNC-SETUP.md](SYNC-SETUP.md). Without it the tracker works exactly as before, saving on the device only.

## Shortcuts and effects

- Keys **1**–**7** switch tabs. **W** or **L** starts logging a win or loss. Then a number picks the stocks (**0** skips) and **Esc** cancels.
- Logging a game plays an animation: confetti for a win, a shake for a loss, and a bigger gold celebration for a flawless win (a six-stock in 3-stock 2v2, a three-stock in 1v1). Flawless games are gold in the match log and counted as **SIX-STOCKS** on Home and Stats.
- Each result has a sound. Wins: a jingle, usually with a crowd, applause or fireworks. Six-stocks: a cinematic fanfare with a crowd going wild. Losses are silent for now (new loss sounds go in `SAMPLES.lossSay` in [fx.js](fx.js)). Tabs, buttons, KO counters, the fighter picker and random rolls have short, quiet interface sounds too. The **🔊 SOUND** button in the header (or **MUTE** at the bottom of the phone remote) turns all of it off. On iPhone, the ring/silent switch also mutes them. Sound credits and licenses are in [sounds/CREDITS.txt](sounds/CREDITS.txt).
- The snow can be turned off with the **SNOW** button in the header (or **SNOW OFF** at the bottom of the phone remote).
