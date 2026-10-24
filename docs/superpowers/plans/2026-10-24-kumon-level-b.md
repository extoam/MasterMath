# MasterMath: Kumon Level B Daily Sets Implementation Plan

> **Status (Oct 24, 2026):** carried out and live, including the daily rhythm, paper sheet, calendar, parent view, name, reset and offline install. Current design: `MasterMath Build Spec.md`. Next: `docs/FUTURE-PLAN.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the hard-coded multiplication page with Kumon’s Level B sequence from B101 onward: a daily set of Kumon sheets (a and b sides), each side on one screen with no scrolling, horizontal or column problems, problems answered in order, each problem repeated on its side, mistakes and slow answers coming back, and progress saved on the tablet.

**Architecture:** `src/curriculum/levelB.ts` is the content: 20 blocks of 10 sheets with Kumon’s titles and standard completion times (SCT), each with a deterministic problem generator. `src/engine/sheet.ts` builds one side (repetition, review injection) from a sheet code. `src/engine/progress.ts` derives the current position and block passes from saved side records. `src/db` gains an append-only `sides` store (schema v3). `src/screens/Sheet.tsx` replaces `Worksheet.tsx` and reuses the page state machine, clock, recorder and AnswerBox.

**Spec:** `MasterMath Build Spec.md`, superseded where this plan says so. Source for the curriculum: Kumon Singapore “Table of Learning Materials, Mathematics” (Level A and B block titles and SCT).

## Decisions (owner, 2026-10-24)

- The app replaces paper Kumon. She has passed B100; her last paper sheet was subtraction up to 20 (B101–120). Start at **B101**.
- Daily: one set of 10–20 sheets. Every side fits one screen, no scrolling.
- **Never more than 2 columns** of problems on a side: easier to memorise.
- Problems are numbered **down each column** and must be answered **in order**: a problem’s boxes unlock once every earlier problem on the side has ink.
- **Problems repeat** within a side (Kumon repetition, “memorising the answers”).
- Main aim: speed from memory and **self-correction**. Answers are never revealed.
- Timer, Back/Undo/Rubber top-left, Submit at the end (earlier decision).

## Decisions (mine)

- A Kumon sheet number has two sides, `a` and `b`; each side is one screen. A daily set is `config.daily.sheets = 10` sheet numbers (20 sides).
- Column sides hold 10 problems in 2 columns × 5 (mockup A). Horizontal sides hold 20 in 2 columns × 10.
- Each problem on a side appears exactly twice, never adjacent in order. Sides are generated deterministically from the sheet code, so a repeated block shows the same sheets, as in paper Kumon.
- Block pass: first-pass accuracy over the block attempt ≥ `config.progress.passAccuracy` (0.9) and median side time ≤ half the block’s upper SCT (SCT is per two-sided sheet). Otherwise the block repeats from its first sheet.
- Review: a problem whose latest first-pass answer was wrong, or right but slower than `config.progress.fluencyMs` to first stroke, joins the review pool until answered right and fast twice in a row. Each side replaces up to `config.progress.reviewPerSide` (2) of its problems with review problems of the same layout.
- Block generators below are my reading of Kumon’s block titles; exact Kumon problem sets are not public.
- Carry/borrow note boxes above columns are deferred: ink there would not be read anyway, and she can work the borrow mentally as on Kumon’s screens. (Noted for a later step.)
- Recogniser unchanged; the 4/9, 5/6, 2/3 confusions wait for her exported handwriting data.

## Level B blocks

| Sheets | Title | Layout | Generator | SCT (min/sheet) |
|---|---|---|---|---|
| 1–10 | Addition (review up to A) | horizontal | a+b, sum 2–28 | 1–2 |
| 11–20 | Addition to 100, part 1 | column | 2-digit + 1-digit, no carry | 1–2 |
| 21–30 | Addition to 100, part 2 | column | 2-digit + 1-digit, ones sum exactly 10 | 2–3 |
| 31–40 | Addition to 100, part 3 | column | 2-digit + 1-digit with carry, sum < 100 | 2–3 |
| 41–50 | Addition of 2-digit numbers 1 | column | 2d + 2d, no carry | 2–3 |
| 51–60 | Addition of 2-digit numbers 2 | column | 2d + 2d with carry, sum < 100 | 2–3 |
| 61–70 | Addition of 2-digit numbers 3 | column | 2d + 2d, sum ≥ 100 | 2–3 |
| 71–80 | Addition of 3-digit numbers 1 | column | 3d + 1d/2d with carry | 2–4 |
| 81–90 | Addition of 3-digit numbers 2 | column | 3d + 3d, sum < 1000 | 2–4 |
| 91–100 | Addition of 3-digit numbers 3 | column | 3d + 3d, sum ≥ 1000 | 3–5 |
| 101–110 | Subtraction 1 (review up to A) | horizontal | a−b, a ≤ 12 | 1–2 |
| 111–120 | Subtraction 2 (review up to A) | horizontal | a−b, a ≤ 20 | 2–3 |
| 121–130 | Subtraction of 2-digit numbers 1 | column | 2d − 1d, borrow in half | 2–3 |
| 131–140 | Subtraction of 2-digit numbers 2 | column | 2d − 2d, no borrow | 2–3 |
| 141–150 | Subtraction of 2-digit numbers 3 | column | 2d − 2d with borrow | 2–3 |
| 151–160 | Addition and subtraction of 2-digit numbers | column | mixed + and − of 2d | 2–4 |
| 161–170 | Subtraction of 3-digit numbers 1 | column | 3d − 1d/2d | 2–3 |
| 171–180 | Subtraction of 3-digit numbers 2 | column | 3d − 2d with borrow | 2–4 |
| 181–190 | Subtraction of 3-digit numbers 3 | column | 3d − 3d | 2–4 |
| 191–200 | Subtraction of 3-digit numbers 4 | column | 3d − 3d with a zero in the tens, borrowing across it | 3–5 |

## Review Focus

1. A block whose last side is completed in a set that then continues: the next side must be the next block (pass) or the block’s first sheet (repeat), never past B200.
2. App reopened mid-set the same day: position and today’s count come from saved sides, so nothing is lost or repeated beyond the side in progress.
3. A review problem injected into a side must not create an adjacent duplicate or change the side’s problem count.
4. A side whose answers need 3 or 4 boxes (e.g. 999 + 999) still fits its column.
5. Writing ahead: ink in problem 5 while problem 3 is empty must be impossible.

### Tasks
1. Config + curriculum (`src/curriculum/levelB.ts`, tests): block table, `blockFor(sheet)`, `sheetCode`, generators with property tests per block.
2. Side builder (`src/engine/sheet.ts`): `buildSide(code, reviewPool)`; repetition, no adjacency, determinism, review injection.
3. Progress (`src/engine/progress.ts`): `SideRecord`, `nextSide(history)`, `blockPassed`, `reviewPool(history)`, `sidesToday(history, now)`.
4. DB v3 `sides` store, `saveSide`, `loadSides`, guarded upgrade from v2.
5. UI: `ProblemView` (horizontal and column), `Sheet` screen (ordered unlock, fit to screen, corrections, side done), Home with today’s set, set complete. Browser verification.
6. README.

## Final review (fresh reviewer, 2026-10-24) and what was done

- Fixed: a double-tap on Done saved a side twice and could flip a block’s pass or repeat. Done is guarded, saving ignores a second call, and `nextSide` ignores any side that is not the one due.
- Fixed: Back threw away a written side; it now asks once (“Tap again to leave”).
- Fixed: every stroke was loaded at startup. Strokes now live in `side_ink` (schema v4) and are never loaded for Home.
- Fixed: “today” did not roll over while the app stayed open; Home re-renders on focus, visibility and every minute.
- Fixed: slow answers crowded mistakes out of review; wrong answers now come first, and column problems get 6 s before counting as slow (horizontal 3 s).
- Fixed: rows could overflow under browser bars or in landscape; boxes and digits shrink to fit (floor 36 px). Checked at 800×1280, 820×1180, 768×900, 1280×800, 1180×820.
- Fixed: corrected problems keep their place on the sheet, so twins never end up side by side in a correction round.
- Fixed: B191–200 is now 3-digit minus 3-digit across a zero; dead end after Level B; “Save again” is safe to repeat.
- Ruling: the number of answer boxes equals the answer’s digit count, as on Kumon’s own sheets (B11a shows one box for 4 + 2 and two for 13 + 2). Cost if wrong: a hint about carries.
- Deferred: a horizontal review problem is not shown on column sides; B121 does not force a borrow mix on every side; the column override button can cover a digit of the top number on 3–4 digit problems; a set that stops after an a side splits the next sheet across days; a corrupt record shows a blank screen; no parent alert when a block repeats many times.

## Daily rhythm (owner, 2026-10-24, second round)

- **One worksheet a day.** A worksheet is one block of Kumon sheets (`config.daily.sheets` = 10 sheets, a and b sides, 20 screens), so pass or repeat is decided at hand-in. A new one unlocks each calendar day; missed days pile up and can all be done in one sitting.
- **Submit only on the last sheet.** Earlier sheets have Next sheet. Sheets go in order; a progress bar of sides lets her go back to any sheet already reached.
- **Marks appear the next day.** Nothing is marked on the day of hand-in. From the next day, corrections must be finished before a new worksheet starts; on a catch-up day, corrections for that day's worksheets wait until the following day.
- **Corrections are marked right away** once she submits them; anything still wrong comes back at once until the worksheet is 100%.
- **Progress bar in corrections** shows which sheets have mistakes (amber, with a count); tapping one opens it with only the circled problems, in their places.
- **Toolbar buttons are icons:** Back, Undo, Rubber.
- Work in progress is saved as she goes (the `drafts` store, the one mutable record), so Back and closing the app lose nothing.

My calls: the earlier no-progress-bar rule in the spec is overridden by the owner.

### Review of the daily rhythm (fresh reviewer) and what was done

- Fixed (critical): time per side was lost on every autosave, so the speed rule for repeating a block could never fire. `SideTimer` now keeps each side's running total; checked in the browser (20 sides, real seconds each).
- Fixed: a save landing after hand-in could bring the draft back and lock Home. Nothing saves once Submit is pressed, saves are ignored while a hand-in runs, and a stale draft is dropped on load (`staleDraft`).
- Fixed: “not what I wrote” counted as a mistake for passing a block and for review. `applyOverrides` counts it as right, and her strokes are kept as handwriting templates (source `override`), so misreads become training data.
- Fixed: answer times. Stroke times are wall-clock, and each side records when it was opened, so the first problem is timed and a side written across a reload is not measured across the gap.
- Fixed: the draft was rewritten whole after every stroke. Ink is stored per side (`draft_ink`, schema v6) and only the changed side is written; correction strokes are kept apart (`correction_ink`) and not loaded at startup.
- Fixed: a failed hand-in could lose the last strokes. Everything is saved before hand-in; Back waits until the save is stored; closing or hiding the app saves at once.
- Fixed (minor): Submit always shows when no later sheet needs correcting; filled state computed once per render; restored ink is not re-saved; the draft has a format version.
- Deferred: no cap or parent reset for many missed worksheets; an open catch-up draft is offered before newly due corrections; overrides cannot be undone; correction rounds are not timed.
