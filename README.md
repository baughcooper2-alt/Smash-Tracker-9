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
- [fonts/](fonts/) — M PLUS Rounded 1c, the rounded heavy typeface behind the Smash-style look (SIL Open Font License, see [fonts/OFL.txt](fonts/OFL.txt))
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

Sign in on the tracker's **SYNC** tab and your games, fighters, KOs, roster and portraits live in a Supabase database that every signed-in device reads and writes live. The phone remote (`remote.html`, linked by QR code on the SYNC tab) has two screens. **LOG GAME**: pick fighters, count KOs, tap WIN/LOSS, pick stocks. **SESSION**: today’s record, win rate, stock diff, streaks, KOs, six-stocks, momentum, your picks, toughest opponents and every game. It works even when the tracker is closed. Every device keeps a local copy, so it still works offline and catches up when it reconnects.

One-time setup (Supabase + Vercel): see [SYNC-SETUP.md](SYNC-SETUP.md). Without it the tracker works exactly as before, saving on the device only.

## Look

The tracker and the phone remote are styled after the Smash Ultimate menus: a rounded heavy typeface, a black header with a red edge, tabs as slanted colour tiles (Home red, Session orange, Stats blue, Random green, Tiers pink, Roster gold, Sync purple) with a yellow frame on the one you're on, black slanted plates for section titles, slanted tiles for the big buttons (Resume Session, WIN, LOSS) that light up with a yellow frame, striped backgrounds, and a black info bar along the bottom on computers that describes the current tab and shows the time. It's an inspired look built from scratch, with no Nintendo logos or artwork.

## Home page

