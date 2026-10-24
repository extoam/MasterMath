import { useEffect, useRef, useState } from 'react';
import { recogniserOptions } from '../app/inkSetup';
import { newId } from '../db/repo';
import { ActiveClock, formatClock } from '../engine/activeClock';
import { config } from '../engine/config';
import type { SideRecord } from '../engine/progress';
import type { SideContent } from '../engine/sheet';
import {
  acceptOverride,
  answerDigits,
  itemTimings,
  markRound,
  pickUndoTarget,
  startPage,
  type PageState,
  type RoundAnswer,
} from '../engine/worksheet';
import type { Tool } from '../ink/capture';
import { hasInk } from '../ink/normalise';
import { recognise } from '../ink/recogniser';
import type { TemplateStore } from '../ink/templates';
import type { Stroke } from '../ink/types';
import type { AnswerBoxHandle } from '../ui/AnswerBox';
import { ProblemView, type Mark } from '../ui/ProblemView';
import '../ui/Sheet.css';

interface Props {
  store: TemplateStore;
  content: SideContent;
  /** Shown in the header: “side 3 of 20 today”. */
  sideOfToday: number;
  sidesToday: number;
  onDone: (record: SideRecord) => void;
  onBack: () => void;
}

type Phase = 'writing' | 'marked';

interface BoxInk {
  hasInk: boolean;
  lastActionAt: number | null;
}

const boxKey = (round: number, position: number, digit: number) => `${round}-${position}-${digit}`;

/**
 * One side of a Kumon sheet on one screen. Problems are answered in order;
 * Submit marks the whole side; wrong problems come back, answers never shown,
 * until the side is clean. Then the side record goes to `onDone`.
 */
