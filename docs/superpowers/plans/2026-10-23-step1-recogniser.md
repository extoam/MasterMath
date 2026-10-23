# ComeOnMath Step 1: Stroke Capture and Recogniser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Vite/React/TypeScript app with one stylus answer box, palm rejection, a $P digit recogniser fed by a calibration game, and a 100-digit check screen that reports measured accuracy, so step 1's acceptance criterion (≥ 95 % on 100 digits written by the child) can be measured on the tablet.

**Architecture:** `src/ink/` is framework-free TypeScript: `capture.ts` turns pointer samples into strokes, `normalise.ts` turns strokes into a 32-point $P cloud, `recogniser.ts` scores a cloud against per-digit templates, `templates.ts` holds the active template set. Raw strokes (not normalised clouds) are what gets persisted, so a later swap to a TF.js model is contained to `recogniser.ts`. `src/db/` is `idb` schema v1 with a single append-only `templates` store; later steps add the other seven stores in v2. Screens are thin React over these modules.

**Tech Stack:** Vite, React 18, TypeScript strict, `idb`, Vitest, `fake-indexeddb` (dev only, for repo tests). `vite-plugin-pwa` is deferred to step 6.

**Spec:** `ComeOnMath Build Spec.md` (repo root). This plan implements the section "Handwriting input" and build-order step 1. It stops before step 2.

## Global Constraints

- Dependencies: only `react`, `react-dom`, `idb`, `vite-plugin-pwa` and dev tooling. `fake-indexeddb` is dev tooling.
- TypeScript strict mode. Unit tests for `ink/` land before the screens that depend on them.
- Every tunable lives in `src/engine/config.ts`. Nothing numeric is inlined where it is used.
- No UI component library. Plain CSS with tokens in `src/ui/tokens.css`.
- No backend, no network calls, no analytics, no auth.
- No visible timer, no sounds, no mascots, no encouragement text mid-task.
- Answer boxes are roughly 80 by 100 CSS pixels with a faint baseline. `touch-action: none` on the canvas. `pointerType: "touch"` rejected inside boxes.
- Strokes are vector point sequences `{x, y, t, pressure}`, never bitmaps.
- Recogniser: $P Point-Cloud Recognizer, 32 resampled points, uniform scale, centroid at origin, 5 to 10 templates per digit.
- Nothing is ever deleted from IndexedDB. The per-digit template cap limits the *active* set, not the stored rows.
- Typographic punctuation (’ “ ” …) in all text the child reads.
- Build order is strict: do not start step 2 until the measured accuracy is reported.

## Review Focus

1. A palm `touch` pointer lands while a pen stroke is in progress: the pen stroke must continue uninterrupted and the touch must add no points. (Test in Task 4.)
2. A tap or a tiny accidental mark in the box: the recogniser must return `null`, never a confident random digit, and the box must count as empty. (Test in Task 3.)
3. The pen leaves the box mid-stroke: points outside the box bounds are kept, not clipped, and the stroke ends on `pointerup` wherever it happens. (Test in Task 4.)
4. The browser fires `pointercancel` (system gesture, palm-rejection firmware): the in-progress stroke is discarded, earlier strokes are kept. (Test in Task 4.)
5. Calibration never collected a digit, or the page reloaded mid-calibration: every sample is persisted the moment it is accepted, and the check screen refuses to start while any digit is below the template minimum. (Tests in Task 5.)

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `.gitignore`
- Create: `src/main.tsx`, `src/app/App.tsx`, `src/ui/tokens.css`, `src/engine/config.ts`, `src/ink/types.ts`
- Create: `tests/config.test.ts`

**Interfaces:**
- Produces: `config` object from `src/engine/config.ts`; types from `src/ink/types.ts`:

```ts
export interface InkPoint { x: number; y: number; t: number; pressure: number }
export type Stroke = InkPoint[];
export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export const DIGITS: readonly Digit[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
export interface CloudPoint { x: number; y: number; strokeId: number }
export type PointCloud = CloudPoint[];
```

- [ ] **Step 1: Initialise git and write `.gitignore`** (`node_modules/`, `dist/`, `dev-dist/`, `.DS_Store`)

