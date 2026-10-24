# MasterMath Step 2: Worksheet and Corrections Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One hard-coded 10-item multiplication page that runs the full Kumon cycle (write, submit, mark, correct, re-mark, clean) with correction rounds, per-item timing and idle-paused active time held in memory, plus the three controls asked for on 2026-10-24: a live timer top-right, undo and rubber top-left, and a Submit button at the end.

**Architecture:** `src/engine/worksheet.ts` is a pure page state machine (start, mark a round, accept an override) and `src/engine/activeClock.ts` a pure idle-aware stopwatch; both are unit-tested and know nothing about React or the recogniser. `src/ink/capture.ts` gains undo and a stroke eraser inside `StrokeRecorder`, so the tools are tested without a DOM. `src/screens/Worksheet.tsx` is a thin controller over those modules: it owns the current phase (writing → marked → next round or complete), reads each `AnswerBox` through the recogniser at Submit, and keeps everything in memory. Persistence is step 3.

**Tech Stack:** Vite, React 18, TypeScript strict, Vitest. No new dependencies.

**Spec:** `MasterMath Build Spec.md` (repo root), sections "Page and assessment mechanics", "Handwriting input" (escape hatch), "Daily homework and timing" (active time, idle pause), "Screens" (Worksheet, Corrections, Page complete), build-order step 2. Plus the user's request of 2026-10-24: timer top-right, undo + rubber top-left, submit at the end, like the Kumon Connect app.

## Decisions taken here (not in the spec)

- **Visible timer.** The spec says "never show a timer". The user asked for one on 2026-10-24. It is built behind `config.worksheet.showTimer` and shows page *active* time (idle-paused), so the live number and the Page complete number agree.
- **Step 2 starts before step 1's measurement was reported**, on the user's instruction of 2026-10-24.
- **Submit is enabled only when every answer box on the page has ink** and no stroke is in progress, so a half-written page cannot be marked by accident.
- **Marked view.** After Submit the page stays visible with its ink: wrong items get a circle, "Read as 54" underneath, and a "That’s not what I wrote" control. Only after "Try these again" are the wrong items shown alone with cleared boxes. Without this view the override control has nothing to be tapped on.
- **Override** accepts the item as correct and labels the strokes with the expected digits, per the spec ("accepts her reading, logs the stroke data with the corrected label, and does not count the item wrong").
- **Undo** removes the most recently finished stroke anywhere on the page (found by stroke timestamp). It does not restore erased strokes.
- **Rubber** is a toggle tool: while on, the pen removes any stroke it passes over (within `config.ink.eraserRadiusPx`). It stays on until toggled off.
- **Idle rule.** Each gap between pointer events counts at most `idleTimeoutMs` toward active time.
- **Answer boxes equal the digit count of the answer** (spec: "A two-digit answer gets two separate boxes"), accepting that this reveals the digit count.

## Global Constraints

- Dependencies: only `react`, `react-dom`, `idb`, `vite-plugin-pwa` and dev tooling.
- TypeScript strict mode. Unit tests for `engine/` and `ink/` land before the screens that depend on them.
- Every tunable lives in `src/engine/config.ts`. Nothing numeric is inlined where it is used.
- No UI component library. Plain CSS with tokens in `src/ui/tokens.css`.
- No backend, no network calls, no analytics, no auth.
- No visible countdown, no sounds, no mascots, no encouragement text mid-page, no progress bar. Wrong items marked with a circle, never a cross. Answers never revealed.
- `strokes`, `items`, `pages`, `sessions` are append-only (in memory this step: records are never mutated, new objects are returned).
- Typographic punctuation (’ “ ” × − ÷) in all text the child reads.
- Spec config names: `itemsPerPage: 10`, `idleTimeoutMs: 30_000`.

## Review Focus