export function Sheet({ store, content, sideOfToday, sidesToday, onDone, onBack }: Props) {
  const [tool, setTool] = useState<Tool>('pen');
  const [phase, setPhase] = useState<Phase>('writing');
  const [page, setPage] = useState<PageState>(() => startPage(content.problems));
  const [roundStartedAt, setRoundStartedAt] = useState(() => performance.now());
  const [markedAt, setMarkedAt] = useState(0);
  const [inkByBox, setInkByBox] = useState<Record<string, BoxInk>>({});
  const [drawing, setDrawing] = useState<ReadonlySet<string>>(() => new Set());
  const [activeMs, setActiveMs] = useState(0);
  const startedAtWall = useRef(Date.now());
  const clock = useRef<ActiveClock | null>(null);
  if (!clock.current) clock.current = new ActiveClock({ idleTimeoutMs: config.worksheet.idleTimeoutMs });
  const boxes = useRef(new Map<string, AnswerBoxHandle>());

  useEffect(() => {
    const c = clock.current!;
    c.start(performance.now());
    const touch = (e: PointerEvent) => c.touch(e.timeStamp > 0 ? e.timeStamp : performance.now());
    window.addEventListener('pointerdown', touch, { passive: true });
    window.addEventListener('pointermove', touch, { passive: true });
    const tick = config.worksheet.showTimer
      ? window.setInterval(() => setActiveMs(c.activeMs(performance.now())), config.worksheet.timerTickMs)
      : undefined;
    return () => {
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('pointermove', touch);
      if (tick !== undefined) window.clearInterval(tick);
    };
  }, []);

  const last = page.rounds[page.rounds.length - 1];
  const viewRound = phase === 'marked' && last ? last.round : page.round;
  const positions = phase === 'marked' && last ? last.items.map((i) => i.position) : page.pending;
  const keysOf = (p: number) => answerDigits(page.facts[p]!.answer).map((_, d) => boxKey(viewRound, p, d));
  const filled = (p: number) => keysOf(p).every((k) => inkByBox[k]?.hasInk);
  const keysInView = positions.flatMap(keysOf);
  const canSubmit = phase === 'writing' && drawing.size === 0 && positions.every(filled);
  const undoTarget = pickUndoTarget(keysInView.map((key) => ({ key, lastActionAt: inkByBox[key]?.lastActionAt ?? null })));
  // In order: a problem unlocks once every earlier problem in this round has an answer.
  const firstOpen = positions.findIndex((p) => !filled(p));
  const isLocked = (i: number) => phase === 'writing' && firstOpen !== -1 && i > firstOpen;

  const onInkChange = (position: number, digit: number, strokes: Stroke[], isDrawing: boolean, lastActionAt: number | null) => {
    const key = boxKey(viewRound, position, digit);
    setInkByBox((m) => ({ ...m, [key]: { hasInk: hasInk(strokes, config.ink.minInkPathLengthPx), lastActionAt } }));
    setDrawing((d) => {
      if (d.has(key) === isDrawing) return d;
      const next = new Set(d);
      if (isDrawing) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const submit = () => {
    if (!canSubmit) return;
    const now = performance.now();
    const read = page.pending.map((position) => ({
      position,
      boxes: answerDigits(page.facts[position]!.answer).map((_, d) => {
        const strokes = boxes.current.get(boxKey(page.round, position, d))?.strokes() ?? [];
        const r = hasInk(strokes, config.ink.minInkPathLengthPx) ? recognise(strokes, store.candidates(), recogniserOptions) : null;
        return { read: r?.digit ?? null, confident: r?.confident ?? false, strokes };
      }),
    }));
    const timings = itemTimings(
      read.map((item) => ({ position: item.position, strokes: item.boxes.flatMap((b) => b.strokes) })),
      roundStartedAt,
      now,
    );
    setPage(markRound(page, read.map((item): RoundAnswer => ({ ...item, ...timings.get(item.position)! }))));
    setMarkedAt(now);
    setPhase('marked');
  };

  const next = () => {
    if (performance.now() - markedAt < config.worksheet.secondTapGuardMs) return;
    if (page.pending.length === 0) {
      const activeTotal = clock.current!.stop(performance.now());
      const first = page.rounds[0]!;
      onDone({
        id: newId(),
        code: content.code,
        sheet: content.sheet,
        side: content.code.endsWith('a') ? 'a' : 'b',
        layout: content.layout,
        problems: content.problems,
        rounds: page.rounds,
        // An accepted override was a misread, not a mistake.
        firstPassCorrect: first.items.filter((i) => i.correct).length,
        total: first.items.length,
        activeMs: activeTotal,
        startedAt: startedAtWall.current,
        completedAt: Date.now(),
      });
      return;
    }
    setRoundStartedAt(performance.now());
    setInkByBox({});
    setDrawing(new Set());
    setTool('pen');
    setPhase('writing');
  };

  const markFor = (position: number): { mark: Mark; readAs: string | null; prominent: boolean } => {
    const item = phase === 'marked' ? last?.items.find((i) => i.position === position) : undefined;
    if (!item || (item.correct && !item.override)) return { mark: null, readAs: null, prominent: false };
    if (item.override) return { mark: 'accepted', readAs: null, prominent: false };
    return {
      mark: 'wrong',
      readAs: item.boxes.map((b) => (b.read === null ? '?' : String(b.read))).join(''),
      prominent: item.boxes.some((b) => !b.confident),
    };
  };

  const box = content.layout === 'column' ? config.sheet.columnBoxPx : config.sheet.horizontalBoxPx;
  const rows = Math.ceil((content.layout === 'column' ? config.sheet.columnProblems : config.sheet.horizontalProblems) / 2);

  return (
    <main className="sheet" data-phase={phase} data-layout={content.layout}>
      <div className="toolbar">
        <div className="tools">
          <button onClick={onBack} data-testid="back">
            Back
          </button>
          <button
            onClick={() => undoTarget !== null && boxes.current.get(undoTarget)?.undo()}
            disabled={phase !== 'writing' || undoTarget === null}
            data-testid="undo"
          >
            Undo
          </button>
          <button
            onClick={() => setTool((t) => (t === 'pen' ? 'eraser' : 'pen'))}
            disabled={phase !== 'writing'}
            aria-pressed={tool === 'eraser'}
            data-testid="rubber"
          >
            Rubber
          </button>
        </div>
        {config.worksheet.showTimer && (
          <span className="timer" data-testid="timer" aria-label="Time">
            {formatClock(activeMs)}
          </span>
        )}
      </div>
      <div className="sheet-header">
        <span>
          <span className="code" data-testid="sheet-code">
            {content.code}
          </span>
          {content.title}
        </span>
        <span data-testid="side-count">
          {sideOfToday} of {sidesToday} today
        </span>
      </div>
      <div className="problems" style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        {positions.map((position, i) => {
          const m = markFor(position);
          return (
            <ProblemView
              key={`${viewRound}-${position}`}
              number={position + 1}
              fact={page.facts[position]!}
              layout={content.layout}
              box={box}
              tool={tool}
              disabled={phase !== 'writing'}
              locked={isLocked(i)}
              current={phase === 'writing' && i === firstOpen}
              mark={m.mark}
              readAs={m.readAs}
              overrideProminent={m.prominent}
              onOverride={
                m.mark === 'wrong' ? () => setPage((p) => (p.pending.includes(position) ? acceptOverride(p, position) : p)) : null
              }
              boxRef={(d, h) => {
                const k = boxKey(viewRound, position, d);
                if (h) boxes.current.set(k, h);
                else boxes.current.delete(k);
              }}
              onInkChange={(d, strokes, isDrawing, at) => onInkChange(position, d, strokes, isDrawing, at)}
            />
          );
        })}
      </div>
      <div className="sheet-footer">
        {phase === 'writing' ? (
          <button className="primary" onClick={submit} disabled={!canSubmit} data-testid="submit">
            Submit
          </button>
        ) : (
          <button className="primary" onClick={next} data-testid="next-round">
            {page.pending.length > 0 ? 'Try these again' : 'Done'}
          </button>
        )}
      </div>
    </main>
  );
}
