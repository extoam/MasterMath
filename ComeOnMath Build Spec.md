# ComeOnMath Build Spec

Oct 23, 2026 · @antanina

ComeOnMath is Kumon-style arithmetic practice as an installable web app, built for one child on a stylus tablet. Tablet-first, stylus handwriting input, daily worksheets with a corrections loop, levels gated by assessment.

## Scope and decisions

Build an installable web app (PWA), not a native app. The decision is driven by the target device: Huawei tablets running HarmonyOS 5 or later cannot install Android APKs at all, and Apple's Scribble handwriting input exists only on iPad with an Apple Pencil. A web app with its own digit recogniser runs identically on iPadOS, Android and HarmonyOS from one codebase, and sidesteps Huawei's app-distribution problem entirely.

One user, one device at a time. No accounts, no server, no sync. All state lives in IndexedDB on the tablet. This is a tool for one child, not a product; every decision below optimises for that.

Stack: Vite, React 18, TypeScript in strict mode, `idb` for IndexedDB, `vite-plugin-pwa` for the manifest and service worker. Canvas for the writing surface, Pointer Events for stylus capture. Full layout under Repository and stack below.

Explicitly out of scope for v1: multiple children, cloud backup, a companion phone app, sound effects, avatars, any kind of reward shop, word problems, fractions, and anything beyond the four operations.

## Repository and stack

React rather than something smaller because you and Claude Code both know it cold, and bundle size is irrelevant for a single-user PWA. No UI component library; plain CSS with a small token file. Vitest for the engine and recogniser, which are the only parts worth unit-testing in v1. Deploy to Cloudflare Pages on push to `main`.

```
comeonmath/
  index.html
  vite.config.ts            vite-plugin-pwa: manifest, Workbox precache
  public/                   icons, splash
  src/
    main.tsx
    app/                    shell, routing, theme
    screens/                Home, Placement, Worksheet, Corrections,
                            PageComplete, Parent
    ink/                    capture.ts    pointer events to strokes
                            normalise.ts  bounding box, resample
                            recogniser.ts $P matcher
                            templates.ts  per-digit template store
    engine/                 config.ts     every tunable constant
                            scheduler.ts  Leitner boxes
                            composer.ts   page composition
                            levels.ts     ladder, placement
                            assessment.ts pass criteria
    db/                     schema.ts, repo.ts, export.ts
    seed/                   families.json, levels.json
    ui/                     shared components, tokens.css
  tests/                    scheduler, composer, recogniser
```

Every tunable lives in `engine/config.ts`: fluency threshold, box intervals, session mix, pass criteria, idle timeout, export cadence. Nothing numeric is inlined in the code that uses it.

## Pedagogical model

Kumon's level ladder is the visible structure; per-fact mastery data is the invisible engine. The child sees levels, pages and assessments, because that is legible and motivating at age eight. Underneath, the app tracks every individual fact and uses that to decide which problems appear on each page. Paper Kumon cannot do this: it prints a fixed sequence regardless of what the child already knows.

Four principles the build must not compromise on.

**A page is not done until it is 100% correct.** Wrong items come back for correction, without the answer being revealed, until the page is clean. This is the single most important mechanic and the one most drill apps omit. It is what produces near-perfect accuracy rather than good-enough accuracy.

**Measure retrieval speed, never show a timer.** Time to first stroke is the retrieval latency; everything after it is handwriting motor time and says nothing about recall. A correct answer that took eight seconds means she is counting, not remembering, and must be treated differently from a fast one. A visible countdown is the fastest way to manufacture maths anxiety, so timing is silent.

**Interleave operations within a session.** Kumon blocks one operation for pages at a time. Blocked practice feels better and produces better in-session scores, but interleaved practice produces substantially better retention, because the child must identify which operation she is looking at instead of running one procedure on autopilot. It will feel harder. That is the mechanism working.

**Progress accumulates and never resets.** No punishing streaks. A missed day because of travel must not destroy a counter, because the resulting distress is a common reason children abandon these apps.

## Level ladder

Twelve levels, each 20 to 30 pages plus an assessment. Levels A and B exist mainly as a safety net and as remediation targets when mastery data finds a hole; an eight-year-old will usually place into C.

