# MasterMath

Daily arithmetic worksheets for one child on a stylus tablet, in the spirit of Kumon. She does one worksheet a day, writes her answers by hand, and corrects her mistakes the next day until each worksheet is 100%. It is an installable web app that works offline and keeps everything on the tablet.

**Live app: https://extoam.github.io/MasterMath/**

## Installing it on the tablet

1. Open https://extoam.github.io/MasterMath/ once on the tablet while online.
2. Add it to the home screen. In Safari on an iPad: Share → Add to Home Screen. In Huawei Browser: menu → Add to home screen.
3. From then on, open it from the home-screen icon. It works with no Wi-Fi, and every answer stays on the tablet.

New versions arrive by themselves: the next time the app opens online, it downloads the update in the background.

## Using it

**First opening.** It asks her name, which appears on Home and in the Name field of every sheet. Then she teaches the app her handwriting: 30 prompts, each digit three times. After that comes worksheet 1.

**A day.**

- **One worksheet a day:** 10 sheets with an a and a b side, so 20 pages. A new worksheet unlocks each calendar day. Missed days pile up and can all be done in one sitting.
- **Each page looks like a printed sheet.** It has the sheet code, title, instruction, Name, Date and Time. Horizontal pages hold 20 problems; column pages hold 10, with one box per digit. There are never more than two columns, and problems are numbered down each column.
- **In order:** a problem accepts the pencil only once the previous one has an answer, and a page only once the previous page is finished. The strip of page chips under the toolbar shows progress, and tapping one goes back to a page already reached.
- **Tools:** top-left are Back, Undo and Rubber. Top-right is the timer.
- **Submit only on the last page.** Nothing is marked that day.

**Corrections, the next day.** Home asks for corrections before any new worksheet. The page chips show which pages have mistakes and how many. Wrong answers get an amber circle, and the right answer is never shown. Corrections are marked as soon as she submits them, and anything still wrong comes back at once. When the app misread her writing, “Read as … · not what I wrote” accepts her answer and keeps her strokes, so recognition learns from it.

**Moving on.** A worksheet is one block of ten sheets. It passes at 90% right first time with the median page time within the target. Otherwise the same block comes back as the next worksheet. Problems she got wrong or answered slowly come back in later worksheets until she gets them right and quick twice.

**Home** shows today’s task, Level B progress, and a calendar with a smile on every day a worksheet was handed in. Missed days stay plain; there is no streak to break.

**Parent view.** Press and hold the **MasterMath** title on Home for a second. It shows:

- the next sheet, worksheets done, homework days this month, and blocks repeated
- the correction plan, with what is due and on which pages
- every worksheet and every block, with right-first-time and time against the target
- the problems coming back for practice
- handwriting samples per digit

**Reset all data…** at the bottom starts over completely, after a confirmation.

## Where it is in the curriculum

She had passed Kumon B100 on paper, so the app starts at **B101**:

| Sheets | Content |
|---|---|
| B101–120 | Subtraction review up to 20 |
| B121–150 | Column subtraction of 2-digit numbers, with borrowing |
| B151–160 | Mixed column addition and subtraction of 2-digit numbers |
| B161–200 | 3-digit subtraction |

Block titles and target times follow Kumon’s published table. The block table and every design decision are in `docs/superpowers/plans/2026-10-24-kumon-level-b.md`.

## Your data

All data lives in the tablet browser’s storage (IndexedDB): her name, handwriting, worksheets, corrections and timings. Nothing is uploaded, and there is no account. Clearing the browser’s site data, or Reset in the Parent view, erases it. Backups and cloud sync are planned in `docs/FUTURE-PLAN.md`.

## Deploying

The live app is the `gh-pages` branch, served by GitHub Pages. From a clean, pushed `main`:

```
npm run deploy       # runs the tests, builds for /MasterMath/, publishes gh-pages
npm run check-live   # waits until the live site serves this exact commit
```

`deploy` refuses to publish uncommitted or unpushed work. A deploy is done when `check-live` prints `LIVE`. Claude Code sessions follow the project skill `.claude/skills/deploying-mastermath/SKILL.md`, which also covers rollback and first-time Pages setup. The repository must stay public for GitHub Pages on the free plan.

## Developing

Node 22 or newer.

```
npm install
npm run dev          # development server on the LAN; prints a Network: URL for the tablet
npm test             # unit tests (engine, ink, db, curriculum)
npm run build        # type-check and production build
```

- **Trying the next-day steps without waiting:** on the development server only, the Parent view has a “Pretend it’s tomorrow” button that moves saved work one day back. It is never in a deployed build.
- **Handwriting:** fingers are ignored inside answer boxes on purpose, as palm rejection. If the pencil does not draw, the browser is reporting it as a finger.
- **Measuring recognition on her real handwriting:** export with **Try it → Download handwriting data**, then run the command below. It compares plain matching with direction-aware matching and saves a table beside the file.

```
HANDWRITING_FILE=~/Downloads/mastermath-handwriting-YYYY-MM-DD.json npx vitest run tests/handwriting-report.test.ts
```

## Layout

```
src/curriculum/ levelB.ts        Level B: 20 blocks, titles, target times, problem rules, instructions
src/engine/     config.ts        every tunable constant
                schedule.ts      daily rhythm: one worksheet a day, corrections next day, drafts
                progress.ts      position, block pass or repeat, review pool
                sheet.ts         one page from a sheet code: repetition, review problems
                worksheet.ts     marking a round, overrides, per-item timings
                calendar.ts      month grid for the homework calendar
                parent.ts        everything the Parent view shows
                activeClock.ts, sideTimer.ts   idle-aware time, per page
src/ink/        capture.ts       pen strokes, palm rejection, undo, rubber
                normalise.ts, recogniser.ts, templates.ts   $P digit recogniser
                evaluate.ts      leave-one-out measurement on her samples
src/db/         schema.ts, repo.ts   IndexedDB v7, append-only records, draft, settings
src/screens/    Welcome, Today (Home), WorksheetScreen, ParentView, Calibrate, TryBox, RecogniserCheck
src/ui/         paper sheet, problems, answer boxes, progress chips, calendar, icons, styles
scripts/        deploy-pages.sh, check-live.sh
tests/          unit tests
```

## Documents

- `MasterMath Build Spec.md`: the product design, kept current.
- `docs/FUTURE-PLAN.md`: hosting, storing data, and opening the app to more children.
- `docs/superpowers/plans/`: the build plans as they were carried out, with every decision and review.
- `.claude/skills/deploying-mastermath/`: how to deploy and verify.
