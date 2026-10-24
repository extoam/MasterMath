import { useEffect, useRef, useState } from 'react';
import { recogniserOptions } from '../app/inkSetup';
import { ActiveClock, formatClock } from '../engine/activeClock';
import { config } from '../engine/config';
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
import { demoPage } from '../seed/demoPage';
import type { AnswerBoxHandle } from '../ui/AnswerBox';
import { ProblemRow, type Mark } from '../ui/ProblemRow';
import '../ui/Worksheet.css';
import { PageComplete } from './PageComplete';

interface Props {
  store: TemplateStore;
  onBack: () => void;
}

/** writing: boxes live. marked: same boxes frozen with marks. complete: the page came clean. */
type Phase = 'writing' | 'marked' | 'complete';

interface BoxInk {
  hasInk: boolean;
  /** Time of the box's latest draw or erase still in effect: what page-level Undo picks by. */
  lastActionAt: number | null;
}

const boxKey = (round: number, position: number, digit: number) => `${round}-${position}-${digit}`;

/**
 * Build step 2: one hard-coded page. Write, Submit, the whole page is marked at
 * once, wrong items come back cleared until the page is clean. Everything is
 * held in memory; persistence is step 3.
 */
export function Worksheet({ store, onBack }: Props) {
  const [tool, setTool] = useState<Tool>('pen');
  const [phase, setPhase] = useState<Phase>('writing');
  const [page, setPage] = useState<PageState>(() => startPage(demoPage));
  const [roundStartedAt, setRoundStartedAt] = useState(() => performance.now());
  const [markedAt, setMarkedAt] = useState(0);
  const [inkByBox, setInkByBox] = useState<Record<string, BoxInk>>({});
  const [drawing, setDrawing] = useState<ReadonlySet<string>>(() => new Set());
  const [activeMs, setActiveMs] = useState(0);
  const clock = useRef<ActiveClock | null>(null);
  if (!clock.current) clock.current = new ActiveClock({ idleTimeoutMs: config.worksheet.idleTimeoutMs });
  const boxes = useRef(new Map<string, AnswerBoxHandle>());

  useEffect(() => {
    const c = clock.current!;
    c.start(performance.now());
    const touch = (e: PointerEvent) => c.touch(e.timeStamp > 0 ? e.timeStamp : performance.now());
    window.addEventListener('pointerdown', touch, { passive: true });
    window.addEventListener('pointermove', touch, { passive: true });
    const tick = window.setInterval(() => setActiveMs(c.activeMs(performance.now())), config.worksheet.timerTickMs);
    return () => {
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('pointermove', touch);
      window.clearInterval(tick);
    };
  }, []);

  if (!store.isReady()) {
    return (
      <main className="screen stack">
        <h1>Worksheet</h1>
        <p data-testid="not-ready">Teach the app each number at least {config.ink.minTemplatesPerDigit} times first.</p>
        <p className="muted">Still needed: {store.missingDigits().join(', ')}</p>
        <button onClick={onBack}>Back</button>
      </main>
    );
  }

  if (phase === 'complete') {
    return <PageComplete state={page} activeMs={activeMs} onDone={onBack} />;
  }

  const last = page.rounds[page.rounds.length - 1];
  const viewRound = phase === 'marked' && last ? last.round : page.round;
  const positions = phase === 'marked' && last ? last.items.map((i) => i.position) : page.pending;
  const keysInView = positions.flatMap((p) =>
    answerDigits(page.facts[p]!.answer).map((_, d) => boxKey(viewRound, p, d)),
  );
  const canSubmit = phase === 'writing' && drawing.size === 0 && keysInView.every((k) => inkByBox[k]?.hasInk);
  const undoTarget = pickUndoTarget(keysInView.map((key) => ({ key, lastActionAt: inkByBox[key]?.lastActionAt ?? null })));

  const onInkChange = (position: number, digit: number, strokes: Stroke[], isDrawing: boolean, lastActionAt: number | null) => {
    const key = boxKey(viewRound, position, digit);
    setInkByBox((m) => ({
      ...m,
      [key]: { hasInk: hasInk(strokes, config.ink.minInkPathLengthPx), lastActionAt },
    }));
    setDrawing((d) => {
      if (d.has(key) === isDrawing) return d;
      const next = new Set(d);
      if (isDrawing) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const undo = () => {
    if (undoTarget === null) return;
    boxes.current.get(undoTarget)?.undo();
  };

  const submit = () => {
    if (!canSubmit) return;
    const now = performance.now();
    const read = page.pending.map((position) => ({
      position,
      boxes: answerDigits(page.facts[position]!.answer).map((_, d) => {
        const strokes = boxes.current.get(boxKey(page.round, position, d))?.strokes() ?? [];
        const r = hasInk(strokes, config.ink.minInkPathLengthPx)
          ? recognise(strokes, store.candidates(), recogniserOptions)
          : null;
        return { read: r?.digit ?? null, confident: r?.confident ?? false, strokes };
      }),
    }));
    const timings = itemTimings(
      read.map((item) => ({ position: item.position, strokes: item.boxes.flatMap((b) => b.strokes) })),
      roundStartedAt,
      now,
    );
    const answers: RoundAnswer[] = read.map((item) => ({ ...item, ...timings.get(item.position)! }));
    setPage(markRound(page, answers));
    setMarkedAt(now);
    setPhase('marked');
  };

  const nextRound = () => {
    // The second tap of a double-tap on Submit lands here: ignore it, she has not seen the marks yet.
    if (performance.now() - markedAt < config.worksheet.secondTapGuardMs) return;
    if (page.pending.length === 0) {
      setActiveMs(clock.current!.stop(performance.now()));
      setPhase('complete');
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

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <main className="worksheet" data-phase={phase}>
      <div className="toolbar">
        <div className="tools">
          <button onClick={onBack} data-testid="back">
            Back
          </button>
          <button onClick={undo} disabled={phase !== 'writing' || undoTarget === null} data-testid="undo">
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
        <div className="fields">
          <span>
            Name <span className="name-rule" />
          </span>
          <span>Date {today}</span>
        </div>
        <span data-testid="page-number">Page 1</span>
      </div>
      <div className="problems">
        {positions.map((position) => {
          const m = markFor(position);
          return (
            <ProblemRow
              key={`${viewRound}-${position}`}
              position={position}
              fact={page.facts[position]!}
              tool={tool}
              disabled={phase !== 'writing'}
              mark={m.mark}
              readAs={m.readAs}
              overrideProminent={m.prominent}
              onOverride={
                m.mark === 'wrong'
                  ? () => setPage((p) => (p.pending.includes(position) ? acceptOverride(p, position) : p))
                  : null
              }
              boxRef={(d, h) => {
                const k = boxKey(viewRound, position, d);
                if (h) boxes.current.set(k, h);
                else boxes.current.delete(k);
              }}
              onInkChange={(d, strokes, isDrawing, lastActionAt) => onInkChange(position, d, strokes, isDrawing, lastActionAt)}
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
          <button className="primary" onClick={nextRound} data-testid="next-round">
            {page.pending.length > 0 ? 'Try these again' : 'Continue'}
          </button>
        )}
      </div>
    </main>
  );
}