Home shows a **Top 10 for each player** — Cooper (his own fighter in every game) and Nathan (his doubles picks plus any 1v1 where he's tagged as the rival), ranked by wins. The **ALL / 1V1 / 2V2** switch filters both boards, and tapping a fighter opens its breakdown.

## Character select (computer)

On a computer (any window 900px or wider), tapping a fighter slot on **SESSION** opens a full-screen character select modeled on Smash Ultimate's: portrait squares in the game's roster order (DLC before the Miis, with a **?** Random square at the end), and a player card for each slot along the bottom. Picks go in order: **P1 Cooper → P2 Nathan → CPU → CPU** (1v1 is P1 Cooper → the opponent, labeled with the tagged rival if there is one). Each pick moves on to the next card; click any card to jump back to it. Hovering a square previews it on the active card, and P1 / P2 / CPU badges mark who's on which fighter. Type to search, **Enter** picks the highlighted match (or closes when the search box is empty), **Tab** switches cards, **Esc** closes. Phones keep the original pop-up picker.

## Shortcuts and effects

- Keys **1**–**7** switch tabs. **W** or **L** starts logging a win or loss. Then a number picks the stocks (**0** skips) and **Esc** cancels. **R** sets up a rematch of the last game, **Y** opens the year in review.
- Logging a game plays a Smash-style results screen: a **GAME!** slash, then both teams' portraits with the winners lit up in gold and the losers greyed out. Confetti for a win, a shake for a loss, and a bigger gold celebration for a flawless win (a six-stock in 3-stock 2v2, a three-stock in 1v1). Flawless games are gold in the match log and counted as **SIX-STOCKS** on Home and Stats. The phone remote shows the same results screen.
- Each result has a recorded sound, never the same one twice in a row. Wins: one of eight victory jingles and fanfares (orchestral, chiptune, sax), the short ones with a crowd, applause or fireworks under them. Six-stocks: a big fanfare (Hyper-Ultra-Fanfare or a title-bout fanfare) with a stadium crowd going wild. Losses: one of eight (game-show buzzer, arcade lose, wah-wah, sad trombone, life lost, game-over trumpet, a lost-bout sting, a fail sound).
- A **commentator** reacts to each game with a quick line, with the music ducking under it. What it says depends on how the game went: a six-stock ("Six stock! Somebody call the police!"), a blowout win ("Cooper, you're cooking!"), a close win ("Ugly, but it counts."), a close loss ("So close! Run it back."), a bad loss ("Come on Cooper, what was that?"), and streaks of 3, 5, 7, 10 or 15 ("He's on fire!" / "Three straight losses. Take a breather."). Doubles games add lines for Nathan. A game handed off to Nathan gets no commentary. The **🎙** button in the header switches between two voices (**HER** and **HIM**) or turns it **OFF**. The 60+ lines were generated with the open-source Kokoro text-to-speech model and live in [sounds/voice/](sounds/voice/). Result and interface sounds only play on the tracker: a game logged on the phone remote plays its sound on the computer, and the phone stays silent. Tabs, buttons, KO counters, the fighter picker and random rolls have short, quiet interface sounds too. The **🔊 SOUND** button in the header turns all of it off. On iPhone, the ring/silent switch also mutes them. Sound credits and licenses are in [sounds/CREDITS.txt](sounds/CREDITS.txt).
- Achievements pop up at the top of the screen when you unlock one (after the results screen).
- The snow can be turned off with the **SNOW** button in the header (or **SNOW OFF** at the bottom of the phone remote).

## Session extras

- **Auto rivals:** when you play the same opposing characters twice in a row (no more than 3 hours apart) and no rival is set, the tracker (and the phone remote) asks who's playing them. Pick an existing rival, type a new name, or tap **JUST CPUs** so it won't ask about those opponents again. Naming them sets that person as the rival and tags those games, so they count in the Rivalry Ledger. If the same characters come back later, the question suggests the same name ("Jake AGAIN?").
- **Rivals switch off with the opponents:** any rival, whether named from that question, picked by hand under PLAYING AGAINST, or restored by a rematch, is tied to the opposing characters it was set with. It switches off as soon as either opposing fighter changes (or you switch 1v1/2v2), with a short message saying so. Pick your fighters first, then the rival.
- **Momentum** bar under today's record: a marker that slides toward **ON FIRE** or **ICE COLD** based on today's last 8 games, with newer games and bigger stock margins counting more.
- **↻ REMATCH** strip (tracker and phone remote): shows the last game, and its **WIN** / **LOSS** buttons put that game's exact setup back (mode, all four fighters, stage, items, stocks, rival) and go straight to the stock prompt.

## Year in review

**★ YEAR IN REVIEW** on Home (or **Y**) opens story-style cards for the year: games and record, Cooper's and Nathan's mains, best duo, best month, longest win streak, six-stocks, your nemesis and favorite victim, biggest night, prime time, clutch factor and achievements, ending with a summary you can copy. Cards advance on their own every 6 seconds. Tap the right side (or **→**) to go forward, the left side (or **←**) to go back, **Esc** to close. If you've played across more than one year, year chips at the bottom switch between them.

## Achievements

100 achievements on **STATS**, in bronze, silver, gold and platinum tiers, across ten categories: wins, streaks, six-stocks, fighters, duos, KOs, sessions, stages and items, challenges, and fun ones (Night Owl, Humbled, Smashmas). Some examples: Centurion (100 wins), Untouchable (30 wins in a row), Hat Trick (three six-stocks in a day), Twinning (win a 2v2 with both of you on the same fighter), Solo Carry (Cooper gets every team KO in a win), Perfect Night (a 10+ game day with no losses) and Board Cleared (finish every challenge in a week). Each one shows its progress (like 49 / 50). **UP NEXT** lists the ones you're closest to, **UNLOCKED** lists what you've earned, and the category chips filter the rest. Achievements are worked out from your games, so they're the same on every device. Each device remembers which ones it has already shown. When a new version adds achievements, the ones you'd already earned are marked as seen, with a single "new achievements" note instead of a pop-up for each.

## Challenges

**Challenges** on Home is a weekly board of six, built around fighters and duos you never touch:
- two fighters for Cooper and two for Nathan that they've never (or hardly ever) played, each needing one win (★)
- a duo you've never run together, needing two wins (★★)
- one bonus (★★★): both of you on the same fighter, three wins with a fighter Cooper rarely uses, a blowout win with one, or beating your nemesis opponent twice

**PLAY IT** loads that challenge's fighters (switching to 2v2 when it needs Nathan) and opens **SESSION**. Cards light up green when a win with your current setup would count, and the Session tab has a short list of open challenges. Finishing one shows **CHALLENGE COMPLETE** with a commentator line. Completed challenges and stars are saved and synced, and they count toward the challenge achievements.

A new board arrives every Monday, announced with "A NEW CHALLENGER APPROACHES!". It's the same on every device, since it's built from the week and the games played before it started. **⟳ SHUFFLE** (tap twice) swaps in a new set; progress on unfinished challenges restarts from that moment, and completed ones stay completed.

## Fighter profiles

Every fighter has a full profile page: a big portrait, record and win rate on your side, first and last time played, the last 20 games as a form strip, Cooper / Nathan / 1v1 / 2v2 splits, best teammate, best stage, nemesis (worst losing matchup), favorite victim, its record when it's on the other side, close-game record, six-stocks and Cooper's KOs per game. Open one from **FULL FIGHTER PROFILE** in a Top 10 fighter's breakdown, **PROFILE ▸** on the Roster tab, a row in Stats' Fighter Breakdown, or a clutch fighter. **◀ / ▶** (or the arrow keys) step through every fighter you've played.

## Stats additions

- **Chart periods:** the three over-time charts each have their own switch. **Stock Margin** and **KOs** can show **GAME** (every game), **DAY**, **WEEK** (starting Monday) or **MONTH**. **Win Rate** can show **DAY**, **WEEK** or **MONTH**. Grouped views show the average stock margin per game, the win rate, or KOs per game for each period, and hovering a point shows its record and game count. Each device remembers your choice.
- **Prime time:** a heatmap of win rate by day of the week and time of day (3-hour blocks), with day and time totals and a line naming your best and worst slots. Red means losing, grey is 50%, green is winning. Every cell shows its number, and hovering a cell shows the record and stock diff. Cells with fewer than 3 games are faded.
- **Clutch factor:** your record in close games (decided by about a third of the stocks or less: 1 stock in 3-stock 1v1, 1–2 in 2v2), solid wins and blowouts (two thirds or more), a verdict (**CLUTCH**, **STEADY** or **SHAKY**) comparing close games with your overall rate, and your most clutch fighters.
