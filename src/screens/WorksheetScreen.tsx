import { useEffect, useRef, useState } from 'react';
import { recogniserOptions } from '../app/inkSetup';
import { ActiveClock, formatClock } from '../engine/activeClock';
import { config } from '../engine/config';
import type { Draft, SideInkDraft } from '../engine/schedule';
import { SideTimer } from '../engine/sideTimer';
import { answerDigits, itemTimings, type RoundAnswer } from '../engine/worksheet';
import type { Tool } from '../ink/capture';
import { hasInk } from '../ink/normalise';
import { recognise } from '../ink/recogniser';
import type { TemplateStore } from '../ink/templates';
import type { Stroke } from '../ink/types';
import type { AnswerBoxHandle } from '../ui/AnswerBox';
import { fitToRow } from '../ui/fit';
import { BackIcon, RubberIcon, UndoIcon } from '../ui/icons';
import { ProblemView } from '../ui/ProblemView';
import { PaperHeader } from '../ui/PaperHeader';
import { ProgressBar, type ChipState } from '../ui/ProgressBar';
import '../ui/Sheet.css';

/** Key of an answer box within a side's ink. */
export const boxKey = (position: number, digit: number) => `${position}:${digit}`;
/** Key of an answer box across the worksheet (undo target, box handles). */
const inkKey = (code: string, position: number, digit: number) => `${code}:${position}:${digit}`;

interface Props {
  store: TemplateStore;
  draft: Draft;
  /** Saved ink of this worksheet round, by side code. */
  ink: Record<string, SideInkDraft>;
  /** “Worksheet 3”. */
  title: string;
  /** Correcting: positions still to fix per side code. */
  fix?: Map<string, number[]>;
  /** Correcting: what was read last time, per `${code}:${position}`. */
  lastRead?: Map<string, { readAs: string; prominent: boolean }>;
  onSave: (draft: Draft) => Promise<void>;
  /** Save one side's ink (only the side that changed). */
  onSaveInk: (code: string, ink: SideInkDraft) => Promise<void>;
  onHandIn: (draft: Draft, answers: Map<string, RoundAnswer[]>) => void;
  onBack: () => void;
}

/**
 * A whole worksheet: one side on screen at a time, a progress bar of sides,
 * problems in order. Writing: Next on every side, Submit only on the last;
 * nothing is marked until tomorrow. Correcting: only the circled problems,
 * sides with mistakes marked on the bar, Submit corrections on the last one.
 */
