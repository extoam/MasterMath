# MasterMath

Kumon-style arithmetic practice as an installable web app for one child on a stylus tablet. The full design is in `MasterMath Build Spec.md`.

## Where the build is

**Build steps 1 and 2 are implemented. Step 1 is still waiting for its measurement.**

Step 1 is the stroke capture and digit recogniser: one answer box, palm rejection, a $P point-cloud recogniser fed by a calibration game, and a 100-digit check screen that reports accuracy. Its acceptance criterion is at least 95 % of 100 digits written by the child on the tablet read correctly. That number can only come from her hand. Below 90 %: stop and report before building anything else.

Step 2 is the worksheet and corrections loop: one hard-coded 10-item multiplication page, marked as a whole on Submit, wrong items circled and brought back cleared until the page is clean, with correction rounds, per-item retrieval latency and idle-paused active time held in memory. It was started on 2026-10-24 at the owner’s request before the step 1 number was reported. Persistence of pages is step 3.

Two things on the worksheet are the owner’s decisions, not the spec’s: a live timer in the top-right corner (the spec says no visible timer; it is behind `config.worksheet.showTimer`) and Back, Undo and Rubber controls in the top-left corner, like the Kumon Connect app.

Two things to know before step 3 persists any of this. Per-item `firstStrokeMs` is measured from the end of the previous pen activity anywhere on the page (or the round start for the first thing she writes), not from when the page appeared; `submittedMs` is the item’s last stroke from the same reference. And an unreadable box cannot be detected in v1: the recogniser always returns its nearest digit for any ink, so a scribble is marked against that digit rather than circled as unread. A rejection threshold needs her calibration scores, which the check screen stores.

## Running it

Node 22 or newer.

```
npm install
npm run dev        # dev server on the LAN
npm test           # unit tests for ink/, engine/ and db/
npm run build      # type-check and production build
```

## Testing on the tablet

1. Put the tablet on the same Wi-Fi as this Mac.
2. Run `npm run dev`. It prints a `Network:` URL such as `http://192.168.70.116:5173/` (the address depends on the Mac's current IP).
3. Open that URL in the tablet browser (Huawei Browser on the MatePad, Safari on an iPad). Use the pencil, not a finger: fingers are deliberately ignored inside answer boxes.
4. Run the screens in this order:
   - **Teach the app your handwriting**: 30 prompts, each digit three times. Every sample is saved the moment Next is tapped, so stopping part-way loses nothing. Running it on two or three separate days gives the recogniser 6 to 9 samples per digit, which is where it should be.
   - **Try it**: a sanity check. Write a digit, lift the pencil, read what the app thought. “Confident” means the runner-up was well behind.
   - **Handwriting check**: 100 prompts, no feedback per item. Every answer is saved as it is given, so she can do 20 today and 20 tomorrow: Back is safe, and the check resumes where it stopped. “Results so far” shows the count at any point, and the end screen shows “N of 100 read correctly”, how many were not read at all, how many were not confident, and which digits were confused with which. The final result stays visible until “Start a new check”.
   - **Start** (the worksheet): ten multiplication problems from tables 6 and 7, one box per digit of the answer. Back (top-left) leaves the page and loses it. Undo takes back the last action anywhere on the page: a stroke goes, or a rubbed-out stroke comes back. Rubber is a toggle, and while it is on the pencil removes whatever stroke it passes over; one swipe is one undo step. Submit is enabled once every box has ink. The page is then marked as a whole: wrong items get an amber circle, with “Read as …” and “That’s not what I wrote” underneath. Tapping that accepts the item. “Try these again” shows only the remaining wrong items with their boxes cleared; repeat until the page is clean, then “Page complete” shows the correction rounds and the time. Nothing from the worksheet is saved yet; “Show details” on Page complete has the in-memory record (rounds, per-item timings, strokes).
5. Report back the line “N of 100 read correctly” plus the confusion list once all 100 are done. “Show results” reveals the full JSON; “Copy results” only works over HTTPS, so over the LAN use Show results and photograph or transcribe it.
6. From the worksheet, worth reporting: whether a circle ever lands on an answer she wrote correctly (that is the misread case the override exists for, and how often it happens is the number to watch), whether Undo and Rubber do what she expects with the pencil, and whether the timer in the corner helps or hurts. The timer can be switched off with one line in `src/engine/config.ts`.

If the pencil does not draw in a box at all, the browser is probably reporting it as a finger (`pointerType: "touch"`), which the box ignores on purpose. Report that before anything else; it changes the capture design, not the recogniser.

Templates live in the tablet browser’s IndexedDB. Clearing site data clears them, and the check and worksheet screens will ask for calibration again.

## Layout

```
src/ink/        capture.ts     pointer samples → strokes, palm rejection, undo, rubber
                normalise.ts   $P resample, scale, translate
                recogniser.ts  $P cloud distance, recognise()
                templates.ts   active template set
                sequence.ts    prompt order for calibration and the check
                check.ts       check summary
src/engine/     config.ts      every tunable constant
                worksheet.ts   page state machine: mark a round, corrections, override
                activeClock.ts idle-aware active time, mm:ss formatting
src/seed/       demoPage.ts    the one hard-coded page (step 2)
src/db/         schema.ts, repo.ts   IndexedDB v2, templates and check items, append-only
src/ui/         tokens.css, AnswerBox.tsx, ProblemRow.tsx, Worksheet.css
src/screens/    Calibrate, TryBox, RecogniserCheck, Worksheet, PageComplete
tests/          unit tests for ink/, engine/ and db/
```
