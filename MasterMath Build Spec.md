# MasterMath Build Spec

Oct 23, 2026 · @antanina · updated Oct 24, 2026 to match the app as built

MasterMath is daily arithmetic practice in the spirit of Kumon, as an installable web app for one child on a stylus tablet. It has handwritten answers, one worksheet a day, corrections the next day until each worksheet is 100%, and progress through the levels in small steps. It replaces the child’s paper Kumon.

Live at https://extoam.github.io/MasterMath/. Forward plan: `docs/FUTURE-PLAN.md`.

## Changes from the first version of this spec

The first version (Oct 23) planned a multiplication-first ladder with Leitner scheduling of fact families, ten 10-item pages a day, immediate marking, no visible timer, and no progress bar. On Oct 24 the owner set the direction below after comparing the app with real Kumon sheets and the Kumon Connect app. These decisions replace the earlier ones:

| Was | Now (owner decision, Oct 24) |
|---|---|
| Multiplication first (levels A1–E2 of our own) | Kumon Level B from **B101**, where her paper Kumon left off; addition and subtraction with big numbers and column calculation |
| Leitner boxes over fact families | Kumon’s fixed sequence of small steps; mistakes and slow answers also come back for review |
| Ten 10-item pages a day | **One worksheet a day** = 5 Kumon sheets, a and b sides (10 pages); 20 pages proved too long in her first real test (Oct 25) |
| Marked immediately, page by page | **Submit only on the last page**; marks appear **the next day**; corrections before anything new |
| No visible timer | A timer top-right, as in Kumon Connect, with a **Pause** that covers the sheet (added after her first real test, Oct 25) |
| No progress bar | A strip of page chips to see progress and move between pages; in corrections it shows where the mistakes are |
| Any layout | At most **two columns**, numbered down each column, problems answered **in order**, each problem **repeated** on its page |
| Plain page | Each page looks like a **printed paper sheet** |
| Parent view after a month of use | Built now, behind a press-and-hold on the title |
| No hosting decision | GitHub Pages (public repository), offline-capable install |

## Scope and decisions

The deliverable is an installable web app (PWA), not a native app. The decision is driven by the target device. Huawei tablets on HarmonyOS 5 or later cannot install Android APKs, and Apple’s Scribble exists only on iPad. A web app with its own digit recogniser runs on iPadOS, Android and HarmonyOS from one codebase.

- **One child, one device.** There are no accounts and no server. All state lives in IndexedDB on the tablet.
- **Stack:** Vite, React 18, TypeScript (strict), `idb`, and `vite-plugin-pwa`. Pointer Events feed a canvas per answer box. There is no UI component library, only plain CSS with tokens. The rounded print font is Nunito (Open Font License), bundled in the app.
- **Out of scope for now:** more than one child, cloud backup, and a companion app. Rewards shops, mascots, sounds and streak counters are out entirely. Word problems, fractions, and levels other than B are also out for now. See the forward plan for what comes next.

## Pedagogical model

Four principles the build keeps:

- **A worksheet is not done until it is 100% correct.** Wrong answers come back for correction, without the answer ever being shown, until the worksheet is clean.
- **Self-correction, the day after.** As with paper Kumon handed in and returned, marks appear the next day, and she finds and fixes her own mistakes before new work.
- **Answers from memory, by repetition.** Each problem appears twice on its page, never back to back and never beside its twin, so she recalls rather than copies. Kumon’s small steps repeat until they are fast and accurate.
- **Progress accumulates and never resets.** The calendar marks days with homework; a missed day leaves a plain day, not a broken streak.

Time is measured and shown as a plain fact, as on Kumon sheets: a timer while working, and time against the target afterwards. Time to first stroke per problem is recorded for review decisions.

## Curriculum: Kumon Level B from B101

Level B is 200 sheets in 20 blocks of 10. Each block is one narrow skill, and each sheet has an a and a b side. Block titles and standard completion times (minutes per two-sided sheet) follow Kumon’s published Table of Learning Materials. Problems are generated from rules that follow each title; Kumon’s exact problems are not public. The full table is in `src/curriculum/levelB.ts` and in the Level B plan.

| Sheets | Skill | Layout |
|---|---|---|
| B1–100 | Addition, up to 3-digit (passed on paper; used for review problems) | horizontal, then column |
| B101–120 | Subtraction review up to 20 | horizontal, 20 per page |
| B121–150 | Subtraction of 2-digit numbers, then with borrowing | column, 10 per page |
| B151–160 | Mixed addition and subtraction of 2-digit numbers | column |
| B161–200 | Subtraction of 3-digit numbers, last block borrowing across a zero | column |

- **Pages** are generated deterministically from the sheet code, so a repeated block shows the same sheets, as on paper.
- **Review problems:** up to two per page come from earlier mistakes or slow answers, of the same layout. Each is shown twice.
- **Block pass:** 90% right first time over the block, with the median page time within half of Kumon’s upper per-sheet time. Otherwise the block repeats. A recogniser misread accepted with “not what I wrote” counts as right.
- **Review pool:** a problem joins it when answered wrong, or right but slower than 3 s (horizontal) or 6 s (column) to the first stroke. It leaves after being right and quick twice in a row.

## The daily rhythm

