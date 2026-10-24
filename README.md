# MasterMath

Kumon-style arithmetic practice as an installable web app for one child on a stylus tablet. The full design is in `MasterMath Build Spec.md`.

## Where the build is

**The app now follows Kumon Level B and replaces paper Kumon.** She passed B100 on paper, so it starts at B101 (subtraction review up to 20), then column subtraction with borrowing, mixed 2-digit work, and 3-digit subtraction up to B200. Block titles and target times come from Kumon’s published Table of Learning Materials; the plan `docs/superpowers/plans/2026-10-24-kumon-level-b.md` has the block table and every decision.

How a day works:

- **Today’s set** is 10 Kumon sheets, each with an a and a b side: 20 sides. Each side fits one screen with no scrolling, in at most two columns, numbered down each column.
- **Horizontal sides** hold 20 problems (“12 − 7 =”). **Column sides** hold 10, stacked with a rule line and one box per digit of the answer.
- **In order:** a problem accepts ink only once every earlier problem has an answer.
- **Repetition:** every problem appears twice on its side, never back to back and never beside its twin.
- **Self-correction:** Submit marks the whole side; wrong answers get an amber circle, the answer is never shown, and “Try these again” brings back only those until the side is clean.
- **Moving on:** a block of 10 sheets passes at 90 % right first time and a median side time within half of Kumon’s per-sheet target. Otherwise the block repeats, with the same sheets, as on paper.
- **Mistakes come back:** a problem answered wrong, or right but slower than 3 s to the first stroke, returns in later sides (up to 2 per side, twice each) until it is right and fast twice running.
- Progress is saved on the tablet after every side.

Still open: the recogniser confuses some of her digits (4/9, 5/6, 2/3). **Try it → Download handwriting data** exports her samples so a fix can be measured on her real handwriting. Step 1’s “N of 100 read correctly” is also still to be reported.

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
   - **Start today’s set** (home screen): B101a first. Problems go in order: the next one accepts the pencil only once the current one has an answer. Back (top-left) leaves the side and loses it. Undo takes back the last action anywhere on the side: a stroke goes, or a rubbed-out stroke comes back. Rubber is a toggle; while it is on, the pencil removes whatever stroke it passes over, and one swipe is one undo step. Submit is enabled once every box has ink. Wrong answers then get an amber circle and a small “Read as … · not what I wrote” button, which accepts the answer when the app misread her. “Try these again” shows only the remaining wrong problems, cleared; when the side is clean, “Done” saves it and shows its time and correction rounds. Each finished side is saved, so closing the app mid-set loses at most the side in progress.
5. Report back the line “N of 100 read correctly” plus the confusion list once all 100 are done. “Show results” reveals the full JSON; “Copy results” only works over HTTPS, so over the LAN use Show results and photograph or transcribe it.
6. From the daily set, worth reporting: whether a circle ever lands on an answer she wrote correctly (that is the misread case the override exists for, and how often it happens is the number to watch), whether Undo and Rubber do what she expects with the pencil, and whether the timer in the corner helps or hurts. The timer can be switched off with one line in `src/engine/config.ts`.

If the pencil does not draw in a box at all, the browser is probably reporting it as a finger (`pointerType: "touch"`), which the box ignores on purpose. Report that before anything else; it changes the capture design, not the recogniser.

Templates live in the tablet browser’s IndexedDB. Clearing site data clears them, and the check screen and the daily set will ask for calibration again. Progress (saved sides) lives in the same storage.

## Layout

```
src/ink/        capture.ts     pointer samples → strokes, palm rejection, undo, rubber
                normalise.ts   $P resample, scale, translate
                recogniser.ts  $P cloud distance, recognise()
                templates.ts   active template set
                sequence.ts    prompt order for calibration and the check
                check.ts       check summary
src/curriculum/ levelB.ts      Kumon Level B: 20 blocks, titles, target times, problem rules
src/engine/     config.ts      every tunable constant
                worksheet.ts   side state machine: mark a round, corrections, override, timings
                sheet.ts       one side from a sheet code: repetition, review problems
                progress.ts    position, block pass or repeat, review pool, today's count
                activeClock.ts idle-aware active time, mm:ss formatting
src/db/         schema.ts, repo.ts   IndexedDB v3: templates, check items, sides; append-only
src/ui/         tokens.css, AnswerBox.tsx, ProblemView.tsx, Sheet.css
src/screens/    Today (home and the daily set), Sheet, Calibrate, TryBox, RecogniserCheck
tests/          unit tests for ink/, engine/ and db/
```