1. The child submits with every box filled but one box is unreadable (a scribble): the item is wrong, circled, "Read as" shows the readable part with "?", and the corrections round asks for it again. (Test in Task 3: unread box → `given: null`, `correct: false`.)
2. She writes a correct answer the recogniser misreads, taps "That’s not what I wrote": the item is accepted, not counted wrong, the strokes carry the expected digits as `trueLabel`, and if it was the last wrong item the page is clean with the right correction-round count. (Tests in Task 3.)
3. She walks away for five minutes mid-page: active time grows by at most 30 s, the timer visibly stops, and resumes on the next pen touch. (Tests in Task 2.)
4. The rubber passes between two sampled points of a stroke without touching either: the stroke is still erased (segment test, not point test); a palm (`touch`) in rubber mode erases nothing. (Tests in Task 4.)
5. Undo after she has written in two different boxes removes the stroke written last, not the last box’s stroke; undo with nothing written is a no-op. (Tests in Task 4 for the recorder; Task 6 verifies page-level choice in the browser.)

---

### Task 1: Config and the hard-coded page

**Files:**
- Modify: `src/engine/config.ts`
- Create: `src/seed/demoPage.ts`
- Test: `tests/config.test.ts`, `tests/demoPage.test.ts`

**Interfaces:**
- Produces:

```ts
// config.ts additions
ink: { ..., /** Rubber: strokes within this many CSS px of the pen are removed. */ eraserRadiusPx: 12 }
worksheet: {
  itemsPerPage: 10,
  idleTimeoutMs: 30_000,
  /** Live active-time display top-right. The spec says no visible timer; the user asked for one on 2026-10-24. */
  showTimer: true as boolean,
  timerTickMs: 500,
}

// src/seed/demoPage.ts
import type { Fact } from '../engine/worksheet';
export const demoPage: readonly Fact[];   // 10 multiplication facts from tables 6 and 7, one single-digit answer (6 × 1)
```

- [ ] **Step 1: Write failing tests.** In `tests/config.test.ts` add: `config.worksheet.itemsPerPage === 10`, `config.worksheet.idleTimeoutMs === 30_000`, `config.ink.eraserRadiusPx > 0`, `config.worksheet.timerTickMs > 0`. Create `tests/demoPage.test.ts`: `demoPage` has `config.worksheet.itemsPerPage` facts; every `op === '×'`; every `answer === a * b`; at least one answer below 10 and at least one at or above 10.
- [ ] **Step 2: Run** `npx vitest run tests/config.test.ts tests/demoPage.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add the config block. Create `src/engine/worksheet.ts` with only the `Fact` and `Op` types for now (Task 3 fills it in), and `src/seed/demoPage.ts` with facts `6×1, 7×8, 6×7, 7×3, 6×9, 7×6, 6×4, 7×9, 6×8, 7×5`.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): worksheet config and hard-coded demo page`

---

### Task 2: Active clock (`engine/activeClock.ts`)

**Files:**
- Create: `src/engine/activeClock.ts`
- Test: `tests/activeClock.test.ts`

**Interfaces:**
- Produces:

```ts
export class ActiveClock {
  constructor(opts: { idleTimeoutMs: number });
  start(t: number): void;              // first call wins; later calls ignored
  touch(t: number): void;              // a pointer event at t; ignored before start or after stop
  activeMs(now: number): number;       // accumulated + min(now − lastEvent, idleTimeoutMs); frozen after stop
  stop(t: number): number;             // final activeMs(t); idempotent
}
```

- [ ] **Step 1: Write failing tests** (`idleTimeoutMs: 30_000`):
  - `activeMs` before start is 0.
  - continuous activity counts in full: start(0), touch every 1000 up to 10_000 → `activeMs(10_000)` is 10_000.
  - a long gap counts at most the idle timeout: start(0), touch(60_000) → `activeMs(60_000)` is 30_000.
  - the live tail is capped: start(0), `activeMs(5_000)` is 5_000, `activeMs(45_000)` is 30_000.
  - activity after an idle gap resumes counting: start(0), touch(60_000), touch(61_000) → `activeMs(61_000)` is 31_000.
  - stop freezes: start(0), touch(1_000), `stop(2_000)` returns 2_000, `activeMs(99_999)` is 2_000, `touch(3_000)` then `activeMs(4_000)` still 2_000.
