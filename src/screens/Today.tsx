import { useEffect, useRef, useState } from 'react';
import {
  handInCorrection,
  handInWorksheet,
  loadCorrections,
  loadDraft,
  loadSides,
  loadWorksheets,
  newId,
  saveDraft,
} from '../db/repo';
import { formatClock } from '../engine/activeClock';
import { config } from '../engine/config';
import type { SideRecord } from '../engine/progress';
import {
  composeWorksheet,
  dueState,
  outstanding,
  type CorrectionRecord,
  type Draft,
  type WorksheetRecord,
} from '../engine/schedule';
import { markRound, type ItemRecord, type RoundAnswer } from '../engine/worksheet';
import type { TemplateStore } from '../ink/templates';
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
    const [worksheets, sides, corrections, draft] = await Promise.all([loadWorksheets(), loadSides(), loadCorrections(), loadDraft()]);
    setData({ worksheets, sides, corrections, draft });
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
  const upcoming = due.canStart && !data.draft ? composeWorksheet(data.sides) : null;

  const persist = (d: Draft) => {
    setData((x) => (x ? { ...x, draft: d } : x));
    saveDraft(d).catch((err: unknown) => console.error('Could not save work in progress', err));
  };

  const startWorksheet = () => {
    const sides = composeWorksheet(data.sides);
    if (!sides) return;
    const d: Draft = { kind: 'writing', worksheetId: newId(), current: 0, sides, ink: {}, sideMs: {}, startedAt: Date.now(), overrides: [], round: 0 };
    persist(d);
    setView({ kind: 'work' });
  };

  const startCorrections = (ws: WorksheetRecord) => {
    const fix = outstanding(ws, data.sides, data.corrections);
    const round = data.corrections.filter((c) => c.worksheetId === ws.id).length + 1;
    const first = ws.sides.findIndex((s) => fix.has(s.code));
    const d: Draft = { kind: 'correcting', worksheetId: ws.id, current: Math.max(0, first), sides: ws.sides, ink: {}, sideMs: {}, startedAt: Date.now(), overrides: [], round };
    persist(d);
    setView({ kind: 'work' });
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
      for (const o of d.overrides) {
        items.push({ code: o.code, item: { position: o.position, round: d.round, firstStrokeMs: null, submittedMs: 0, given: null, correct: true, override: true, boxes: [] } });
      }
      const c: CorrectionRecord = { id: newId(), worksheetId: ws.id, round: d.round, items, submittedAt };
      const left = outstanding(ws, data.sides, [...data.corrections, c]);
      const next: Draft | null =
        left.size > 0
          ? { ...d, round: d.round + 1, ink: {}, overrides: [], current: Math.max(0, ws.sides.findIndex((s) => left.has(s.code))) }
          : null;
      await handInCorrection(c, next);
      await reload();
      setView(next ? { kind: 'work' } : { kind: 'clean', ws });
    } catch (err) {
      console.error('Could not hand in', err);
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
        title={`Worksheet ${draftWs?.index ?? nextIndex}`}
        fix={correcting ? outstanding(draftWs, data.sides, data.corrections) : undefined}
        lastRead={correcting ? lastReads(draftWs, data) : undefined}
        onSave={persist}
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
      ) : composeWorksheet(data.sides) === null ? (
        <p data-testid="level-done">Level B is complete.</p>
      ) : (
        <p data-testid="tomorrow">
          {due.waiting.length > 0
            ? `Worksheet ${due.waiting.map((w) => w.index).join(', ')} is being marked. Corrections and the next worksheet tomorrow.`
            : 'The next worksheet comes tomorrow.'}
        </p>
      )}
      <div className="row" style={{ marginTop: 'var(--space-5)' }}>
        <button onClick={onCalibrate}>Teach the app your handwriting</button>
        <button onClick={onTry}>Try it</button>
        <button onClick={onCheck}>Handwriting check</button>
      </div>
    </main>
  );
}
