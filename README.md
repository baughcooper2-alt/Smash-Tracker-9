# Smash Tracker

A win/loss tracker for solo and doubles matches, built as an installable Progressive Web App (PWA).

## Files

- [index.html](index.html) — the app itself (self-contained, no build step required)
- [manifest.webmanifest](manifest.webmanifest) — PWA manifest (name, icons, theme colors)
- [service-worker.js](service-worker.js) — network first: every open loads the newest version, and the saved copy is used offline
- [support.js](support.js) — generated runtime support code; do not edit by hand (see the file header for the rebuild command). One small speed fix is hand-applied to it and to the copy bundled inside index.html: list items inherit the page's values instead of copying them all, which made big tabs render several times faster. Re-apply it if the file is regenerated.
- [roster-seed.json](roster-seed.json) — seed/exported match and roster data
- [icon-192.png](icon-192.png) — app icon
- [remote.html](remote.html) — phone remote: a simplified controller that logs games straight into the synced data
- [sounds/](sounds/) — recorded sound effects (CC0 / CC BY / CC BY-SA, see [sounds/CREDITS.txt](sounds/CREDITS.txt))
- [photolog.js](photolog.js) — reads a photo of the results screen for photo logging, shared by the tracker and the phone remote
- [fx.js](fx.js) — win / loss / six-stock animations and the snow, shared by the tracker and the phone remote
- [sync.js](sync.js) — cloud sync engine shared by the tracker and the phone remote
- [api/sync-config.js](api/sync-config.js) — Vercel function that hands the browser the Supabase URL and public key
- [supabase/schema.sql](supabase/schema.sql) — database tables and access rules for cloud sync
- [fonts/](fonts/) — M PLUS 1p, a free lookalike of the square, heavy type in Smash Ultimate's menus, used for every tab, screen, pop-up and the phone remote, with headings and buttons slanted like the game's (SIL Open Font License, see [fonts/OFL.txt](fonts/OFL.txt))
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

## Phones