- [ ] **Step 2: Run** `npx vitest run tests/activeClock.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `ActiveClock` in `src/engine/activeClock.ts`. Keep `accumulated` and `lastEventAt`; `touch` adds `min(t − lastEventAt, idleTimeoutMs)`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): idle-aware active clock`

---

### Task 3: Page state machine (`engine/worksheet.ts`)

**Files:**
- Modify: `src/engine/worksheet.ts`
- Test: `tests/worksheet.test.ts`

**Interfaces:**
- Consumes: `Digit`, `Stroke` from `src/ink/types.ts`.
- Produces:

```ts
export type Op = '+' | '−' | '×' | '÷';
export interface Fact { op: Op; a: number; b: number; answer: number }
export interface BoxReading { digitIndex: number; read: Digit | null; confident: boolean; strokes: Stroke[]; trueLabel: Digit | null }
export interface ItemRecord {
  position: number; round: number;
  firstStrokeMs: number | null;        // retrieval latency from round start; null if never touched
  submittedMs: number;
  given: number | null; correct: boolean; override: boolean;
  boxes: BoxReading[];
}
export interface RoundRecord { round: number; items: ItemRecord[] }
export interface PageState {
  facts: readonly Fact[];              // by position
  round: number;                       // round being written; 0 = first pass
  pending: number[];                   // positions still to answer in `round`
  rounds: RoundRecord[];               // marked rounds, oldest first
}
export interface RoundAnswer {
  position: number; firstStrokeMs: number | null; submittedMs: number;
  boxes: Array<{ read: Digit | null; confident: boolean; strokes: Stroke[] }>;
}
export function answerDigits(answer: number): Digit[];                    // 56 → [5, 6]
export function digitsToNumber(read: Array<Digit | null>): number | null; // any null → null
export function formatFact(f: Fact): string;                              // '7 × 8 ='
export function startPage(facts: readonly Fact[]): PageState;
export function markRound(state: PageState, answers: RoundAnswer[]): PageState; // throws unless answers cover exactly `pending`
export function acceptOverride(state: PageState, position: number): PageState;  // throws unless position is pending
export function isClean(state: PageState): boolean;                       // rounds.length > 0 && pending.length === 0
export function correctionRounds(state: PageState): number;               // rounds.length − 1, or 0 before any marking
```

- [ ] **Step 1: Write failing tests** with a `facts` fixture of 10 facts and a helper `answer(position, digits: Array<Digit|null>, confident = true)` building a `RoundAnswer` with `firstStrokeMs: 500`, `submittedMs: 4_000`, one stroke per box:
  - `answerDigits(56)` is `[5, 6]`; `answerDigits(6)` is `[6]`; `answerDigits(144)` is `[1, 4, 4]`.
  - `digitsToNumber([5, 6])` is 56; `digitsToNumber([5, null])` is null; `digitsToNumber([1, 0])` is 10.
  - `formatFact({ op: '×', a: 7, b: 8, answer: 56 })` is `'7 × 8 ='`.
  - `startPage` gives `round: 0`, `pending: [0..9]`, `rounds: []`, `isClean` false, `correctionRounds` 0.
  - marking the first pass with positions 3 and 7 wrong and position 5 unread (`[5, null]`): `rounds` has one record with 10 items; item 3 `correct: false`; item 5 `given: null`, `correct: false`; `pending` is `[3, 5, 7]`; `round` is 1; `isClean` false. (Review Focus 1)
  - marking everything correct: `pending` is `[]`, `isClean` true, `correctionRounds` 0.
  - a second round with the 3 pending answered and position 7 still wrong: `rounds.length` 2, `rounds[1].items.length` 3, `pending` `[7]`, `round` 2; then a third round correct → `isClean` true, `correctionRounds` 2.
  - `markRound` throws when an answer is missing for a pending position or given for a non-pending one.
  - `acceptOverride(state, 3)` after the first pass: `rounds[0].items[3]` has `correct: true`, `override: true`, every box `trueLabel` equal to `answerDigits(answer)[digitIndex]`; `pending` is `[5, 7]`. (Review Focus 2)
  - overriding the last pending item makes `isClean` true and `correctionRounds` stays 0 if it was the first pass. (Review Focus 2)
  - `acceptOverride` on a non-pending position throws.
  - `markRound` and `acceptOverride` return new objects and leave the input state and its records unchanged (deep-equal snapshot before and after).