- [ ] **Step 2: Write `package.json`** with scripts `dev` (`vite --host`), `build` (`tsc --noEmit && vite build`), `preview`, `test` (`vitest run`), `test:watch`; dependencies `react@^18.3`, `react-dom@^18.3`, `idb@^8`; devDependencies `vite`, `@vitejs/plugin-react`, `typescript@^5`, `vitest`, `fake-indexeddb`, `@types/react`, `@types/react-dom`. Run `npm install`.

- [ ] **Step 3: Write `tsconfig.json`** (strict, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `jsx: react-jsx`, `moduleResolution: bundler`, `include: ["src", "tests"]`) and `vite.config.ts` with the React plugin, `server.host = true`, and `test.include = ["tests/**/*.test.ts"]`.

- [ ] **Step 4: Write `src/engine/config.ts`**

```ts
export const config = {
  ink: {
    boxWidthPx: 80,
    boxHeightPx: 100,
    strokeWidthPx: 3,
    acceptedPointerTypes: ['pen', 'mouse'] as readonly string[], // 'touch' is a resting palm
    resamplePoints: 32,
    minInkPathLengthPx: 8,
    confidentMarginRatio: 1.2,
    maxTemplatesPerDigit: 10,
    minTemplatesPerDigit: 3,
    calibrationRepsPerDigit: 3,
    checkItemsPerDigit: 10,
  },
} as const;
```

`mouse` is accepted so the app can be driven on a desktop during development. Mark this in a comment; it is my call, not the spec's.

- [ ] **Step 5: Write `tests/config.test.ts`** asserting `config.ink.boxWidthPx === 80`, `boxHeightPx === 100`, `resamplePoints === 32`, `acceptedPointerTypes` does not include `'touch'`. Run `npm test`. Expected: PASS.

- [ ] **Step 6: Write `src/ui/tokens.css`** (colour tokens: paper, ink, rule, muted, mark-amber, mark-green; type scale with a 48 px problem size and 72 px prompt-digit size; spacing scale; `--box-w: 80px; --box-h: 100px`), `index.html` (viewport `width=device-width, initial-scale=1, viewport-fit=cover`, title “ComeOnMath”), `src/main.tsx`, and `src/app/App.tsx` rendering the heading “ComeOnMath”. Also `src/ink/types.ts` as above.

- [ ] **Step 7: Verify** `npm run build` succeeds and `npm run dev` serves on the LAN (output lists a `Network:` URL).

- [ ] **Step 8: Commit** `chore: scaffold Vite + React + TypeScript project`

---

### Task 2: Normalisation (`ink/normalise.ts`)

**Files:**
- Create: `src/ink/normalise.ts`
- Test: `tests/normalise.test.ts`

**Interfaces:**
- Consumes: `Stroke`, `CloudPoint`, `PointCloud` from `src/ink/types.ts`.
- Produces:

```ts
export function pathLength(strokes: Stroke[]): number;           // sum of segment lengths within strokes, never across
export function toCloud(strokes: Stroke[], n: number): PointCloud; // resample(n) → scale → translateToOrigin
export function resample(strokes: Stroke[], n: number): PointCloud;
export function scale(cloud: PointCloud): PointCloud;              // uniform, by max(width, height); size 0 → unchanged
export function translateToOrigin(cloud: PointCloud): PointCloud;  // centroid to (0, 0)
```

- [ ] **Step 1: Write failing tests** in `tests/normalise.test.ts` with a helper `line(x0, y0, x1, y1, k)` producing a `Stroke` of `k` evenly spaced points:
  - `pathLength` of a single 0→100 horizontal stroke is 100; of two separate strokes `[0→100]` and `[200→300]` is 200 (gap excluded).
  - `resample` of a 3-point horizontal stroke to 32 returns exactly 32 points, first at x = 0, last at x = 100, all with `strokeId` 0, and consecutive x spacing within 1e-6 of 100/31.
  - `resample` of two strokes returns 32 points and no point has x strictly between 100 and 200 (no interpolation across the gap); strokeIds are non-decreasing.
  - `resample` of a single-point stroke returns 32 copies of that point.
  - `scale` of a 50-wide, 100-tall cloud leaves max extent 1 in y and 0.5 in x (uniform scale, aspect preserved).
  - `scale` of a cloud with all points identical returns the points unchanged (no NaN).
  - `translateToOrigin` leaves centroid within 1e-9 of (0, 0).
  - `toCloud` of the same shape drawn at (0,0) size 40 and at (300, 500) size 90 yields clouds whose point-wise distance sums to < 1e-6.
  - `toCloud` of a negative-coordinate stroke (pen left the box) works and has no NaN.

