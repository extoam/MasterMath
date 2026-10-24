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
import { WorksheetScreen } from './WorksheetScreen';

interface Props {
  store: TemplateStore;
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

type View = { kind: 'home' } | { kind: 'work' } | { kind: 'handed-in'; ws: WorksheetRecord } | { kind: 'clean'; ws: WorksheetRecord };

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
export function Today({ store, onCalibrate, onTry, onCheck }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: 'home' });
  const busy = useRef(false);
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

  return (
    <main className="screen stack">
      <h1>MasterMath</h1>
      {data.draft ? (
        <button className="primary" data-testid="continue" onClick={() => setView({ kind: 'work' })}>
          {data.draft.kind === 'correcting' ? `Continue corrections · worksheet ${draftWs?.index ?? ''}` : `Continue worksheet ${nextIndex}`}
        </button>
      ) : firstDue ? (
        <>
          <p data-testid="corrections-due">
            Worksheet {firstDue.index} is marked: {fixCount(firstDue)} to correct before a new worksheet.
          </p>
          <button className="primary" data-testid="start-corrections" onClick={() => startCorrections(firstDue)}>
            Correct worksheet {firstDue.index}
          </button>
        </>
      ) : upcoming ? (
        <>
          <p data-testid="next-info" style={{ margin: 0 }}>
            Worksheet {nextIndex}: <b>{upcoming[0]!.code}</b>–<b>{upcoming[upcoming.length - 1]!.code}</b> · {upcoming[0]!.title}
          </p>
          {due.available > 1 && (
            <p className="muted" data-testid="available">
              {due.available} worksheets waiting from missed days.
            </p>
          )}
          <button className="primary" data-testid="start" onClick={startWorksheet}>
            Start worksheet {nextIndex}
          </button>
        </>
      ) : composeWorksheet(judged) === null ? (
        <p data-testid="level-done">Level B is complete.</p>
      ) : (
        <p data-testid="tomorrow">
          {due.waiting.length > 0
            ? `Worksheet ${due.waiting.map((w) => w.index).join(', ')} is being marked. Corrections and the next worksheet tomorrow.`
            : 'The next worksheet comes tomorrow.'}
        </p>
      )}
      {import.meta.env.DEV && (
        <button
          data-testid="dev-tomorrow"
          onClick={() => void shiftHistoryForTesting(86_400_000).then(reload)}
          style={{ borderStyle: 'dashed' }}
        >
          Test: pretend it’s tomorrow
        </button>
      )}
      <div className="row" style={{ marginTop: 'var(--space-5)' }}>
        <button onClick={onCalibrate}>Teach the app your handwriting</button>
        <button onClick={onTry}>Try it</button>
        <button onClick={onCheck}>Handwriting check</button>
      </div>
    </main>
  );
}