- [ ] **Step 2: Run** `npx vitest run tests/worksheet.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the functions in `src/engine/worksheet.ts`. `markRound`: for each answer build an `ItemRecord` (`given = digitsToNumber(reads)`, `correct = given === fact.answer`, `trueLabel: null`); new `pending` = wrong positions in page order; `round + 1` only if any wrong.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): page state machine with corrections rounds and override`

---

### Task 4: Undo and rubber in the stroke recorder (`ink/capture.ts`)

**Files:**
- Modify: `src/ink/capture.ts`
- Test: `tests/capture.test.ts`

**Interfaces:**
- Produces:

```ts
export type Tool = 'pen' | 'eraser';
export interface RecorderOptions { acceptedPointerTypes: readonly string[]; eraserRadiusPx: number; onChange?: (strokes: Stroke[]) => void }
export class StrokeRecorder {
  // existing members unchanged, plus:
  undo(): boolean;                                   // removes the last completed stroke; false if none
  eraseNear(x: number, y: number, radius: number): number; // removes completed strokes with any segment within radius; returns count
  eraseDown(s: PointerSample): boolean;              // accepted types only, one pointer at a time, never sets firstStrokeAt
  eraseMove(s: PointerSample): void;
  eraseUp(s: PointerSample): void;
}
export interface CaptureOptions { now?: () => number; tool?: () => Tool }
export function attachPointerCapture(el: HTMLElement, recorder: StrokeRecorder, opts?: CaptureOptions): () => void;
```

- [ ] **Step 1: Write failing tests** (extend the `recorder()` helper with `eraserRadiusPx: 10`):
  - `undo` removes the last completed stroke and returns true; on an empty recorder returns false; `firstStrokeAt` is kept after undo.
  - `eraseNear(50, 55, 10)` removes a two-point stroke from (0, 50) to (100, 50) although neither endpoint is within 10 px (segment test); `eraseNear(50, 70, 10)` leaves it. (Review Focus 4)
  - `eraseNear` returns the number removed and leaves other strokes untouched.
  - `eraseDown(touch)` returns false and erases nothing. (Review Focus 4)
  - `eraseDown(pen)` → `eraseMove(pen)` along a path removes the strokes it crosses; a second pointer’s `eraseMove` during that is ignored; `eraseUp` releases so a later `eraseDown` works.
  - erasing never sets `firstStrokeAt` and never adds a stroke.
  - `onChange` fires on undo and on each erase that removed something.