- [ ] **Step 2: Run** `npm test -- normalise`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** the five functions. `resample` is the $P algorithm: interval `I = pathLength / (n − 1)`, walk points, interpolate only between points of the same stroke, insert interpolated points, pad to `n` with the last point if short, and if `pathLength` is 0 return `n` copies of the first point. Do not mutate the input.

- [ ] **Step 4: Run** `npm test -- normalise`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(ink): $P resample, scale and translate`

---

### Task 3: $P recogniser (`ink/recogniser.ts`)

**Files:**
- Create: `src/ink/recogniser.ts`
- Test: `tests/recogniser.test.ts`, `tests/helpers/shapes.ts`

**Interfaces:**
- Consumes: `toCloud`, `pathLength` from Task 2; `Digit`, `Stroke`, `PointCloud`.
- Produces:

```ts
export interface Candidate { digit: Digit; cloud: PointCloud }
export interface Recognition {
  digit: Digit;
  score: number;            // $P cloud distance, lower is better
  runnerUp: Digit | null;   // best other digit
  runnerUpScore: number | null;
  confident: boolean;       // runnerUpScore / score >= confidentMarginRatio
}
export interface RecogniserOptions { n: number; minPathLength: number; confidentMarginRatio: number }
export function cloudDistance(a: PointCloud, b: PointCloud): number; // greedy $P, symmetric min over start offsets
export function recognise(strokes: Stroke[], candidates: Candidate[], opts: RecogniserOptions): Recognition | null;
```

- [ ] **Step 1: Write `tests/helpers/shapes.ts`**: synthetic stroke generators `one()`, `zero()`, `seven()`, `four()`, `three()` built from line and arc segments in an 80×100 box, each accepting `{ dx?, dy?, s?, jitter?, seed? }` for translation, scale and deterministic jitter. Enough variety to separate 0/1/3/4/7.

- [ ] **Step 2: Write failing tests** in `tests/recogniser.test.ts`. Use `const opts = { n: 32, minPathLength: 8, confidentMarginRatio: 1.2 }` and a candidate set with 3 templates per shape.
  - `recognise(one({dx: 10, s: 0.8, jitter: 2}), cands, opts)?.digit` is 1; likewise 0, 7, 4, 3 for their shapes.
  - A translated and scaled `seven` still recognises as 7.
  - `recognise([], cands, opts)` is `null`.
  - `recognise([[{x:40,y:50,t:0,pressure:0.5}]], cands, opts)` (a tap) is `null`. (Review Focus 2)
  - A 3-pixel scribble (path length < 8) is `null`. (Review Focus 2)
  - `recognise(one(), [], opts)` is `null`.
  - With candidates for digit 1 only, result has `digit: 1`, `runnerUp: null`, `confident: false`.
  - With the same cloud registered as both 1 and 7, `confident` is false and `runnerUpScore / score` is 1.
  - `cloudDistance(c, c)` is 0; `cloudDistance(a, b)` equals `cloudDistance(b, a)`.
  - Synthetic accuracy: 20 jittered samples per shape across the five shapes all recognise correctly (100/100).

- [ ] **Step 3: Run** `npm test -- recogniser`. Expected: FAIL.

- [ ] **Step 4: Implement** `cloudDistance` and `recognise`. Greedy cloud matching per the $P paper:

```
greedy(a, b, n): step = floor(n^0.5); min over start i in 0, step, 2·step… of
  min(distance(a, b, i), distance(b, a, i))
distance(p, q, start): matched[] = false; sum = 0; i = start
  repeat: pick unmatched j minimising |p[i] − q[j]|; mark; weight = 1 − ((i − start + n) mod n) / n;
          sum += weight · d; i = (i + 1) mod n   until i == start
