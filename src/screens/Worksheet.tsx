import { useEffect, useRef, useState } from 'react';
import { recogniserOptions } from '../app/inkSetup';
import { ActiveClock, formatClock } from '../engine/activeClock';
import { config } from '../engine/config';
import {
  acceptOverride,
  answerDigits,
  markRound,
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
  /** `t` of the last point of the last completed stroke: what page-level Undo picks by. */
  lastStrokeAt: number | null;
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
  const undoTarget = keysInView.reduce<{ key: string; at: number } | null>((best, k) => {
    const at = inkByBox[k]?.lastStrokeAt;
    return at != null && (best === null || at > best.at) ? { key: k, at } : best;
  }, null);

  const onInkChange = (position: number, digit: number, strokes: Stroke[], isDrawing: boolean) => {
    const key = boxKey(viewRound, position, digit);
    const lastStroke = strokes[strokes.length - 1];
    const lastPoint = lastStroke?.[lastStroke.length - 1];
    setInkByBox((m) => ({
      ...m,
      [key]: { hasInk: hasInk(strokes, config.ink.minInkPathLengthPx), lastStrokeAt: lastPoint?.t ?? null },
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
    if (!undoTarget) return;
    boxes.current.get(undoTarget.key)?.undo();
  };

  const submit = () => {
    if (!canSubmit) return;
    const now = performance.now();
    const answers: RoundAnswer[] = page.pending.map((position) => {
      let first: number | null = null;
      const reads = answerDigits(page.facts[position]!.answer).map((_, d) => {
        const h = boxes.current.get(boxKey(page.round, position, d));
        const strokes = h?.strokes() ?? [];
        const f = h?.firstStrokeAt() ?? null;
        if (f !== null && (first === null || f < first)) first = f;
        const r = hasInk(strokes, config.ink.minInkPathLengthPx)
          ? recognise(strokes, store.candidates(), recogniserOptions)
          : null;
        return { read: r?.digit ?? null, confident: r?.confident ?? false, strokes };
      });
      return {
        position,
        firstStrokeMs: first === null ? null : first - roundStartedAt,
        submittedMs: now - roundStartedAt,
        boxes: reads,
      };
    });
    setPage(markRound(page, answers));
    setPhase('marked');
  };

  const nextRound = () => {
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
              onOverride={m.mark === 'wrong' ? () => setPage((p) => acceptOverride(p, position)) : null}
              boxRef={(d, h) => {
                const k = boxKey(viewRound, position, d);
                if (h) boxes.current.set(k, h);
                else boxes.current.delete(k);
              }}
              onInkChange={(d, strokes, isDrawing) => onInkChange(position, d, strokes, isDrawing)}
            />
          );
        })}
      </div>
      <div className="sheet-footer">
        <button onClick={onBack}>Back</button>
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