| Level | Content | Pages |
| --- | --- | --- |
| A1 | Addition within 10 | 20 |
| A2 | Addition within 20 | 25 |
| B1 | Subtraction within 10 | 20 |
| B2 | Subtraction within 20 | 25 |
| C1 | Multiplication, tables 2, 5, 10 | 20 |
| C2 | Multiplication, tables 3, 4 | 25 |
| C3 | Multiplication, tables 6, 7 | 25 |
| C4 | Multiplication, tables 8, 9 | 25 |
| C5 | Multiplication, tables 11, 12 | 20 |
| C6 | Multiplication, mixed to 12 | 30 |
| D1 | Division by 2, 5, 10 | 20 |
| D2 | Division by 3, 4, 6 | 25 |
| D3 | Division by 7, 8, 9 | 25 |
| D4 | Division, mixed to 12 | 30 |
| E1 | Mixed multiplication and division | 30 |
| E2 | All four operations mixed | 30 |

Placement happens once, on first run: 40 items sampled across all four operations, no corrections loop, no time pressure. She starts at the first level where accuracy falls below 90% or median latency exceeds the fluency threshold. Tell her it is not a test and that getting things wrong is how the app learns what to teach.

Page content is generated, not authored. A page requests 10 items from the scheduler, which returns facts drawn from the current level's pool, weighted by weakness, with a floor of already-mastered items so the page never feels impossible.

## Fact families and scheduling

Schedule fact families, not individual problems. 7x8, 8x7, 56/7 and 56/8 are one piece of knowledge shown four ways; storing them as four records quadruples the practice load for no learning gain, and produces the maddening case where she knows 7x8 cold but the app still thinks 56/8 is unlearned. One record per family, randomise the presentation direction.

This collapses the domain to roughly 90 multiplication families and 60 addition families up to twelves, most of the latter already known. That is a few weeks of daily five-minute sessions to full mastery, not a year. Tell her that: a finite, visible endpoint motivates far better at nine than an infinite treadmill.

Use a Leitner box system, not SM-2 or anything Anki-flavoured; those are tuned for thousands of cards over years.

| Box | Interval | Promotes on |
| --- | --- | --- |
| 0 new | same session | 2 consecutive fast-correct |
| 1 learning | same session, later | 2 consecutive fast-correct |
| 2 | 1 day | 1 fast-correct |
| 3 | 3 days | 1 fast-correct |
| 4 | 7 days | 1 fast-correct |
| 5 retired | 21 days, spot-check only | stays |

Promotion requires correct **and** fast. Correct-but-slow holds the family in its current box: this is the whole reason latency is measured. Any wrong answer drops the family straight to box 1, never below, so a single slip does not erase weeks.

The fluency threshold is time to first stroke, not total answer time. Start at 3000 ms and calibrate: after two weeks of data, set the threshold to roughly the 60th percentile of her own first-stroke times on box-5 families. Store it as a tunable constant, not a magic number in the code.

Session composition: about 60% families due for review, 25% currently in boxes 0 and 1, 15% new material from the current level. Cap at 10 items per page and stop the session at the daily target of 10 pages, whatever the queue still holds. See Daily homework and timing below.

## Daily homework and timing

Daily homework is 10 pages of 10 items, targeted at 20 minutes of active time. That is 12 seconds per item including handwriting and correction rounds: comfortable on mastered material, properly tight on new material. Kumon's own sheets run about 10 problems a side, so this matches the real thing closely. Ten pages at 20 items would be six seconds per item and a daily failure.

Timing is recorded at three levels and shown to the child only after the fact, never live.

| Level | What is measured | Shown to child |
| --- | --- | --- |
| Item | time to first stroke (retrieval), time to submit (retrieval plus writing) | never |
| Page | `active_ms` including correction rounds, idle-paused after 30 s without a pointer event | on Page complete, as a plain number |
| Session | `active_ms` across all pages, plus wall-clock start and end | at session end, against the 20-minute target |