```

`recognise`: return `null` if `strokes` is empty, `pathLength(strokes) < minPathLength`, or `candidates` is empty. Otherwise `toCloud`, take the minimum distance per digit, best digit wins, runner-up is the best other digit.

- [ ] **Step 5: Run** `npm test -- recogniser`. Expected: PASS. Note the wall time of the 100-sample test; it should be well under a second.

- [ ] **Step 6: Commit** `feat(ink): $P point-cloud recogniser`

---

### Task 4: Stroke capture (`ink/capture.ts`)

**Files:**
- Create: `src/ink/capture.ts`
- Test: `tests/capture.test.ts`

**Interfaces:**
- Consumes: `Stroke`, `InkPoint`.
- Produces:

```ts
export interface PointerSample { pointerId: number; pointerType: string; x: number; y: number; t: number; pressure: number }
export interface RecorderOptions { acceptedPointerTypes: readonly string[]; onChange?: (strokes: Stroke[]) => void }
export class StrokeRecorder {
  constructor(opts: RecorderOptions);
  readonly strokes: Stroke[];                 // completed strokes only
  readonly current: Stroke | null;            // in-progress stroke
  firstStrokeAt: number | null;               // t of the first accepted down
  down(s: PointerSample): boolean;            // true if accepted
  move(s: PointerSample): void;
  up(s: PointerSample): void;
  cancel(s: PointerSample): void;
  clear(): void;
}
export function attachPointerCapture(el: HTMLElement, recorder: StrokeRecorder, now?: () => number): () => void; // returns detach
```

`attachPointerCapture` listens for `pointerdown/move/up/cancel`, calls `el.setPointerCapture`, maps coordinates to CSS px relative to `el`’s bounding rect, uses `getCoalescedEvents()` on move when present, and `preventDefault()`s accepted events.

- [ ] **Step 1: Write failing tests** in `tests/capture.test.ts` with a helper `pen(x, y, t, id = 1)` and `touch(x, y, t, id = 2)`:
  - `down(touch)` returns false, `current` stays null, `firstStrokeAt` stays null.
  - `down(pen)` returns true; `firstStrokeAt` equals its `t`; a second `down(pen)` later does not change `firstStrokeAt`.
  - `down(pen) → move(pen) → up(pen)` yields one stroke of 3 points carrying `pressure`.
  - `move` with no active stroke adds nothing.
  - While pen id 1 is down, `down(touch id 2)` and `move(touch id 2)` add no points and the subsequent `up(pen id 1)` still completes the pen stroke with its own points only. (Review Focus 1)
  - While pen id 1 is down, `down(pen id 3)` is ignored (returns false) so one pointer owns the stroke.
  - Points with negative or out-of-box coordinates are recorded as-is. (Review Focus 3)
  - `cancel` discards `current` but leaves earlier `strokes` intact. (Review Focus 4)
  - `clear()` empties `strokes`, nulls `current` and `firstStrokeAt`.
  - `onChange` fires on down, move, up and clear with the completed strokes plus current.

- [ ] **Step 2: Run** `npm test -- capture`. Expected: FAIL.

- [ ] **Step 3: Implement** `StrokeRecorder` and `attachPointerCapture`. Keep the DOM binding to event mapping only; all decisions live in the recorder.

- [ ] **Step 4: Run** `npm test -- capture`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(ink): pointer stroke recorder with palm rejection`

---

### Task 5: Template store and persistence (`ink/templates.ts`, `db/`)

**Files:**
- Create: `src/ink/templates.ts`, `src/db/schema.ts`, `src/db/repo.ts`
- Test: `tests/templates.test.ts`, `tests/repo.test.ts`

**Interfaces:**
- Consumes: `Candidate` from Task 3; `toCloud` from Task 2; `Digit`, `Stroke`, `DIGITS`.
- Produces:

```ts
// src/ink/templates.ts
export interface Template { id: string; digit: Digit; strokes: Stroke[]; createdAt: number; source: 'calibration' | 'override' }
export class TemplateStore {
  constructor(opts: { maxPerDigit: number; minPerDigit: number; n: number });
  load(templates: Template[]): void;            // replaces contents
  add(t: Template): void;
  countPerDigit(): Record<Digit, number>;        // counts of the ACTIVE set (capped)
  missingDigits(): Digit[];                      // digits below minPerDigit
  isReady(): boolean;                            // missingDigits().length === 0
  candidates(): Candidate[];                     // newest maxPerDigit per digit, clouds precomputed once
}

// src/db/schema.ts
export interface ComeOnMathDB extends DBSchema { templates: { key: string; value: Template; indexes: { 'by-digit': number } } }
export const DB_NAME = 'comeonmath'; export const DB_VERSION = 1;
export function openDb(): Promise<IDBPDatabase<ComeOnMathDB>>;

// src/db/repo.ts
export async function saveTemplate(t: Template): Promise<void>;
export async function loadTemplates(): Promise<Template[]>;      // all rows, oldest first
export function newId(): string;                                  // crypto.randomUUID()
```

