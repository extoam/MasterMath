import { useEffect, useRef, useState } from 'react';
import {
  clearDraft,
  handInCorrection,
  handInWorksheet,
  loadCorrectionInk,
  loadCorrections,
  loadDraft,
  loadDraftInk,
  loadSideInk,
  loadSides,
  loadWorksheets,
  newId,
  saveDraft,
  saveDraftInk,
  saveTemplate,
  shiftHistoryForTesting,
} from '../db/repo';
import { formatClock } from '../engine/activeClock';
import { config } from '../engine/config';
import type { SideRecord } from '../engine/progress';
import {
  applyOverrides,
  composeWorksheet,
  DRAFT_VERSION,
  dueState,
  outstanding,
  staleDraft,
  type CorrectionRecord,
  type Draft,
  type SideInkDraft,
  type WorksheetRecord,
} from '../engine/schedule';
import { answerDigits, markRound, type BoxReading, type ItemRecord, type RoundAnswer } from '../engine/worksheet';
import type { Template, TemplateStore } from '../ink/templates';
import { blockFor, LAST_SHEET, parseSheetCode } from '../curriculum/levelB';
import { nextSide } from '../engine/progress';
import { Calendar } from '../ui/Calendar';
import { Logo } from '../ui/Logo';
import '../ui/Home.css';
import { parentSummary } from '../engine/parent';
import { ParentView } from './ParentView';
import { WorksheetScreen } from './WorksheetScreen';

interface Props {
  store: TemplateStore;
  /** Her name: on Home and in the Name field of every sheet. */
  childName: string;
  onCalibrate: () => void;
  onTry: () => void;
  onCheck: () => void;
}

interface Data {
  worksheets: WorksheetRecord[];
  sides: SideRecord[];
  corrections: CorrectionRecord[];
  draft: Draft | undefined;
  draftInk: Record<string, SideInkDraft>;
}

type View = { kind: 'home' } | { kind: 'parent' } | { kind: 'work' } | { kind: 'handed-in'; ws: WorksheetRecord } | { kind: 'clean'; ws: WorksheetRecord };

/** Mark answers for the given positions of a side, as one round. */
function mark(problems: SideRecord['problems'], round: number, answers: RoundAnswer[]): ItemRecord[] {
  const state = { facts: problems, round, pending: answers.map((a) => a.position), rounds: [] };
  return markRound(state, answers).rounds[0]!.items;
}

/** What was read last time for each problem still to fix, for the “Read as … · not what I wrote” button. */
function lastReads(ws: WorksheetRecord, data: Data): Map<string, { readAs: string; prominent: boolean }> {
  const latest = new Map<string, ItemRecord>();
  for (const s of data.sides) if (s.worksheetId === ws.id) for (const it of s.rounds[0]?.items ?? []) latest.set(`${s.code}:${it.position}`, it);
  for (const c of data.corrections.filter((c) => c.worksheetId === ws.id).sort((a, b) => a.round - b.round)) {
    for (const { code, item } of c.items) latest.set(`${code}:${item.position}`, item);
  }
  const out = new Map<string, { readAs: string; prominent: boolean }>();
  for (const [k, it] of latest) {
    if (it.boxes.length === 0) continue;
    out.set(k, { readAs: it.boxes.map((b) => (b.read === null ? '?' : String(b.read))).join(''), prominent: it.boxes.some((b) => !b.confident) });
  }
  return out;
}