- [ ] **Step 2: Run** `npx vitest run tests/capture.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Point-to-segment distance helper; `eraseNear` filters `strokes` in place. `attachPointerCapture` reads `opts.tool?.() ?? 'pen'` on each event and routes to `down/move/up` or `eraseDown/eraseMove/eraseUp`.
- [ ] **Step 4: Run** `npx vitest run`. Expected: all PASS (AnswerBox’s call site updated to the options object).
- [ ] **Step 5: Commit** `feat(ink): undo and rubber in the stroke recorder`

---

### Task 5: AnswerBox tool support and the problem row

**Files:**
- Modify: `src/ui/AnswerBox.tsx`, `src/ui/AnswerBox.css`
- Create: `src/ui/ProblemRow.tsx`, `src/ui/Worksheet.css`

**Interfaces:**
- Consumes: `Tool`, `attachPointerCapture(el, recorder, { tool })`, `config.ink.eraserRadiusPx`; `Fact`, `formatFact`, `answerDigits` from Task 3.
- Produces:

```tsx
// AnswerBox additions
export interface AnswerBoxHandle { clear(); strokes(); drawing(); firstStrokeAt(); undo(): boolean }
export interface AnswerBoxProps { onInkChange?; disabled?; tool?: Tool }   // tool defaults to 'pen'

// ProblemRow
export type Mark = 'wrong' | 'accepted' | null;
export interface ProblemRowProps {
  position: number; fact: Fact; tool: Tool; disabled: boolean;
  mark: Mark;                 // null while writing
  readAs: string | null;      // e.g. '54' or '5?' shown under a wrong item
  overrideProminent: boolean; // true when any box was not confident
  onOverride: (() => void) | null;
  boxRef: (digitIndex: number, handle: AnswerBoxHandle | null) => void;
  onInkChange: (digitIndex: number, strokes: Stroke[], drawing: boolean) => void;
}
export function ProblemRow(props: ProblemRowProps): JSX.Element;
```

- [ ] **Step 1: Extend `AnswerBox`**: pass `eraserRadiusPx` to the recorder, keep `tool` in a ref read by `attachPointerCapture`’s `tool` callback, add `undo` to the handle, set `data-tool` on the canvas (CSS cursor `cell` for the eraser).
- [ ] **Step 2: Write `ProblemRow`**: `<div className="problem" data-position data-mark>` with `<span className="fact">{formatFact(fact)}</span>`, a `<div className="answer">` holding one `AnswerBox` per `answerDigits(fact.answer).length`, and when `mark === 'wrong'` a muted line `Read as {readAs}` and a button “That’s not what I wrote” (`className="primary"` when `overrideProminent`); when `mark === 'accepted'` the muted word “Accepted”.
- [ ] **Step 3: Write `Worksheet.css`**: `.toolbar` (flex, space-between: tools left, timer right), `.sheet-header` (Name rule, Date, Page right), `.problem` (row, fact at `--text-problem`, boxes right-aligned), `.problem[data-mark='wrong'] .answer` (3 px `--mark-amber` border, `border-radius: 999px`, padding so it reads as a circle around the boxes), `.timer` (tabular numerals, muted).
- [ ] **Step 4: Run** `npm run build`. Expected: clean.
- [ ] **Step 5: Commit** `feat(ui): AnswerBox rubber/undo support and ProblemRow`

---

### Task 6: Worksheet screen, Page complete, App wiring

**Files:**
- Create: `src/screens/Worksheet.tsx`, `src/screens/PageComplete.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: everything above; `recognise`, `recogniserOptions`, `TemplateStore`, `hasInk`, `ActiveClock`, `demoPage`.
- Produces: `Worksheet({ store, onBack })`, `PageComplete({ state, activeMs, onDone })`; App screen `'worksheet'` reached from a primary “Start” button on Home.

