# Smash Tracker

A win/loss tracker for solo and doubles matches, built as an installable Progressive Web App (PWA).

## Files

- [index.html](index.html) — the app itself (self-contained, no build step required)
- [manifest.webmanifest](manifest.webmanifest) — PWA manifest (name, icons, theme colors)
- [service-worker.js](service-worker.js) — caches app assets for offline use
- [support.js](support.js) — generated runtime support code; do not edit by hand (see the file header for the rebuild command)
- [roster-seed.json](roster-seed.json) — seed/exported match and roster data
- [icon-192.png](icon-192.png) — app icon

## Running locally

This is a static site with no build step. Serve the folder with any static file server and open it in a browser, for example:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Installing as a PWA

Once served over `http`/`https`, most browsers will offer an "Install" or "Add to Home Screen" option, using the icon and metadata from [manifest.webmanifest](manifest.webmanifest).
