# MasterMath

Kumon-style arithmetic practice as an installable web app for one child on a stylus tablet. The full design is in `MasterMath Build Spec.md`.

## Where the build is

**The app now follows Kumon Level B and replaces paper Kumon.** She passed B100 on paper, so it starts at B101 (subtraction review up to 20), then column subtraction with borrowing, mixed 2-digit work, and 3-digit subtraction up to B200. Block titles and target times come from Kumon’s published Table of Learning Materials; the plan `docs/superpowers/plans/2026-10-24-kumon-level-b.md` has the block table and every decision.

How a day works, as in Kumon:

- **One worksheet a day:** 10 Kumon sheets, a and b sides, 20 screens. A new worksheet unlocks each calendar day. Missed days pile up, and the waiting worksheets can all be done in one sitting.
- **Each side fits one screen** with no scrolling, in at most two columns, numbered down each column. Horizontal sides hold 20 problems; column sides hold 10, stacked with one box per digit of the answer.
- **In order:** a problem accepts the pencil only once the one before it has an answer, and a sheet only once the sheet before it is finished. A progress bar of sheets sits under the toolbar; tapping a sheet already reached goes back to it.
- **Submit only on the last sheet.** Nothing is marked that day: “Your marks and corrections will be here tomorrow.”
- **Corrections the next day, before anything new.** Wrong answers get an amber circle, never the right answer. The progress bar shows which sheets have mistakes and how many. Corrections are marked as soon as she submits them, and anything still wrong comes back at once until the worksheet is 100%.
- **Repetition:** every problem appears twice on its side, never back to back and never beside its twin.
- **Moving on:** a worksheet (one block) passes at 90 % right first time and a median side time within half of Kumon’s per-sheet target; otherwise the same sheets come back as the next worksheet.
- **Mistakes come back:** wrong or slow problems return in later worksheets until they are right and fast twice running.
- Work is saved as she goes, so Back or closing the app loses nothing.

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
   - **Start worksheet 1** (home screen): B101a to B110b. Toolbar icons top-left are Back, Undo and Rubber; the timer is top-right. Write each sheet, tap Next sheet, and Submit on the last one. The next day, Home asks for the corrections first; “Read as … · not what I wrote” accepts an answer the app misread.
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