- **One worksheet per calendar day:** 5 sheets, a and b sides, 10 pages (`config.daily.sheets`). A block of 10 sheets takes two worksheets; a worksheet never crosses into the next block, so pass or repeat is decided when the block’s last worksheet is handed in. The count is one setting, so it can grow later, for example towards the end of a level.
- **Unlocking:** one worksheet per day since the first one. Missed days pile up and can all be done in one sitting.
- **Pause:** a button beside the timer stops the clock and covers the sheet until Resume; leaving the app pauses it too, so long breaks never count as work time.
- **Writing:** pages in order. Within a page, problems in order: a problem takes ink only when the previous one has an answer. Next page on every page; **Submit only on the last**.
- **Hand-in:** the worksheet is read by the recogniser and saved, but nothing is shown that day.
- **The next calendar day:** the marks appear, and corrections must be finished before a new worksheet starts. Corrections from a catch-up day appear the following day.
- **Corrections:** only the circled problems, in their places, with empty boxes. They are marked as soon as they are submitted, and anything still wrong comes back at once until the worksheet is 100%.
- **Saving as she goes:** work in progress is saved continuously, so Back or closing the app loses nothing.

## Handwriting input

This is the highest-risk subsystem. A misread correct answer forces a needless correction and destroys trust. Everything is designed to make misreads rare and cheap.

- **One box per digit.** The number of boxes equals the answer’s digit count, as on Kumon’s own sheets.
- **Strokes as vectors:** `{x, y, t, pressure}` from Pointer Events, with wall-clock times. A `touch` pointer is rejected inside boxes (palm rejection), and `touch-action: none` is set.
- **The recogniser is our own $P point-cloud matcher.** It uses templates from her hand, collected by a calibration step (“Teach the app your handwriting”, each digit three times). A swap to a learned model stays contained to `src/ink/recogniser.ts`.
- **Escape hatch:** every circled problem offers “Read as … · not what I wrote”. It accepts her answer and adds her strokes as templates, so misreads become training data.
- **Measuring:** a 100-digit handwriting check, a downloadable export of her samples, and a leave-one-out report (`tests/handwriting-report.test.ts`). The report compares plain $P with direction-aware scoring. The known confusions in her hand are 4/9, 5/6 and 2/3; the scoring is switched only if her data shows a clear gain.

## Screens

- **Welcome:** asks her name on first opening.
- **Home:**
  - a header with her name and the date
  - one card for today’s task: start or continue a worksheet, corrections first, or “see you tomorrow”
  - Level B progress
  - the homework calendar, with a smile on each day a worksheet was handed in
  - quiet links to the handwriting tools
- **Worksheet:**
  - on the desk area: the toolbar (Back, Undo, Rubber; timer) and the page chips
  - the printed page: sheet code, block title, instruction (“◆ Subtract.”), Name, Date and Time fields, a target-time box, then the problems in at most two columns
  - Next page or Submit below the page
  - every page fits the screen without scrolling; boxes shrink on short screens and in landscape
- **Corrections:** the same page, only the circled problems, with the mistake count on each page chip.
- **Parent view:** opened by holding the title for a second. It shows:
  - the next sheet, worksheets done, homework days, and blocks repeated
  - the correction plan
  - worksheets and blocks, with right-first-time and time against the target
  - problems coming back
  - handwriting samples per digit, and “not what I wrote” count
  - Reset all data, behind a confirmation
- **Handwriting tools:** Teach, Try it (with the sample export), and the 100-digit check.

## Data model

IndexedDB, schema version 7. Records are append-only, except the draft and the settings.

| Store | Holds |
|---|---|
| `templates` | Handwriting samples: digit, strokes, source (calibration or override) |
| `check_items` | Answers from the 100-digit handwriting check |
| `worksheets` | Handed-in worksheets: pages, hand-in time, active time per page |
| `sides` | First pass of each page: problems, items (read, correct, time to first stroke), without strokes |
| `side_ink` | Strokes of each page, kept apart and never loaded at startup |
| `corrections`, `correction_ink` | Each correction round, and its strokes |
| `drafts`, `draft_ink` | The work in progress, ink saved one page at a time (mutable) |
| `settings` | Her name (mutable) |

The append-only design is what makes the forward plan’s cloud sync simple: a device only ever adds records the other side does not have.

## Hosting and offline

- **Hosting:** GitHub Pages serves the `gh-pages` branch at `/MasterMath/`. The repository is public, which the free plan needs.
- **Offline:** the service worker precaches the whole app, fonts included. Once opened online and added to the home screen, it opens and works with no network. Results never need the network; they are saved on the tablet as they happen.
- **Deploy:** `npm run deploy` then `npm run check-live`. Details are in the README and the project skill `deploying-mastermath`.
- **Storage durability** is the real risk of a PWA: browsers can evict IndexedDB. Backup files and `navigator.storage.persist()` come first in the forward plan.

## Build order and status

| Step | Status |
|---|---|
| 1. Stroke capture and recogniser | Built. Her measured accuracy on 100 digits is still to be reported. |
| 2. Worksheet and corrections loop | Built, then reshaped into the daily rhythm |
| 3. Curriculum and progression | Built as Kumon Level B, instead of Leitner fact families |
| 4. Levels, placement, assessment | Level B only; placement replaced by starting at B101 |
| 5. Home and progress | Built: task card, Level B progress, homework calendar |
| 6. PWA shell and offline | Built and live; backup export is next (forward plan, stage 1) |
| 7. Parent view | Built early, at the owner’s request |

## Working agreement for Claude Code

- Read this spec, the README, and the latest plan in `docs/superpowers/plans/` before changing behaviour. The owner’s decisions above override the first version of this spec.
- Engine, ink, db and curriculum code is unit-tested, with tests written first. Screens are checked in a real browser.
- Every tunable lives in `src/engine/config.ts`.
- No new runtime dependencies without asking.
- No backend, network calls, analytics, mascots, sounds or streaks unless the owner changes the forward plan.
- Children’s data never leaves the tablet in the current design.
- Use typographic punctuation in every text the child reads.
- Deploy only through `npm run deploy`, and call it done only when `npm run check-live` passes.