The session-end screen shows total time against the target the way a Kumon sheet shows the time written on it: a fact, not a verdict. No countdown, no colour-coding against the target, no "too slow". She always finishes the page she is on; a session never cuts off mid-page.

Twenty minutes is a diagnostic, not a deadline. If active time exceeds 25 minutes on three of the last five sessions, she is on material too hard for daily practice: the composer drops new material to 5% and raises review to 70% until the time recovers, and the parent view flags it. If sessions finish under 12 minutes with clean first passes for five days running, the composer raises new material to 25%. Both rules and all four thresholds live in `engine/config.ts`:

```
itemsPerPage: 10
dailyPages: 10
dailyTimeTargetMs: 1_200_000
slowSessionMs: 1_500_000
fastSessionMs: 720_000
idleTimeoutMs: 30_000
```

## Page and assessment mechanics

&#91;embedded content: page lifecycle · 4 steps, 1 decision, 1 loop\]

The loop is the point: wrong items come back, answers stay hidden, and the page only closes when every item is right.

A practice page is 10 items. The first pass collects all answers, then the app marks the whole page at once rather than item by item, which keeps the rhythm closer to paper and avoids interrupting her mid-page. Wrong items return in a corrections round showing only those items, with her previous answer cleared and the correct answer never revealed. Mark again. Repeat until the page is clean. Only then does the page record as complete, with `correction_rounds` and `active_ms` stored.

Correction rounds are not failures and the UI must not frame them as such. Mark wrong items with a circle rather than a cross, and say nothing beyond showing which ones to redo. The number worth watching, in the parent view, is not how many she got wrong but how many rounds a page took to come clean, because that trends down as fluency builds even while raw error counts stay flat.

Assessment runs after the last page of a level: 10 pages, the same corrections loop, and two pass criteria. First pass accuracy of 100% on at least 8 of the 10 pages, and median page time within the level's `time_target_ms`. Failing either means repeating the level.

Repeating is real but must not be punishment. On a repeat, the scheduler weights the pool hard toward the families that actually failed, so the second run through a level is materially shorter and visibly different from the first. Tell her that directly: the app noticed which ones were tricky and is going to work on those.

## Handwriting input

This is the highest-risk subsystem in the build. The failure mode is vicious: she writes the right answer, the recogniser misreads it, the app marks her wrong, and because wrong answers force a correction loop she gets stuck redoing a problem she already got right. That destroys trust in about four minutes and you will not get it back. Everything below is designed to make misrecognition rare and cheap rather than impossible.

**One box per digit.** A two-digit answer gets two separate boxes. Segmenting a handwritten multi-digit number is harder than recognising the digits themselves, and per-digit boxes delete that problem completely. Boxes are large, roughly 80 by 100 CSS pixels, with a faint baseline.

**Capture strokes as vector point sequences, not bitmaps.** Each stroke is an array of `{x, y, t, pressure}` sampled from Pointer Events. Stroke order and direction carry real signal, and stroke-based recognition outperforms image classification on digits. It also gives you time-to-first-stroke for free.

**Write your own recogniser.** Do not reach for ML Kit. It is built to recognise free-form text in hundreds of languages, needs a native bridge, has no maintained React Native or web path, and on Android its model download typically rides on Google Play services, which Huawei tablets do not have. You need ten classes, zero through nine, in a fixed-size box, from one known child's hand. That is a genuinely small problem.

Implementation: use the $P Point-Cloud Recognizer for v1, not a neural network. $P is a template-matching algorithm built for multi-stroke gestures with user-supplied templates. It resamples each digit's strokes to 32 points, normalises scale and position, and scores against stored templates by point-cloud distance. It needs no training step, runs in under a millisecond in plain JavaScript, is roughly 150 lines, and the calibration game below is exactly how it gets its templates. Store 5 to 10 templates per digit from her own hand. A match whose score is well clear of the runner-up is confident; a close call shows the override control more prominently. Move to a small TensorFlow.js model only if measured $P accuracy on her handwriting stays below 95% after calibration, and keep the stroke format identical so the swap is contained to `ink/recogniser.ts`.

