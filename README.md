# ComeOnMath

Kumon-style arithmetic practice as an installable web app for one child on a stylus tablet. The full design is in `ComeOnMath Build Spec.md`.

## Where the build is

**Build step 1 is implemented and waiting for its measurement.** Step 1 is the stroke capture and digit recogniser: one answer box, palm rejection, a $P point-cloud recogniser fed by a calibration game, and a 100-digit check screen that reports accuracy.

The acceptance criterion is at least 95 % of 100 digits written by the child on the tablet read correctly. That number can only come from her hand. Nothing from step 2 onwards is started until it is reported. Below 90 %: stop and report before building anything else.

## Running it

Node 22 or newer.

```
npm install
npm run dev        # dev server on the LAN
npm test           # unit tests for ink/ and db/
npm run build      # type-check and production build
```

## Testing on the tablet

1. Put the tablet on the same Wi-Fi as this Mac.
2. Run `npm run dev`. It prints a `Network:` URL such as `http://192.168.70.116:5173/` (the address depends on the Mac's current IP).
3. Open that URL in the tablet browser (Huawei Browser on the MatePad, Safari on an iPad). Use the pencil, not a finger: fingers are deliberately ignored inside answer boxes.
4. Run the three screens in this order:
   - **Teach the app your handwriting**: 30 prompts, each digit three times. Every sample is saved the moment Next is tapped, so stopping part-way loses nothing. Running it on two or three separate days gives the recogniser 6 to 9 samples per digit, which is where it should be.
   - **Try it**: a sanity check. Write a digit, lift the pencil, read what the app thought. “Confident” means the runner-up was well behind.
   - **Handwriting check**: 100 prompts, no feedback until the end. The end screen shows “N of 100 read correctly”, how many were not read at all, how many were not confident, and which digits were confused with which.
5. Report back the line “N of 100 read correctly” plus the confusion list. During the check, Stop asks for a second tap before leaving, because leaving discards the run. “Show results” reveals the full JSON; “Copy results” only works over HTTPS, so over the LAN use Show results and photograph or transcribe it.

If the pencil does not draw in a box at all, the browser is probably reporting it as a finger (`pointerType: "touch"`), which the box ignores on purpose. Report that before anything else; it changes the capture design, not the recogniser.

Templates live in the tablet browser’s IndexedDB. Clearing site data clears them, and the check screen will ask for calibration again.

## Layout

```
src/ink/        capture.ts     pointer samples → strokes, palm rejection
                normalise.ts   $P resample, scale, translate
                recogniser.ts  $P cloud distance, recognise()
                templates.ts   active template set
                sequence.ts    prompt order for calibration and the check
                check.ts       check summary
src/db/         schema.ts, repo.ts   IndexedDB v1, templates store, append-only
src/engine/     config.ts      every tunable constant
src/ui/         tokens.css, AnswerBox.tsx
src/screens/    Calibrate, TryBox, RecogniserCheck
tests/          unit tests for the modules above
```
