import { useEffect, useRef, useState } from 'react';
import { recogniserOptions } from '../app/inkSetup';
import { ActiveClock, formatClock } from '../engine/activeClock';
import { config } from '../engine/config';
import type { Draft } from '../engine/schedule';
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
import { ProgressBar, type ChipState } from '../ui/ProgressBar';
import '../ui/Sheet.css';

export const inkKey = (code: string, position: number, digit: number) => `${code}:${position}:${digit}`;

interface Props {
  store: TemplateStore;
  draft: Draft;
  /** “Worksheet 3”. */
  title: string;
  /** Correcting: positions still to fix per side code. */
  fix?: Map<string, number[]>;
  /** Correcting: what was read last time, per `${code}:${position}`. */
  lastRead?: Map<string, { readAs: string; prominent: boolean }>;
  onSave: (draft: Draft) => void;
  onHandIn: (draft: Draft, answers: Map<string, RoundAnswer[]>) => void;
  onBack: () => void;
}

/**
 * A whole worksheet: one side on screen at a time, a progress bar of sides,
 * problems in order. Writing: Next on every side, Submit only on the last;
 * nothing is marked until tomorrow. Correcting: only the circled problems,
 * sides with mistakes marked on the bar, Submit corrections on the last one.
 */
export function WorksheetScreen({ store, draft: initial, title, fix, lastRead, onSave, onHandIn, onBack }: Props) {
  const correcting = initial.kind === 'correcting';
  const [draft, setDraft] = useState(initial);
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
  const mark = useRef(0);
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

  /** Move the active time since the last mark onto the side on screen. */
  const withTime = (d: Draft): Draft => {
    const now = clock.current!.activeMs(performance.now());
    const code = d.sides[d.current]!.code;
    const out = { ...d, sideMs: { ...d.sideMs, [code]: (d.sideMs[code] ?? 0) + (now - mark.current) } };
    mark.current = now;
    return out;
  };

  const saveSoon = () => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => onSave(withTime(draftRef.current)), 800);
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
    return answerDigits(s.problems[p]!.answer).every((_, d) => hasInk(draft.ink[inkKey(s.code, p, d)] ?? [], config.ink.minInkPathLengthPx));
  };
  const sideFilled = (i: number) => toWrite(i).every((p) => problemFilled(i, p));

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
    if (i === draft.current || !reachable(i) || drawing.size > 0) return;
    const d = { ...withTime(draft), current: i };
    setDraft(d);
    setLastAction({});
    setTool('pen');
    window.clearTimeout(saveTimer.current);
    onSave(d);
  };

  const onInkChange = (p: number, digit: number, strokes: Stroke[], isDrawing: boolean, at: number | null) => {
    const key = inkKey(side.code, p, digit);
    setDraft((d) => ({ ...d, ink: { ...d.ink, [key]: strokes } }));
    setLastAction((m) => ({ ...m, [key]: at }));
    setDrawing((s) => {
      if (s.has(key) === isDrawing) return s;
      const n = new Set(s);
      if (isDrawing) n.add(key);
      else n.delete(key);
      return n;
    });
    saveSoon();
  };

  const handIn = () => {
    if (handedIn.current || !allFilled || drawing.size > 0) return;
    handedIn.current = true;
    window.clearTimeout(saveTimer.current);
    const final = withTime(draft);
    const answers = new Map<string, RoundAnswer[]>();
    final.sides.forEach((s, i) => {
      const positions = toWrite(i);
      if (positions.length === 0) return;
      const read = positions.map((p) => ({
        position: p,
        boxes: answerDigits(s.problems[p]!.answer).map((_, d) => {
          const strokes = final.ink[inkKey(s.code, p, d)] ?? [];
          const r = hasInk(strokes, config.ink.minInkPathLengthPx) ? recognise(strokes, store.candidates(), recogniserOptions) : null;
          return { read: r?.digit ?? null, confident: r?.confident ?? false, strokes };
        }),
      }));
      const ts = read.flatMap((x) => x.boxes.flatMap((b) => b.strokes.flat().map((pt) => pt.t)));
      const from = ts.length ? Math.min(...ts) : 0;
      const to = ts.length ? Math.max(...ts) : 0;
      const timings = itemTimings(read.map((x) => ({ position: x.position, strokes: x.boxes.flatMap((b) => b.strokes) })), from, to);
      answers.set(s.code, read.map((x) => ({ ...x, ...timings.get(x.position)! })));
    });
    onHandIn(final, answers);
  };

  // Work is saved as she goes, so Back loses nothing: the worksheet reopens where she left it.
  const back = () => {
    window.clearTimeout(saveTimer.current);
    onSave(withTime(draftRef.current));
    onBack();
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
  const totalMs = Object.values(draft.sideMs).reduce((n, x) => n + x, 0) + (clock.current.activeMs(performance.now()) - mark.current);
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
      <div className="sheet-header">
        <span>
          <span className="code" data-testid="sheet-code">
            {side.code}
          </span>
          {side.title}
        </span>
        <span data-testid="worksheet-title">
          {title}
          {correcting ? ' · corrections' : ''}
        </span>
      </div>
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
              ink={(d) => draft.ink[inkKey(side.code, p, d)]}
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
      <div className="sheet-footer">
        {draft.current === lastIndex ? (
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