**Bootstrap with a calibration game.** For the first week, before each session, the app asks her to write each digit a few times to "teach the app your handwriting". This collects the training set and, more importantly, frames future misrecognitions as something she and the app are fixing together rather than the app being wrong at her.

**Always offer an escape hatch.** A permanently visible "that's not what I wrote" control on every marked item. Tapping it accepts her reading, logs the stroke data with the corrected label, and does not count the item wrong. Misrecognitions become training data instead of frustration. Retrain locally on a schedule, or just on demand from the parent view.

## Data model

IndexedDB, seven stores. Everything is local and nothing is ever deleted; the whole history for one child over two years is a few megabytes.

```
families    id, kind ('mul'|'add'), a, b, box, due_at,
            consecutive_fast, total_seen, total_correct

facts       id, family_id, op ('+'|'-'|'x'|'/'),
            operand_a, operand_b, answer

levels      id, code ('C3'), label, page_count,
            fact_pool (family id list), time_target_ms

pages       id, level_id, index_in_level, kind ('practice'|'assessment'),
            state, started_at, completed_at, pass_count,
            active_ms, correction_rounds

items       id, page_id, fact_id, position,
            first_stroke_ms, submitted_ms, given, correct,
            round (0 = first pass, 1+ = corrections),
            recognised_as, user_override

strokes     id, item_id, digit_index, points (JSON),
            recognised, confidence, true_label

sessions    id, date, started_at, ended_at,
            pages_completed, active_ms
```

Three notes for whoever implements this. `active_ms` excludes idle time, so a page left open while she wanders off does not corrupt the time data; pause the clock after 30 seconds without a pointer event. `strokes.true_label` is only set when she uses the override control, and those rows are the retraining set. `items.round` is what makes the corrections analysis possible: the interesting number is not how many she got wrong but how many rounds a page took to come clean.

Seed `families`, `facts` and `levels` from a static JSON file at first run, so the content is editable without a migration.

Seed format, kept deliberately small. Facts are expanded from families at first run, so `mul-7-8` becomes 7x8, 8x7, 56/7 and 56/8, and `add-8-5` becomes 8+5, 5+8, 13-8 and 13-5.

```
// seed/families.json
[
  { "id": "mul-7-8", "kind": "mul", "a": 7, "b": 8 },
  { "id": "add-8-5", "kind": "add", "a": 8, "b": 5 }
]

// seed/levels.json
[
  { "code": "C3", "label": "Tables 6 and 7", "page_count": 25,
    "time_target_ms": 120000,
    "pool": { "kind": "mul", "tables": [6, 7] } }
]
```

## Screens

Six screens. Copy Kumon's austerity: no illustrations, no characters, no colour beyond the mastery grid, one problem type per page, very large print, generous white space. The restraint is deliberate and it works, because anything decorative competes with the arithmetic for a child's attention.

**Home.** Current level and position within it, pages done today against the target, and the mastery grid. One primary button: Start. Nothing else.

**Mastery grid.** A 12 by 12 multiplication grid heat-mapped by box: grey untouched, amber learning, green retired. This is the emotional centre of the app. Nine-year-olds find filling in a grid genuinely compelling in a way that coins and badges do not survive a fortnight, and it is honest about what she knows and what is left. Keep it on the home screen and animate the cells that changed when a session ends.

**Worksheet.** Name and date at the top, page number top right, the problems in a single column, per-digit answer boxes. Kumon's own header fields are worth copying verbatim; they signal that this is real work. No progress bar, no timer, no encouragement text mid-page.

**Corrections.** Same layout as the worksheet, but only the wrong items, marked with a circle rather than a cross, and the previous wrong answer cleared rather than shown. No answers revealed, ever.

**Page complete.** Only after the page comes clean. Shows rounds taken and time, both as plain facts, and advances the grid.

**Parent view.** Behind a long-press, not a password. Median first-stroke latency per table over time, correction rounds per page, recogniser override rate, and a retrain button. Build this last and build it after a month of real use, so it is designed around the metrics that turned out to matter rather than the ones you assumed would.

## PWA specifics and risks