export function WorksheetScreen({ store, draft: initial, ink: initialInk, title, fix, lastRead, onSave, onSaveInk, onHandIn, onBack }: Props) {
  const correcting = initial.kind === 'correcting';
  const [draft, setDraft] = useState<Draft>(() => {
    const code = initial.sides[initial.current]!.code;
    return { ...initial, visits: { ...initial.visits, [code]: [...(initial.visits[code] ?? []), Date.now()] } };
  });
  const [ink, setInk] = useState<Record<string, SideInkDraft>>(initialInk);
  const inkRef = useRef(ink);
  inkRef.current = ink;
  const dirtySides = useRef(new Set<string>());
  const [tool, setTool] = useState<Tool>('pen');
  const [lastAction, setLastAction] = useState<Record<string, number | null>>({});
  const [drawing, setDrawing] = useState<ReadonlySet<string>>(() => new Set());
  const [, setTick] = useState(0);
  const [rowPx, setRowPx] = useState<number | null>(null);
  const boxes = useRef(new Map<string, AnswerBoxHandle>());
  const handedIn = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const problemsRef = useRef<HTMLDivElement>(null);
  const clock = useRef<ActiveClock | null>(null);
  if (!clock.current) clock.current = new ActiveClock({ idleTimeoutMs: config.worksheet.idleTimeoutMs });
  const timer = useRef<SideTimer | null>(null);
  if (!timer.current) timer.current = new SideTimer(initial.sideMs, initial.sides[initial.current]!.code, 0);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const side = draft.sides[draft.current]!;
  const rows = Math.ceil((side.layout === 'column' ? config.sheet.columnProblems : config.sheet.horizontalProblems) / 2);

  useEffect(() => {
    const c = clock.current!;
    c.start(performance.now());
    const touch = (e: PointerEvent) => c.touch(e.timeStamp > 0 ? e.timeStamp : performance.now());
    window.addEventListener('pointerdown', touch, { passive: true });
    window.addEventListener('pointermove', touch, { passive: true });
    const tick = window.setInterval(() => setTick((t) => t + 1), config.worksheet.timerTickMs);
    return () => {
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('pointermove', touch);
      window.clearInterval(tick);
      window.clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    const el = problemsRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setRowPx(el.clientHeight / rows));
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows]);

  /** The draft with every side's active time so far. Reading it never loses time. */
  const timed = (d: Draft): Draft => ({ ...d, sideMs: timer.current!.snapshot(clock.current!.activeMs(performance.now())) });

  /** Write the draft and every side whose ink changed; resolves once they are stored. */
  const flush = (): Promise<void> => {
    window.clearTimeout(saveTimer.current);
    if (handedIn.current) return Promise.resolve();
    const writes = [...dirtySides.current].map((code) => onSaveInk(code, inkRef.current[code] ?? {}));
    dirtySides.current.clear();
    writes.push(onSave(timed(draftRef.current)));
    return Promise.all(writes).then(() => undefined);
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Closing or hiding the app saves at once, not 800 ms later.
  useEffect(() => {
    const now = () => void flushRef.current();
    const hidden = () => document.visibilityState === 'hidden' && now();
    window.addEventListener('pagehide', now);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', now);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);

  const saveSoon = () => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flush(), 800);
  };

  const overridden = (code: string, p: number) => draft.overrides.some((o) => o.code === code && o.position === p);
  /** Problems she writes on side `i` in this visit. */
  const toWrite = (i: number): number[] => {
    const s = draft.sides[i]!;
    if (!correcting) return s.problems.map((_, p) => p);
    return (fix?.get(s.code) ?? []).filter((p) => !overridden(s.code, p));
  };
  const shown = (i: number): number[] => {
    const s = draft.sides[i]!;
    return correcting ? fix?.get(s.code) ?? [] : s.problems.map((_, p) => p);
  };
  const problemFilled = (i: number, p: number) => {
    const s = draft.sides[i]!;
    return answerDigits(s.problems[p]!.answer).every((_, d) => hasInk(ink[s.code]?.[boxKey(p, d)] ?? [], config.ink.minInkPathLengthPx));
  };
  // Once per render: every chip, Next and Submit read these.
  const filledBySide = draft.sides.map((_, i) => toWrite(i).every((p) => problemFilled(i, p)));
  const sideFilled = (i: number) => filledBySide[i]!;

  const indices = draft.sides.map((_, i) => i);
  const fixSides = correcting ? indices.filter((i) => toWrite(i).length > 0) : indices;
  const reachable = (i: number) => (correcting ? toWrite(i).length > 0 : indices.slice(0, i).every(sideFilled));
  const states: ChipState[] = indices.map((i) => {
    if (correcting) return toWrite(i).length > 0 ? 'fix' : 'clean';
    if (sideFilled(i)) return 'done';
    return reachable(i) ? 'todo' : 'locked';
  });
  const allFilled = fixSides.every(sideFilled);
  const lastIndex = fixSides[fixSides.length - 1] ?? draft.current;
  const nextIndex = fixSides.find((i) => i > draft.current);

  const go = (i: number) => {
    if (i === draft.current || !reachable(i) || drawing.size > 0 || handedIn.current) return;
    const code = draft.sides[i]!.code;
    timer.current!.switchTo(code, clock.current!.activeMs(performance.now()));
    const d = { ...draft, current: i, visits: { ...draft.visits, [code]: [...(draft.visits[code] ?? []), Date.now()] } };
    draftRef.current = d;
    setDraft(d);
    setLastAction({});
    setTool('pen');
    void flush();
  };

  const onInkChange = (p: number, digit: number, strokes: Stroke[], isDrawing: boolean, at: number | null) => {
    const key = inkKey(side.code, p, digit);
    const k = boxKey(p, digit);
    const before = inkRef.current[side.code]?.[k] ?? [];
    const changed = before.length !== strokes.length || before[before.length - 1]?.length !== strokes[strokes.length - 1]?.length;
    if (changed) {
      const next = { ...inkRef.current, [side.code]: { ...(inkRef.current[side.code] ?? {}), [k]: strokes } };
      inkRef.current = next;
      setInk(next);
      dirtySides.current.add(side.code);
    }
    setLastAction((m) => ({ ...m, [key]: at }));
    setDrawing((s) => {
      if (s.has(key) === isDrawing) return s;
      const n = new Set(s);
      if (isDrawing) n.add(key);
      else n.delete(key);
      return n;
    });
    if (changed) saveSoon();
  };

  const handIn = () => {
    if (handedIn.current || !allFilled || drawing.size > 0) return;
    void flush(); // save everything first: if the hand-in fails, nothing written is lost
    handedIn.current = true;
    const final = timed(draftRef.current);
    const answers = new Map<string, RoundAnswer[]>();
    final.sides.forEach((s, i) => {
      const positions = toWrite(i);
      if (positions.length === 0) return;
      const read = positions.map((p) => ({
        position: p,
        boxes: answerDigits(s.problems[p]!.answer).map((_, d) => {
          const strokes = inkRef.current[s.code]?.[boxKey(p, d)] ?? [];
          const r = hasInk(strokes, config.ink.minInkPathLengthPx) ? recognise(strokes, store.candidates(), recogniserOptions) : null;
          return { read: r?.digit ?? null, confident: r?.confident ?? false, strokes };
        }),
      }));
      const ts = read.flatMap((x) => x.boxes.flatMap((b) => b.strokes.flat().map((pt) => pt.t)));
      const timings = itemTimings(
        read.map((x) => ({ position: x.position, strokes: x.boxes.flatMap((b) => b.strokes) })),
        final.visits[s.code] ?? [Math.min(...ts)],
        ts.length ? Math.max(...ts) : Date.now(),
      );
      answers.set(s.code, read.map((x) => ({ ...x, ...timings.get(x.position)! })));
    });
    onHandIn(final, answers);
  };

  // Work is saved as she goes, so Back loses nothing: the worksheet reopens where she left it.
  const leaving = useRef(false);
  const back = () => {
    if (handedIn.current || leaving.current) return; // Submit is being saved: leaving now could bring the draft back
    leaving.current = true;
    // Leave once everything is stored, so nothing written can be lost on the way out.
    flush()
      .catch((err: unknown) => console.error('Could not save before leaving', err))
      .finally(onBack);
  };

  const positions = shown(draft.current);
  const writable = toWrite(draft.current);
  const firstOpen = writable.findIndex((p) => !problemFilled(draft.current, p));
  const keysOnSide = writable.flatMap((p) => answerDigits(side.problems[p]!.answer).map((_, d) => inkKey(side.code, p, d)));
  const undoTarget = keysOnSide.reduce<string | null>((best, k) => {
    const at = lastAction[k];
    return at != null && (best === null || at > (lastAction[best] ?? -Infinity)) ? k : best;
  }, null);
  const fit = fitToRow(side.layout, rowPx);
  const totalMs = Object.values(timer.current.snapshot(clock.current.activeMs(performance.now()))).reduce((n, x) => n + x, 0);
  const half = rows;

  return (
    <main className="sheet" data-mode={draft.kind} data-layout={side.layout} data-code={side.code}>
      <div className="toolbar">
        <div className="tools">
          <button onClick={back} data-testid="back" aria-label="Back" className="icon">
            <BackIcon />
          </button>
          <button
            className="icon"
            onClick={() => undoTarget && boxes.current.get(undoTarget)?.undo()}
            disabled={undoTarget === null}
            aria-label="Undo"
            data-testid="undo"
          >
            <UndoIcon />
          </button>
          <button
            className="icon"
            onClick={() => setTool((t) => (t === 'pen' ? 'eraser' : 'pen'))}
            aria-pressed={tool === 'eraser'}
            aria-label="Rubber"
            data-testid="rubber"
          >
            <RubberIcon />
          </button>
        </div>
        {config.worksheet.showTimer && (
          <span className="timer" data-testid="timer" aria-label="Time">
            {formatClock(totalMs)}
          </span>
        )}
      </div>
      <ProgressBar
        codes={draft.sides.map((s) => s.code)}
        states={states}
        current={draft.current}
        counts={correcting ? indices.map((i) => toWrite(i).length) : undefined}
        onSelect={go}
      />
      <article className="paper" aria-label={`Sheet ${side.code}`}>
        <PaperHeader code={side.code} title={side.title} sheetLabel={`${title}${correcting ? ' · corrections' : ''}`} started={draft.visits[side.code]?.[0] ?? draft.startedAt} />
      <div
        className="problems"
        ref={problemsRef}
        style={
          {
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            '--fact-font': `${fit.font}px`,
            '--stack-font': `${fit.font}px`,
          } as React.CSSProperties
        }
      >
        {positions.map((p) => {
          const accepted = correcting && overridden(side.code, p);
          const idx = writable.indexOf(p);
          const prev = lastRead?.get(`${side.code}:${p}`);
          return (
            <ProblemView
              key={`${side.code}:${draft.round}:${p}`}
              number={p + 1}
              fact={side.problems[p]!}
              layout={side.layout}
              box={fit.box}
              tool={tool}
              disabled={accepted}
              locked={idx > firstOpen && firstOpen !== -1}
              current={idx === firstOpen}
              mark={correcting ? (accepted ? 'accepted' : 'wrong') : null}
              readAs={prev?.readAs ?? null}
              overrideProminent={prev?.prominent ?? false}
              onOverride={
                correcting && !accepted && prev
                  ? () => {
                      setDraft((d) => ({ ...d, overrides: [...d.overrides, { code: side.code, position: p }] }));
                      saveSoon();
                    }
                  : null
              }
              ink={(d) => ink[side.code]?.[boxKey(p, d)]}
              style={{ gridColumn: p < half ? 1 : 2, gridRow: (p % half) + 1 }}
              boxRef={(d, h) => {
                const k = inkKey(side.code, p, d);
                if (h) boxes.current.set(k, h);
                else boxes.current.delete(k);
              }}
              onInkChange={(d, strokes, isDrawing, at) => onInkChange(p, d, strokes, isDrawing, at)}
            />
          );
        })}
      </div>
        <span className="paper-foot">{side.code}</span>
      </article>
      <div className="sheet-footer">
        {draft.current === lastIndex || nextIndex === undefined ? (
          <button className="primary" onClick={handIn} disabled={!allFilled || drawing.size > 0} data-testid="submit">
            {correcting ? 'Submit corrections' : 'Submit'}
          </button>
        ) : (
          <button
            className="primary"
            onClick={() => nextIndex !== undefined && go(nextIndex)}
            disabled={nextIndex === undefined || (!correcting && !sideFilled(draft.current)) || drawing.size > 0}
            data-testid="next-sheet"
          >
            Next sheet
          </button>
        )}
      </div>
    </main>
  );
}