- [ ] **Step 1: Implement `Worksheet`**:
  - Gate: if `!store.isReady()` show the same copy as the check screen with a Back button.
  - State: `tool`, `phase: 'writing' | 'marked' | 'complete'`, `page: PageState`, `roundStartedAt` (performance.now at the start of each writing phase), `inkByBox: Record<string, { hasInk: boolean; lastStrokeAt: number | null }>` keyed `${round}-${position}-${digit}`, `activeMs` for display.
  - Clock: one `ActiveClock` per mount, `start(performance.now())` on mount, `touch(e.timeStamp)` from `pointerdown`/`pointermove` listeners on `window`; a `setInterval(config.worksheet.timerTickMs)` updates `activeMs` while `showTimer`; `stop` on complete.
  - Toolbar: left “Undo” (disabled when no box has a stroke; on tap undo the box with the greatest `lastStrokeAt`) and “Rubber” (`aria-pressed`, toggles `tool`); right the timer `mm:ss` when `showTimer`.
  - Header: “Name” with a blank rule, “Date {today, long form}”, “Page 1” right.
  - Writing phase: a `ProblemRow` per `page.pending` position, key `${round}-${position}`, `mark: null`; bottom row “Submit” (`className="primary"`, disabled unless every box of the round has ink and none is drawing) and “Back”.
  - Submit: for each pending position read every box (`strokes()`, `recognise(...)`, `firstStrokeAt()`), build `RoundAnswer`s with `firstStrokeMs = min(firstStrokeAt) − roundStartedAt` and `submittedMs = now − roundStartedAt`, call `markRound`, set `phase: 'marked'`.
  - Marked phase: same rows (same keys, so ink stays), `disabled: true`, `mark` from the last `RoundRecord` (`'wrong'` when `!correct && !override`, `'accepted'` when `override`, else `null`), `readAs` = the reads joined with `?` for null, `onOverride` → `acceptOverride`; bottom button “Try these again” when `pending.length > 0` (starts the next writing phase: new `roundStartedAt`, `inkByBox` reset, `tool` back to pen) or “Continue” when clean (→ `phase: 'complete'`, `clock.stop`).
  - Complete phase: render `PageComplete`.
- [ ] **Step 2: Implement `PageComplete`**: heading “Page complete”, then two plain lines “Correction rounds: {correctionRounds(state)}” and “Time: {mm:ss of activeMs}”, a “Home” button, and “Show details” toggling a read-only `<textarea data-testid="page-json">` with `JSON.stringify({ correctionRounds, activeMs, rounds }, null, 2)` (strokes included) so the in-memory record can be inspected.
- [ ] **Step 3: Wire `App.tsx`**: add `'worksheet'` to `Screen`, a primary “Start” button at the top of Home, keep the three step-1 buttons below it.
- [ ] **Step 4: Verify in headless Chrome** (puppeteer-core in the scratchpad, as in step 1; nothing added to the repo): calibrate 3 × 10 digits with synthetic shapes, open Start, write answers with two deliberate mistakes and one blank-looking scribble, confirm Submit is disabled until all boxes have ink, submit, confirm exactly those items carry `data-mark="wrong"`, tap override on one, “Try these again” shows only the remaining ones with empty canvases, correct them, confirm Page complete shows “Correction rounds: 1” and a `mm:ss` time, and that `page-json` holds `rounds[0].items[*].firstStrokeMs` numbers, `override: true` on the overridden item and `trueLabel` set on its boxes. Also: Undo removes the most recent stroke across boxes (ink-pixel count of the right canvas drops); Rubber dragged across a stroke removes it and a touch pointer in Rubber mode removes nothing; the timer text advances between two reads 1 s apart.
- [ ] **Step 5: Run** `npm test && npm run build`. Expected: all tests pass, build clean.
- [ ] **Step 6: Commit** `feat(screens): worksheet with corrections loop, undo, rubber, timer and page complete`

---

### Task 7: Handoff notes

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**: “Where the build is” says step 2 is implemented and step 1’s number is still to be reported; add the worksheet to the tablet test order (after the check) with what to look at: Submit, circles, “That’s not what I wrote”, Undo, Rubber, the timer; note the `showTimer` flag; update the Layout block with `engine/worksheet.ts`, `engine/activeClock.ts`, `seed/demoPage.ts`, `screens/Worksheet`, `screens/PageComplete`, `ui/ProblemRow`.
- [ ] **Step 2: Commit** `docs: step 2 tablet test instructions`