/** Home and the daily rhythm: one worksheet a day, corrections the next day before anything new. */
export function Today({ store, childName, onCalibrate, onTry, onCheck }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: 'home' });
  /** Calendar month shown, relative to this month (0 = now, -1 = last month). */
  const [monthShift, setMonthShift] = useState(0);
  const busy = useRef(false);
  const holdTimer = useRef<number | undefined>(undefined);
  const [, setTick] = useState(0);

  const reload = async () => {
    const [worksheets, sides, corrections, saved] = await Promise.all([loadWorksheets(), loadSides(), loadCorrections(), loadDraft()]);
    let draft = saved;
    if (draft && staleDraft(draft, worksheets, corrections)) {
      await clearDraft(); // e.g. a save that landed after its worksheet was handed in
      draft = undefined;
    }
    const draftInk = draft ? await loadDraftInk(draft.worksheetId, draft.round) : {};
    setData({ worksheets, sides, corrections, draft, draftInk });
  };

  useEffect(() => {
    reload().catch((err: unknown) => {
      console.error('Could not load progress', err);
      setFailed('Progress could not be read. Reload the page to try again.');
    });
    // A new day can unlock a worksheet or show corrections while the app stays open.
    const bump = () => setTick((t) => t + 1);
    window.addEventListener('focus', bump);
    document.addEventListener('visibilitychange', bump);
    const id = window.setInterval(bump, 60_000);
    return () => {
      window.removeEventListener('focus', bump);
      document.removeEventListener('visibilitychange', bump);
      window.clearInterval(id);
    };
  }, []);

  if (failed) {
    return (
      <main className="screen stack">
        <h1>MasterMath</h1>
        <p>{failed}</p>
      </main>
    );
  }
  if (!data) return <main className="screen" />;

  const now = Date.now();
  const due = dueState(data.worksheets, data.sides, data.corrections, now);
  const wsById = new Map(data.worksheets.map((w) => [w.id, w]));
  const draftWs = data.draft ? wsById.get(data.draft.worksheetId) : undefined;
  const nextIndex = data.worksheets.length + 1;
  // A “not what I wrote” was a misread, not her mistake: it counts as right for passing a block and for review.
  const judged = applyOverrides(data.sides, data.corrections);
  const upcoming = due.canStart && !data.draft ? composeWorksheet(judged) : null;

  const persist = (d: Draft): Promise<void> => {
    if (busy.current) return Promise.resolve(); // a hand-in is being saved; a late save would bring the draft back
    setData((x) => (x ? { ...x, draft: d } : x));
    return saveDraft(d).catch((err: unknown) => console.error('Could not save work in progress', err));
  };

  const persistInk = (d: Draft | undefined, code: string, ink: SideInkDraft): Promise<void> => {
    if (busy.current || !d) return Promise.resolve();
    setData((x) => (x ? { ...x, draftInk: { ...x.draftInk, [code]: ink } } : x));
    return saveDraftInk(d.worksheetId, d.round, code, ink).catch((err: unknown) => console.error('Could not save ink', err));
  };

  const open = (d: Draft) => {
    setData((x) => (x ? { ...x, draft: d, draftInk: {} } : x));
    saveDraft(d).catch((err: unknown) => console.error('Could not save work in progress', err));
    setView({ kind: 'work' });
  };

  const startWorksheet = () => {
    const sides = composeWorksheet(judged);
    if (!sides) return;
    open({ v: DRAFT_VERSION, kind: 'writing', worksheetId: newId(), current: 0, sides, sideMs: {}, visits: {}, startedAt: Date.now(), overrides: [], round: 0 });
  };

  /**
   * Her strokes for each “not what I wrote”, labelled with the digits she
   * meant, become handwriting templates: misreads turn into training data.
   */
  const learnFromOverrides = async (ws: WorksheetRecord, d: Draft): Promise<Map<string, BoxReading[]>> => {
    const labelled = new Map<string, BoxReading[]>();
    if (d.overrides.length === 0) return labelled;
    const previous =
      d.round - 1 === 0
        ? null
        : await loadCorrectionInk(data.corrections.find((c) => c.worksheetId === ws.id && c.round === d.round - 1)?.id ?? '');
    for (const o of d.overrides) {
      const side = ws.sides.find((s) => s.code === o.code);
      if (!side) continue;
      const item =
        previous
          ? previous.items.find((x) => x.code === o.code && x.item.position === o.position)?.item
          : (await loadSideInk(`${ws.id}:${o.code}`))?.rounds[0]?.items.find((x) => x.position === o.position);
      if (!item) continue;
      const labels = answerDigits(side.problems[o.position]!.answer);
      const boxes = item.boxes.map((b) => ({ ...b, trueLabel: labels[b.digitIndex] ?? null }));
      labelled.set(`${o.code}:${o.position}`, boxes);
      for (const b of boxes) {
        if (b.trueLabel === null || b.strokes.length === 0) continue;
        const t: Template = { id: newId(), digit: b.trueLabel, strokes: b.strokes, createdAt: Date.now(), source: 'override' };
        await saveTemplate(t);
        store.add(t);
      }
    }
    return labelled;
  };

  const startCorrections = (ws: WorksheetRecord) => {
    const fix = outstanding(ws, data.sides, data.corrections);
    const round = data.corrections.filter((c) => c.worksheetId === ws.id).length + 1;
    const first = ws.sides.findIndex((s) => fix.has(s.code));
    open({ v: DRAFT_VERSION, kind: 'correcting', worksheetId: ws.id, current: Math.max(0, first), sides: ws.sides, sideMs: {}, visits: {}, startedAt: Date.now(), overrides: [], round });
  };

  const handIn = async (d: Draft, answers: Map<string, RoundAnswer[]>) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const submittedAt = Date.now();
      if (d.kind === 'writing') {
        const activeMs = Object.values(d.sideMs).reduce((n, x) => n + x, 0);
        const ws: WorksheetRecord = { id: d.worksheetId, index: nextIndex, sides: d.sides, submittedAt, activeMs, sideMs: d.sideMs };
        const sides: SideRecord[] = d.sides.map((s, i) => {
          const items = mark(s.problems, 0, answers.get(s.code) ?? []);
          return {
            id: `${ws.id}:${s.code}`,
            worksheetId: ws.id,
            code: s.code,
            sheet: s.sheet,
            side: s.code.endsWith('a') ? 'a' : 'b',
            layout: s.layout,
            problems: s.problems,
            rounds: [{ round: 0, items }],
            firstPassCorrect: items.filter((it) => it.correct).length,
            total: items.length,
            activeMs: d.sideMs[s.code] ?? 0,
            startedAt: d.startedAt,
            completedAt: submittedAt + i,
          };
        });
        await handInWorksheet(ws, sides);
        await reload();
        setView({ kind: 'handed-in', ws });
        return;
      }
      const ws = wsById.get(d.worksheetId)!;
      const items: CorrectionRecord['items'] = [];
      for (const s of d.sides) {
        const a = answers.get(s.code);
        if (a) for (const item of mark(s.problems, d.round, a)) items.push({ code: s.code, item });
      }
      let labelled = new Map<string, BoxReading[]>();
      try {
        labelled = await learnFromOverrides(ws, d);
      } catch (err) {
        console.error('Could not keep the misread handwriting', err); // never blocks the corrections
      }
      for (const o of d.overrides) {
        const boxes = labelled.get(`${o.code}:${o.position}`) ?? [];
        items.push({ code: o.code, item: { position: o.position, round: d.round, firstStrokeMs: null, submittedMs: 0, given: null, correct: true, override: true, boxes } });
      }
      const c: CorrectionRecord = { id: newId(), worksheetId: ws.id, round: d.round, items, submittedAt };
      const left = outstanding(ws, data.sides, [...data.corrections, c]);
      const next: Draft | null =
        left.size > 0
          ? { ...d, round: d.round + 1, overrides: [], visits: {}, current: Math.max(0, ws.sides.findIndex((s) => left.has(s.code))) }
          : null;
      await handInCorrection(c, next);
      await reload();
      setView(next ? { kind: 'work' } : { kind: 'clean', ws });
    } catch (err) {
      console.error('Could not hand in', err);
      await saveDraft(d).catch(() => undefined); // keep the latest time and position for the retry
      setFailed('That didn’t save. Reload the page; nothing written is lost.');
    } finally {
      busy.current = false;
    }
  };

  if (view.kind === 'work' && data.draft) {
    if (!store.isReady()) {
      return (
        <main className="screen stack">
          <h1>Worksheet {draftWs?.index ?? nextIndex}</h1>
          <p data-testid="not-ready">Teach the app each number at least {config.ink.minTemplatesPerDigit} times first.</p>
          <div className="row">
            <button className="primary" onClick={onCalibrate}>
              Teach the app your handwriting
            </button>
            <button onClick={() => setView({ kind: 'home' })}>Back</button>
          </div>
        </main>
      );
    }
    const correcting = data.draft.kind === 'correcting' && draftWs;
    return (
      <WorksheetScreen
        key={`${data.draft.worksheetId}:${data.draft.round}`}
        store={store}
        draft={data.draft}
        ink={data.draftInk}
        childName={childName}
        title={`Worksheet ${draftWs?.index ?? nextIndex}`}
        fix={correcting ? outstanding(draftWs, data.sides, data.corrections) : undefined}
        lastRead={correcting ? lastReads(draftWs, data) : undefined}
        onSave={persist}
        onSaveInk={(code, ink) => persistInk(data.draft, code, ink)}
        onHandIn={(d, a) => void handIn(d, a)}
        onBack={() => setView({ kind: 'home' })}
      />
    );
  }

  if (view.kind === 'handed-in') {
    return (
      <main className="screen stack">
        <h1 data-testid="handed-in">Worksheet {view.ws.index} handed in</h1>
        <p style={{ fontSize: 'var(--text-problem)', margin: 0 }}>Time: {formatClock(view.ws.activeMs)}</p>
        <p>Your marks and corrections will be here tomorrow.</p>
        <button className="primary" onClick={() => setView({ kind: 'home' })}>
          Home
        </button>
      </main>
    );
  }

  if (view.kind === 'clean') {
    return (
      <main className="screen stack">
        <h1 data-testid="clean">Worksheet {view.ws.index} is 100%</h1>
        <button className="primary" onClick={() => setView({ kind: 'home' })}>
          Home
        </button>
      </main>
    );
  }

  const fixCount = (ws: WorksheetRecord) => [...outstanding(ws, data.sides, data.corrections).values()].reduce((n, ps) => n + ps.length, 0);
  const firstDue = due.correctionsDue[0];

  if (view.kind === 'parent') {
    return (
      <ParentView
        summary={parentSummary(data.worksheets, data.sides, data.corrections, now)}
        onClose={() => setView({ kind: 'home' })}
        onDevTomorrow={import.meta.env.DEV ? () => void shiftHistoryForTesting(86_400_000).then(reload).then(() => setView({ kind: 'home' })) : undefined}
      />
    );
  }

  // The parent view hides behind a press-and-hold on the title, so a child does not wander into it.
  const holdStart = () => {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => setView({ kind: 'parent' }), config.parent.holdMs);
  };
  const holdEnd = () => window.clearTimeout(holdTimer.current);

  const position = nextSide(judged);
  const sheetNow = position ? parseSheetCode(position.code).sheet : LAST_SHEET;
  const levelPct = Math.round(((position ? sheetNow - 1 : LAST_SHEET) / LAST_SHEET) * 100);
  const shown = new Date(new Date(now).getFullYear(), new Date(now).getMonth() + monthShift, 1);
  const today = new Date(now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  let task: {
    state: 'go' | 'fix' | 'rest';
    eyebrow: string;
    title: string;
    detail: string;
    /** Test hook naming what the detail line says. */
    detailId: string;
    note?: string;
    action?: { label: string; testid: string; run: () => void };
  };
  if (data.draft) {
    task = data.draft.kind === 'correcting'
      ? { state: 'fix', eyebrow: 'Corrections', title: `Worksheet ${draftWs?.index ?? ''}`, detail: 'Pick up where you stopped.', detailId: 'task-detail', action: { label: 'Continue corrections', testid: 'continue', run: () => setView({ kind: 'work' }) } }
      : { state: 'go', eyebrow: 'Today', title: `Worksheet ${nextIndex}`, detail: `${data.draft.sides[0]!.code}–${data.draft.sides[data.draft.sides.length - 1]!.code} · ${data.draft.sides[0]!.title}`, detailId: 'task-detail', action: { label: `Continue worksheet ${nextIndex}`, testid: 'continue', run: () => setView({ kind: 'work' }) } };
  } else if (firstDue) {
    task = { state: 'fix', eyebrow: 'Corrections first', title: `Worksheet ${firstDue.index}`, detail: `${fixCount(firstDue)} to correct before a new worksheet.`, detailId: 'corrections-due', action: { label: `Correct worksheet ${firstDue.index}`, testid: 'start-corrections', run: () => startCorrections(firstDue) } };
  } else if (upcoming) {
    task = {
      state: 'go',
      eyebrow: 'Today',
      title: `Worksheet ${nextIndex}`,
      detail: `${upcoming[0]!.code}–${upcoming[upcoming.length - 1]!.code} · ${upcoming[0]!.title}`,
      detailId: 'next-info',
      note: due.available > 1 ? `${due.available} worksheets waiting from missed days.` : undefined,
      action: { label: `Start worksheet ${nextIndex}`, testid: 'start', run: startWorksheet },
    };
  } else if (!position) {
    task = { state: 'rest', eyebrow: 'Level B', title: 'Level B is complete', detail: 'Every sheet from B101 to B200 is done.', detailId: 'level-done' };
  } else {
    task = {
      state: 'rest',
      eyebrow: 'Done for today',
      title: 'See you tomorrow',
      detail:
        due.waiting.length > 0
          ? `Worksheet ${due.waiting.map((w) => w.index).join(', ')} is being marked. Corrections and the next worksheet come tomorrow.`
          : 'The next worksheet comes tomorrow.',
      detailId: 'tomorrow',
    };
  }

  return (
    <main className="home">
      <header className="home-head">
        <div className="brand">
          <Logo size={52} />
          <div>
          <h1
            data-testid="home-title"
            onPointerDown={holdStart}
            onPointerUp={holdEnd}
            onPointerLeave={holdEnd}
            onPointerCancel={holdEnd}
            onContextMenu={(e) => e.preventDefault()}
            style={{ userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}
          >
            MasterMath
          </h1>
          <span className="hello" data-testid="hello">
            Hi, {childName}
          </span>
          <span className="date">{today}</span>
          </div>
        </div>
        <span className="level-pill">Level B</span>
      </header>

      <section className="card task" data-state={task.state}>
        <p className="eyebrow">{task.eyebrow}</p>
        <h2 data-testid="task-title">{task.title}</h2>
        <p className="detail" data-testid={task.detailId}>
          {task.detail}
        </p>
        {task.action && (
          <button className="primary" data-testid={task.action.testid} onClick={task.action.run}>
            {task.action.label}
          </button>
        )}
        {task.note && (
          <p className="note" data-testid="available">
            {task.note}
          </p>
        )}
      </section>

      <section className="card" aria-label="Level progress">
        <div className="level-row">
          <b>Level B</b>
          <span data-testid="level-position">{position ? `Sheet ${sheetNow} of ${LAST_SHEET}` : 'All 200 sheets done'}</span>
        </div>
        <div className="level-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={levelPct}>
          <div style={{ width: `${levelPct}%` }} />
        </div>
        {position && <p className="level-block">Now: {blockFor(sheetNow).title}</p>}
      </section>

      <Calendar
        year={shown.getFullYear()}
        month={shown.getMonth()}
        handedInAt={data.worksheets.map((w) => w.submittedAt)}
        now={now}
        onPrev={() => setMonthShift((m) => m - 1)}
        onNext={monthShift < 0 ? () => setMonthShift((m) => m + 1) : null}
      />

      <footer className="home-tools">
        <button onClick={onCalibrate}>Teach the app your handwriting</button>
        <button onClick={onTry}>Try it</button>
        <button onClick={onCheck}>Handwriting check</button>
      </footer>
    </main>
  );
}