- **Swipe** left or right on the page to move to the next or previous tab (charts, the tab bar, buttons and inputs don't trigger it).
- **Tab bar:** shows the four tabs you use most plus **⋯ MORE**, which opens the rest as big menu tiles. When you're on one of those, the MORE button shows its name. The bar is worked out once per visit so it never reshuffles under your thumb.
- **Haptics:** wins, losses and six-stocks each have their own vibration pattern, and the remote ticks on taps (with its own patterns for rematch and undo). Switch it off in the MORE sheet on the tracker or the remote's footer. Vibration works on Android; iPhones don't let web pages vibrate.

## Look

The tracker and the phone remote are styled after the Smash Ultimate menus: a rounded heavy typeface, a black header with a red edge, tabs as slanted colour tiles (Home red, Session orange, Stats blue, Random green, Tiers pink, Roster gold, Sync purple) with a yellow frame on the one you're on, black slanted plates for section titles, slanted tiles for the big buttons (Resume Session, WIN, LOSS) that light up with a yellow frame, striped backgrounds, and a black info bar along the bottom on computers that describes the current tab and shows the time. The character select matches too. On a computer it has a yellow slanted banner with a red round back button, a yellow frame on the hovered fighter, and striped player cards in each player's colour (P1 red, P2 blue, CPUs grey) with white name plates. On phones the fighter picker is a dark select screen with portrait tiles, name strips and a yellow frame on the current pick. Switching tabs is a quick two-step: the tab you tapped lights up immediately, the current page fades and slides out (about 0.15s), the page jumps back to the top while it's invisible, and the new page fades and slides in from the side you're heading toward (about 0.35s). It only animates opacity and position, so it stays smooth on phones and works in every browser; reduced-motion settings turn it off. On phones the tab bar scrolls itself to keep the current tab in view. It's an inspired look built from scratch, with no Nintendo logos or artwork.

**Dark mode:** the theme button in the header cycles **🌗 AUTO** (follows your phone or computer's light/dark setting and switches with it), **🌙 DARK** and **☀️ LIGHT**. Dark keeps the same look on charcoal: the colour tiles, yellow frames, stripes, slanted plates and charts all carry over, and the Prime Time heatmap uses darker fills. The phone remote follows the same setting on that device and has its own **THEME** switch in the footer. The choice is saved per device, and the page starts in the right mode so it never flashes white.

## Home page

Home shows a **Top 10 for each player** — Cooper (his own fighter in every game) and Nathan (his doubles picks plus any 1v1 where he's tagged as the rival), ranked by wins. The **ALL / 1V1 / 2V2** switch filters both boards, and tapping a fighter opens its breakdown.

## Character select (computer)

On a computer (any window 900px or wider), tapping a fighter slot on **SESSION** opens a full-screen character select modeled on Smash Ultimate's: portrait squares in the game's roster order (DLC before the Miis, with a **?** Random square at the end), and a player card for each slot along the bottom. Picks go in order: **P1 Cooper → P2 Nathan → CPU → CPU** (1v1 is P1 Cooper → the opponent, labeled with the tagged rival if there is one). Each pick moves on to the next card; click any card to jump back to it. Hovering a square previews it on the active card, and P1 / P2 / CPU badges mark who's on which fighter. Type to search, **Enter** picks the highlighted match (or closes when the search box is empty), **Tab** switches cards, **Esc** closes. Phones keep the original pop-up picker.

## Shortcuts and effects

- Keys **1**–**9** switch tabs (Home, Session, Stats, Rivals, Awards, Random, Tiers, Roster, Sync). **W** or **L** starts logging a win or loss. Then a number picks the stocks (**0** skips) and **Esc** cancels. **R** sets up a rematch of the last game, **Y** opens the year in review.
- Logging a game plays a Smash-style results screen: a **GAME!** slash, then both teams' portraits with the winners lit up in gold and the losers greyed out. Confetti for a win, a shake for a loss, and a bigger gold celebration for a flawless win (a six-stock in 3-stock 2v2, a three-stock in 1v1). Flawless games are gold in the match log and counted as **SIX-STOCKS** on Home and Stats. The phone remote shows the same results screen.
- Each result has a recorded sound, never the same one twice in a row. Wins: one of eight victory jingles and fanfares (orchestral, chiptune, sax), the short ones with a crowd, applause or fireworks under them. Six-stocks: a big fanfare (Hyper-Ultra-Fanfare or a title-bout fanfare) with a stadium crowd going wild. Losses: one of eight (game-show buzzer, arcade lose, wah-wah, sad trombone, life lost, game-over trumpet, a lost-bout sting, a fail sound).
- A **commentator** reacts to each game with a quick line, with the music ducking under it. What it says depends on how the game went: a six-stock ("Six stock! Somebody call the police!"), a blowout win ("Cooper, you're cooking!"), a close win ("Ugly, but it counts."), a close loss ("So close! Run it back."), a bad loss ("Come on Cooper, what was that?"), and streaks of 3, 5, 7, 10 or 15 ("He's on fire!" / "Three straight losses. Take a breather."). Doubles games add lines for Nathan. A game handed off to Nathan gets no commentary. The **🎙** button in the header opens the **Commentator** sheet. Pick **Classic · Her**, **Classic · Him**, **Hype** (loses it over everything), **Salty** (roasts you, win or lose), **British** ("jolly good show, chaps"), **My Lines** or **Off**, with a ▶ sample on each. Under **My Lines** you can write your own lines for each situation (six-stock, big win, close win, close loss, bad loss, plain win/loss, win and losing streaks), one per row with a ▶ test. They're spoken by your device's built-in voice and synced with the rest of your data. Switch **Mix in** on to have your lines turn up now and then whatever pack is picked. The 60+ lines were generated with the open-source Kokoro text-to-speech model and live in [sounds/voice/](sounds/voice/). Result and interface sounds only play on the tracker: a game logged on the phone remote plays its sound on the computer, and the phone stays silent. Tabs, buttons, KO counters, the fighter picker and random rolls have short, quiet interface sounds too. The **🔊 SOUND** button in the header turns all of it off. On iPhone, the ring/silent switch also mutes them. Sound credits and licenses are in [sounds/CREDITS.txt](sounds/CREDITS.txt).
- Achievements pop up at the top of the screen when you unlock one (after the results screen).
- The snow can be turned off with the **SNOW** button in the header (or **SNOW OFF** at the bottom of the phone remote).

## Session extras

- **Auto rivals:** when you play the same opposing characters twice in a row (no more than 3 hours apart) and no rival is set, the tracker (and the phone remote) asks who's playing them. Pick an existing rival, type a new name, or tap **JUST CPUs** so it won't ask about those opponents again. Naming them sets that person as the rival and tags those games, so they count in the Rivalry Ledger. If the same characters come back later, the question suggests the same name ("Jake AGAIN?").
- **Rivals switch off with the opponents:** any rival, whether named from that question, picked by hand under PLAYING AGAINST, or restored by a rematch, is tied to the opposing characters it was set with. It switches off as soon as either opposing fighter changes (or you switch 1v1/2v2), with a short message saying so. Pick your fighters first, then the rival.
- **Momentum** bar under today's record: a marker that slides toward **ON FIRE** or **ICE COLD** based on today's last 8 games, with newer games and bigger stock margins counting more.
- **📷 PHOTO LOG** (first button under WIN / LOSS on the tracker, **LOG FROM A PHOTO** on the phone remote): take a photo of the results screen, or pick one, and the app reads it on your device. Nothing is logged until you check it on the confirm sheet.
  - **Only Cooper and Nathan's panels are read.** They're always the two far-left panels and always the same team colour. The reader finds the far-left block of one strong team colour (blue, red, green or yellow) on the whole photo, crops just that block from the original photo at full detail, and does everything else inside the crop. The other team's panels never get read, whatever stats page they're showing. In 1v1 it's the single far-left panel. If the crop turns up no stats at all, it falls back to reading the whole photo.
  - **Inside the crop.** The block splits into two equal columns: left Cooper, right Nathan. A readable P1 tag pins Cooper's column start and the name row; the tilt comes from the block's top edge (or the tags). For each of them it reads the **KOs**, **Falls** and **SDs** rows (Falls show as negatives like "-2", which counts as 2). A row label hidden by the art is placed from the other rows, or copied from the teammate's panel. Each row is read as one tall strip, keeping only digit-sized marks centred on that row.
  - **Both stats pages.** If Cooper's or Nathan's panel shows the other stats page (KOs and Falls as rows of little character faces, plus Self-Destructs and Damage Given / Taken), the faces are counted instead: anything on the row that stands out from the row's own background and is about a face in size, in an unbroken run from the label, with "x2" after a face counting it twice. Thin row lines are wiped first so they don't glue onto the faces, and the faces may sit on the label's line or just under it. Self-Destructs is read as a number like SDs.
  - **Photos at an angle.** When the same row's label is read in both panels, the tilt is taken from that pair (perspective makes the panels' top edge lean more than the stats rows). Number strips run right up to the next panel, since the numbers sit at the far right, ignore marks cut off by either end (bits of panel border), and keep only the one line of digits nearest the row's middle.
  - **Fighter names** tolerate the letters OCR mixes up in the game's italic font ("CLOUP" for CLOUD) and match on the end of a name as well as the start ("VNETTA" for Bayonetta).
  - **Who won** comes from the placement number at the top right of Cooper's panel (1 = win), found by colour (gold for 1st, white for 2nd) and shape. If that isn't in the shot, the Falls row decides: if your team fell as many times as it had stocks, it's a loss.
  - **Stocks left**: a win is your stocks minus your falls **and SDs** (on the results screen a self-destruct isn't counted in Falls: the other side's KOs add up to your Falls alone), and a loss is their stocks minus your KOs (an estimate). The Falls rule for who won counts SDs the same way.
  - **Fighters: Cooper's and Nathan's.** Each panel's name row is cut out and read letters-only; a name, or the start of one ("BOWS" for Bowser), is a sure match (**READ**). Names that wrap onto two lines ("ZERO SUIT" / "SAMUS") are joined, and the match that explains more of the text wins, so Zero Suit Samus isn't mistaken for Samus. Otherwise the colours of the character art are compared with the portraits, nudged toward the fighters each of you plays (**GUESS**), with runner-up faces to tap (**PICKED**). The opponents' fighters come from the Session picks. The app remembers what confirmed fighters looked like in your photos (on that device), so the same TV reads better next time.
  - **Built for real TV photos.** It smooths out the TV's pixel grid (moiré), compares brightness locally so glare and dark corners don't hide text, retries a zoomed-in crop when the TV is small, and reads each number on its own with a shape check. A number it isn't sure of shows as a yellow **?** rather than a guess.
  - **🔍 HOW IT READ IT** swaps the photo for a diagram drawn on your phone: the area that was read, the Cooper / Nathan columns, every KOs / Falls / SDs row with the number it read, the name rows and the placement box, plus the result and the reader's version. **⤓ SAVE PHOTO** saves or shares the original photo (on iPhone: the share sheet). If a photo reads wrong, screenshot the diagram and send it with the saved photo so the reader can be tuned.
  - **Built for iPhone.** Big photos are shrunk in halving steps (shrinking in one go skips pixels and turns the TV's pixel grid into moiré), and the reader keeps its canvas memory low and frees it as soon as it's done, because Safari has a tight limit on canvas memory.
  - **The sheet** shows the photo, how it decided, WIN / LOSS, fighters, the stock count, and Cooper / Nathan steppers for KOs, Falls and SDs. Changing Falls or KOs updates the stock count unless you've tapped a stock. **WHAT THE CAMERA READ** shows the raw text. Then **✓ LOG IT** (or **↺ RETAKE**). Falls and SDs are saved on the game too.
  - The OCR engine (open-source Tesseract) downloads about 7 MB from jsDelivr on first use. For the best read, fill the frame with the TV and get the stats rows in.
- **Fighter roulette** (top of the **RANDOM** tab): a slot machine with one reel for Cooper, plus one for Nathan in 2v2, filled from the fighter mix below it. Pull the lever (or **PULL!**) and the reels spin, tick and slow down, landing one after the other. The names stay hidden until each reel stops. **USE THESE** sends the fighters to Session. Each player gets one **VETO** a night: it re-spins just their reel and won't land on the same fighter again. When the fighter mix is a duos preset (like Favorite Duos) and you're in 2v2, it lands on one of those duos, with Cooper and Nathan in a random order, and a veto re-spins to a different duo. The line under the title says what it draws from, and the footer shows whose veto is still ready tonight. The reels scale to the screen (one size on phones, bigger on a computer).
- **NEW RECORD!** alerts: when a game breaks a Record Book record, a popup with the commentator's hype line shows the new mark and the old one. It covers longest win streak, most games, six-stocks and stock haul in a day, Cooper's and Nathan's most KOs in a game, most days in a row and most fighters in a day. Each record alerts at most once a day, and only once you have a few games logged (no popups for a brand-new history).
- **↻ REMATCH** strip (tracker and phone remote): shows the last game, and its **WIN** / **LOSS** buttons put that game's exact setup back (mode, all four fighters, stage, items, stocks, rival) and go straight to the stock prompt.

## Year in review

**★ YEAR IN REVIEW** on Home (or **Y**) opens story-style cards for the year: games and record, Cooper's and Nathan's mains, best duo, best month, longest win streak, six-stocks, your nemesis and favorite victim, biggest night, prime time, clutch factor and achievements, ending with a summary you can copy. Cards advance on their own every 6 seconds. Tap the right side (or **→**) to go forward, the left side (or **←**) to go back, **Esc** to close. If you've played across more than one year, year chips at the bottom switch between them.

## Rivals tab

**RIVALS** collects everyone you've played for real (games tagged under PLAYING AGAINST, or named when the app asks after the same opponents twice):
- Overview tiles: rivals tracked, games against rivals (and their share of all games), your record against rivals, your toughest rival, and the rival you lead by the most. Tap the toughest rival or the biggest lead to open them.
- **Every number comes from one calculation**, so the overview, head to head and ledger always agree. Games count in the order they were played, a name counts the same whatever the capitals or stray spaces ("Jake", "jake ", "JAKE"), and a game with no stocks logged counts as 0 in the stock diff instead of breaking it. A W–L set by hand on a ledger card is added to the record and lead (with a note saying how much was hand-set); streaks, stock diff and the rest count logged games only.
- **Filters:** ALL TIME / 90 DAYS / 30 DAYS / 7 DAYS / TODAY and BOTH / 1V1 / 2V2 narrow the head to head.
- **▶ PLAY THEM NOW** sets the rival under PLAYING AGAINST and jumps to Session.
- **Tap any recent-form square** to edit that game. The **game list** shows every game against them (newest first): **✎** edits one, **✕** untags a game that wasn't really against them.
- **BEST PICK** (Cooper's best fighter against them, 2+ games) and **THEIR MAIN** (the fighter they bring most, with your record against it). Best picks are ranked so one lucky win doesn't outrank 10–2.
- **Head to head:** tap a rival for a VS banner with the record, win rate and who holds the belt, then win rate, lead, current streak, best run and worst skid, stock differential (and per game), close-game record, six-stocks by you and by them, and when you first and last played. Below that: a recent-form strip, a running-lead chart (wins minus losses, game by game), the fighters they bring with your record against each, your best picks against them, and splits by 1v1/2v2, stage and items.
- **All rivals · ledger:** the rivalry cards (with hand-edited W–L) moved here from Stats. Tap a name to open its head to head. **✎ RENAME** renames a rival everywhere (tagged games, hand edits, the auto-rival memory); renaming to another rival's name merges the two, which fixes a record split by a typo.

## Awards tab

**AWARDS** holds the achievements and the milestones (moved from Stats and Tiers), with a summary of achievements, milestones and challenge stars at the top.

**Milestones** are ladders you keep climbing, 52 rungs in 12 tracks: win streaks (5–30), games played (50–1,000), six-stocks (1–50), best fighter win rate (55–90%), team KOs (100–1,000), roster explored (10–80 fighters), duos tried (10–100), lifetime stock differential (+25 to +250), sessions (10–100), days in a row (3–14), rival wins (5–100) and challenges (1–25).


100 achievements on **AWARDS**, in bronze, silver, gold and platinum tiers, across ten categories: wins, streaks, six-stocks, fighters, duos, KOs, sessions, stages and items, challenges, and fun ones (Night Owl, Humbled, Smashmas). Some examples: Centurion (100 wins), Untouchable (30 wins in a row), Hat Trick (three six-stocks in a day), Twinning (win a 2v2 with both of you on the same fighter), Solo Carry (Cooper gets every team KO in a win), Perfect Night (a 10+ game day with no losses) and Board Cleared (finish every challenge in a week). Each one shows its progress (like 49 / 50). **UP NEXT** lists the ones you're closest to, **UNLOCKED** lists what you've earned, and the category chips filter the rest. Achievements are worked out from your games, so they're the same on every device. Each device remembers which ones it has already shown. When a new version adds achievements, the ones you'd already earned are marked as seen, with a single "new achievements" note instead of a pop-up for each.

## Challenges

**Challenges** on Home is a weekly board of six, built around fighters and duos you never touch:
- two fighters for Cooper and two for Nathan that they've never (or hardly ever) played, each needing one win (★)
- a duo you've never run together, needing two wins (★★)
- one bonus (★★★): both of you on the same fighter, three wins with a fighter Cooper rarely uses, a blowout win with one, or beating your nemesis opponent twice

**PLAY IT** loads that challenge's fighters (switching to 2v2 when it needs Nathan) and opens **SESSION**. Cards light up green when a win with your current setup would count, and the Session tab has a short list of open challenges. Finishing one shows **CHALLENGE COMPLETE** with a commentator line. Completed challenges and stars are saved and synced, and they count toward the challenge achievements.

A new board arrives every Monday, announced with "A NEW CHALLENGER APPROACHES!". It's the same on every device, since it's built from the week and the games played before it started. **⟳ SHUFFLE** (tap twice) swaps in a new set; progress on unfinished challenges restarts from that moment, and completed ones stay completed.

## Fighter profiles

Every fighter has a full profile page: a big portrait, record and win rate on your side, first and last time played, the last 20 games as a form strip, Cooper / Nathan / 1v1 / 2v2 splits, best teammate, best stage, nemesis (worst losing matchup), favorite victim, its record when it's on the other side, close-game record, six-stocks and Cooper's KOs per game. Open one from **FULL FIGHTER PROFILE** in a Top 10 fighter's breakdown, **PROFILE ▸** on the Roster tab, or a clutch fighter. **◀ / ▶** (or the arrow keys) step through every fighter you've played.

## Stats additions

- **Top of the page:** **Doubles Synergy** (your best Cooper + Nathan pairings) and the **Streak Board** (current streak, best win run, worst skid) sit side by side right under the range bar, on phones too. The old Fighter Breakdown table is gone; the Roster tab and fighter profiles cover per-fighter records.
- **Range:** a bar at the top of STATS picks **ALL TIME / 90 DAYS / 30 DAYS / 7 DAYS**. It applies to the charts, the 1v1/2v2, stage and item splits, the KO tiles, Prime Time and Clutch (the record book, report card and fighter tables stay all-time).
- **Expand any chart:** the **⤢** button next to a card's title (stock margin, win rate, Prime Time, Clutch, KOs, history scrubber, record book, report card) opens it full screen with taller charts and the range bar on top. **Esc**, **✕ CLOSE** or tapping outside closes it.
- **Record book:** longest win and losing streaks (with dates), most games in a day, best and roughest day (5+ games), most six-stocks in a day, biggest stock haul in a day, Cooper's and Nathan's most KOs in a game, longest session, most days in a row, longest break, most fighters in a day, best month (10+ games) and your first game.
- **Monthly report card:** pick a month for its letter grade (same S–F scale as the tier list), record, win rate, days played, six-stocks, stocks per game and team KOs per game, each with ▲/▼ against the month before, plus Cooper's and Nathan's mains, best fighter, best duo, most improved fighter and best day.
- **Count-ups:** big numbers (career record, stat tiles, rival and award totals, records) roll up from zero when a tab opens.
- **Chart periods:** the three over-time charts each have their own switch. **Stock Margin** and **KOs** can show **GAME** (every game), **DAY**, **WEEK** (starting Monday) or **MONTH**. **Win Rate** can show **DAY**, **WEEK** or **MONTH**. Grouped views show the average stock margin per game, the win rate, or KOs per game for each period, and hovering a point shows its record and game count. Each device remembers your choice.
- **Prime time:** a heatmap of win rate by day of the week and time of day (3-hour blocks), with day and time totals and a line naming your best and worst slots. Red means losing, grey is 50%, green is winning. Every cell shows its number, and hovering a cell shows the record and stock diff. Cells with fewer than 3 games are faded.
- **Clutch factor:** your record in close games (decided by about a third of the stocks or less: 1 stock in 3-stock 1v1, 1–2 in 2v2), solid wins and blowouts (two thirds or more), a verdict (**CLUTCH**, **STEADY** or **SHAKY**) comparing close games with your overall rate, and your most clutch fighters.
