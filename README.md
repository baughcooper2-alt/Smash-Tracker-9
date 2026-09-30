# Smash Tracker

A win/loss tracker for solo and doubles matches, built as an installable Progressive Web App (PWA).

## Files

- [index.html](index.html) — the app itself (self-contained, no build step required)
- [manifest.webmanifest](manifest.webmanifest) — PWA manifest (name, icons, theme colors)
- [service-worker.js](service-worker.js) — caches app assets for offline use
- [support.js](support.js) — generated runtime support code; do not edit by hand (see the file header for the rebuild command)
- [roster-seed.json](roster-seed.json) — seed/exported match and roster data
- [icon-192.png](icon-192.png) — app icon
- [remote.html](remote.html) — phone remote: a simplified controller that logs games into the tracker in real time
- [vendor/](vendor/) — third-party libraries for the phone remote (PeerJS for the peer-to-peer link, qrcode-generator for the pairing QR code)

## Running locally

This is a static site with no build step. Serve the folder with any static file server and open it in a browser, for example:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Installing as a PWA

Once served over `http`/`https`, most browsers will offer an "Install" or "Add to Home Screen" option, using the icon and metadata from [manifest.webmanifest](manifest.webmanifest).

## Phone remote

Open the **PHONE** tab in the tracker and turn the remote on. Scan the QR code with your phone (or open `remote.html` and type the 5-letter code). The phone becomes a stripped-down controller: pick fighters, count KOs, tap WIN/LOSS, pick stocks. Each action shows up on the tracker instantly.

The phone connects straight to the tracker over WebRTC (PeerJS's free public pairing server helps the two devices find each other). The tracker stays the only place games are saved, so it has to be open while you play. Games logged while the connection drops are queued on the phone and sent once it reconnects.