**Install.** A web manifest with `display: "standalone"`, portrait-primary orientation, and a service worker caching the shell. Installs to the home screen on iPadOS, Android and HarmonyOS alike, launches without browser chrome, and runs with the network off. On iPadOS she adds it from the Safari share sheet; on the Huawei tablet from the browser menu.

**Stylus input.** Pointer Events give you `pressure`, `tiltX`, `tiltY` and `pointerType`, which is `"pen"` for both the Huawei M-Pencil and the Apple Pencil. Set `touch-action: none` on the canvas or scrolling will steal the strokes. Reject `pointerType: "touch"` events inside answer boxes so a resting palm does not draw; this is the single most common cause of garbage strokes on a tablet.

**Storage durability is the real risk.** This is the one place a PWA is genuinely weaker than a native app. Browsers can evict IndexedDB under storage pressure, and Safari is historically the most aggressive. Call `navigator.storage.persist()` on first run, which an installed PWA is usually granted, and verify it with `navigator.storage.persisted()`. Do not rely on it.

**Therefore: automatic export.** Every tenth completed page, write the whole database to a JSON blob and offer it via the download API or the File System Access API where available. A silent weekly reminder in the parent view is enough. Losing six months of her progress to a cache eviction is the worst non-catastrophic outcome this app has, and a 200 KB JSON file prevents it entirely.

**Known limitations, accepted.** No TestFlight, so updates are just a redeploy and a refresh. No push notifications on iPadOS for a daily reminder, so the habit depends on you and a fixed time of day rather than the app. No app store presence, which for a single-user tool is a feature.

**Deploy.** Static hosting on Cloudflare Pages, which you already use, behind a private URL. No backend, no auth, no cost.

## Build order

Build the recogniser first. It is the only part that can fail in a way that kills the project, so prove it before investing in anything around it.

1. **Stroke capture and recogniser spike.** One answer box, M-Pencil input on the Huawei tablet, palm rejected, $P recogniser fed by the calibration game. Done when measured accuracy is at least 95% on 100 digits written by her. Below 90%: stop and report before building anything else.
2. **Worksheet and corrections loop.** One hard-coded 10-item multiplication page. Done when the full cycle runs: write, mark, correct, re-mark, clean, with correction rounds and active time held in memory.
3. **Data layer and scheduler.** Done when families, facts and levels seed from JSON, Leitner boxes advance per the table above, a page requests 10 items and receives the 60/25/15 mix, and unit tests cover promotion, demotion and composition.
4. **Levels, placement and assessment gating.** Done when the 40-item diagnostic places into a level, assessment runs after the last page and passes or repeats per the criteria, and a repeat weights the pool toward the families that failed.
5. **Home screen and mastery grid.** Done when the grid reflects box state per family and animates the cells that changed after a session.
6. **PWA shell, persistence and export.** Done when it installs from the browser on iPadOS and HarmonyOS, runs with the network off, requests persistent storage, and writes a JSON backup every tenth page.
7. **Parent view.** Not before a month of daily use.

Steps 1 and 2 are the project. If those land and she uses it daily for a fortnight, the rest is straightforward. If step 1 fails on her handwriting, stop and reconsider before building anything else.

## Working agreement for Claude Code

Read this document in full before writing any code, then follow the build order strictly. Do not start step 2 until step 1's acceptance criterion is met and reported with the measured number.

Constraints that are product decisions, not oversights:

- No backend, no network calls, no analytics, no auth. The app runs with the network off from first load.
- No UI component library. Plain CSS with tokens in `ui/tokens.css`.
- No dependencies beyond `react`, `react-dom`, `idb`, `vite-plugin-pwa` and dev tooling without asking first.
- No multiple-choice input, no visible timer, no streak counter, no sounds, no mascots.
- Every tunable constant lives in `engine/config.ts`. Nothing numeric is inlined where it is used.
- `strokes`, `items`, `pages` and `sessions` are append-only. Only `families` box state is ever updated in place.
- TypeScript strict mode. Unit tests for `engine/` and `ink/` land before the screens that depend on them.
- Typographic punctuation in all text the child reads.

When something in this spec is ambiguous or looks wrong, say so and propose an alternative rather than guessing. When an acceptance criterion cannot be met, stop and report what was measured and why.