- [ ] **Step 1: Write failing tests** in `tests/templates.test.ts`:
  - After adding 12 templates for digit 7 with increasing `createdAt`, `countPerDigit()[7]` is 10 and `candidates()` for 7 contains the 10 newest (by `createdAt`).
  - `missingDigits()` on an empty store is all ten digits; after 3 samples each for 0–8, it is `[9]`; `isReady()` false; after 3 for 9, true. (Review Focus 5)
  - `candidates()` returns clouds of length 32 and does not recompute on repeated calls (same array identity when nothing changed).
  - `load()` replaces previous contents.

- [ ] **Step 2: Write failing tests** in `tests/repo.test.ts` with `import 'fake-indexeddb/auto'` at the top and a fresh DB name per test (delete the database in `beforeEach` via `indexedDB.deleteDatabase`):
  - `saveTemplate` then `loadTemplates` round-trips strokes, digit, source and createdAt.
  - Saving two templates and loading returns both, ordered oldest first: rows are appended, never replaced. (Review Focus 5)
  - `newId()` returns distinct strings on successive calls.

- [ ] **Step 3: Run** `npm test -- templates repo`. Expected: FAIL.

- [ ] **Step 4: Implement** `TemplateStore`, `schema.ts` (`openDB` with an `upgrade` that creates `templates` keyed by `id` with index `by-digit` on `digit`), and `repo.ts`.

- [ ] **Step 5: Run** `npm test -- templates repo`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(ink,db): template store and IndexedDB persistence`

---

### Task 6: AnswerBox component and Try screen

**Files:**
- Create: `src/ui/AnswerBox.tsx`, `src/ui/AnswerBox.css`, `src/screens/TryBox.tsx`
- Modify: `src/app/App.tsx` (state-based navigation: `home | try | calibrate | check`)

**Interfaces:**
- Consumes: `StrokeRecorder`, `attachPointerCapture` (Task 4); `config.ink`; `recognise` and `TemplateStore` (Tasks 3, 5).
- Produces:

```tsx
export interface AnswerBoxHandle { clear(): void; strokes(): Stroke[]; firstStrokeAt(): number | null }
export interface AnswerBoxProps { onInkChange?: (strokes: Stroke[]) => void; disabled?: boolean }
export const AnswerBox: React.ForwardRefExoticComponent<AnswerBoxProps & React.RefAttributes<AnswerBoxHandle>>;
```

- [ ] **Step 1: Implement `AnswerBox`**: a `<canvas>` sized from `config.ink.boxWidthPx/boxHeightPx` × `devicePixelRatio`, `touch-action: none`, faint baseline at 80 % height, ink drawn with `strokeWidthPx`, round caps and joins. The recorder is created once per mount; `onInkChange` receives completed strokes plus the current stroke; the canvas redraws from the recorder on each change. `disabled` detaches the pointer binding.

- [ ] **Step 2: Implement `TryBox` screen**: one `AnswerBox`, a readout of `recognise(...)` (“Read as 7 · confident” or “Read as 7, could be 1” or “Nothing yet”), a Clear button, and a line showing templates per digit. It loads templates through `loadTemplates()` into a `TemplateStore` on mount. Heading “Try it”.

- [ ] **Step 3: Wire `App.tsx`**: home shows three buttons: “Teach the app your handwriting”, “Try it”, “Handwriting check”, and a back control on each screen. Create a shared `TemplateStore` in `App` and pass it down, so screens see the same active set.

- [ ] **Step 4: Verify in a browser** with the dev server: draw a 7 with the mouse; the readout updates on pen-up; a touch gesture (device emulation) inside the box does not draw; the page does not scroll while drawing. Run `npm run build`. Expected: no type errors.

- [ ] **Step 5: Commit** `feat(ui): AnswerBox canvas and Try screen`

---

### Task 7: Calibration game (`screens/Calibrate.tsx`)

**Files:**
- Create: `src/screens/Calibrate.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `AnswerBox`, `TemplateStore`, `saveTemplate`, `newId`, `config.ink.calibrationRepsPerDigit`.

- [ ] **Step 1: Implement `Calibrate`**: heading “Teach the app your handwriting”, a prompt digit at 72 px, an `AnswerBox`, a “Next” button (disabled until the box has ink), and a plain counter “4 of 30”. The sequence is `calibrationRepsPerDigit` passes over 0–9, shuffled within each pass. On Next: build a `Template` with `source: 'calibration'`, call `saveTemplate` **then** `store.add` (persist before advancing, Review Focus 5), clear the box, advance. On completion show “Done. The app knows your handwriting a little better now.” and a button back to home. Copy uses typographic punctuation.

- [ ] **Step 2: Verify in a browser**: complete the full 30-sample run with the mouse, reload the page, open Try it, confirm “templates per digit” shows 3 each and a drawn digit is read.

- [ ] **Step 3: Commit** `feat(screens): calibration game`

---

### Task 8: Handwriting check (`screens/RecogniserCheck.tsx`)

**Files:**
- Create: `src/screens/RecogniserCheck.tsx`, `src/ink/check.ts`
- Test: `tests/check.test.ts`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `AnswerBox`, `TemplateStore`, `recognise`, `config.ink.checkItemsPerDigit`.
- Produces (`src/ink/check.ts`, pure):

```ts
export interface CheckItem { prompt: Digit; read: Digit | null; confident: boolean }
export interface CheckSummary { total: number; correct: number; accuracyPct: number; unread: number; notConfident: number; confusions: Array<{ prompt: Digit; read: Digit; count: number }> }
export function checkSequence(itemsPerDigit: number, random: () => number): Digit[]; // shuffled, itemsPerDigit of each
export function summarise(items: CheckItem[]): CheckSummary;
```

- [ ] **Step 1: Write failing tests** in `tests/check.test.ts`:
  - `checkSequence(10, seeded)` has length 100 and exactly 10 of each digit.
  - `summarise` of 97 correct, 2 wrong (7→1, 7→1), 1 unread gives `accuracyPct: 97`, `unread: 1`, `confusions: [{prompt: 7, read: 1, count: 2}]` sorted by count descending.
  - `summarise([])` gives `total: 0, accuracyPct: 0` with no division error.

- [ ] **Step 2: Run** `npm test -- check`. Expected: FAIL.

- [ ] **Step 3: Implement `check.ts`**. Unread items count as incorrect.

- [ ] **Step 4: Run** `npm test -- check`. Expected: PASS.

- [ ] **Step 5: Implement `RecogniserCheck`**: if `store.isReady()` is false, show “Teach the app each number at least 3 times first.” with the missing digits and a button to Calibrate. Otherwise heading “Handwriting check”, prompt digit, `AnswerBox`, “Next” (disabled without ink), counter “12 of 100”. No per-item feedback. On Next: `recognise` against `store.candidates()`, push a `CheckItem`, clear, advance. At the end show the `CheckSummary` as plain facts: “97 of 100 read correctly”, unread count, not-confident count, and the confusion list, plus a “Copy results” button that writes the JSON of all items to the clipboard. Nothing is persisted; this screen measures, it does not train.

- [ ] **Step 6: Verify in a browser** end to end with a mouse on the desktop, then `npm run build` and `npm test`. Expected: all tests pass, build clean.

- [ ] **Step 7: Commit** `feat(screens): 100-digit handwriting check`

---

### Task 9: Tablet handoff notes

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**: what step 1 is, how to run the dev server on the LAN and open it on the tablet (`npm run dev`, then the printed `Network:` URL in the tablet browser), the order to run (Teach × 1 full pass, then Try it to sanity-check, then Handwriting check), and what number to report back (accuracy from the check screen; stop and report if below 90 %).

- [ ] **Step 2: Commit** `docs: step 1 tablet test instructions`

- [ ] **Step 3: Report** to the human: step 1 is built but its acceptance criterion needs 100 digits from the child on the Huawei tablet. Give the exact run instructions and stop. Do not begin step 2.
