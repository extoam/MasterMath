import { useEffect, useState } from 'react';
import { blockFor, parseSheetCode } from '../curriculum/levelB';
import { loadSides, saveSide } from '../db/repo';
import { formatClock } from '../engine/activeClock';
import { config } from '../engine/config';
import { nextSide, reviewPool, sidesToday, type NextSide, type SideRecord } from '../engine/progress';
import { buildSide, type SideContent } from '../engine/sheet';
import { correctionRounds } from '../engine/worksheet';
import type { TemplateStore } from '../ink/templates';
import { Sheet } from './Sheet';

interface Props {
  store: TemplateStore;
  onCalibrate: () => void;
  onTry: () => void;
  onCheck: () => void;
}

type View =
  | { kind: 'home' }
  | { kind: 'sheet'; content: SideContent }
  | { kind: 'side-done'; record: SideRecord };

const target = () => config.daily.sheets * 2;

/** Home and today's set: one side after another until the day's sheets are done. */
export function Today({ store, onCalibrate, onTry, onCheck }: Props) {
  const [history, setHistory] = useState<SideRecord[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState<SideRecord | null>(null);
  const [view, setView] = useState<View>({ kind: 'home' });

  useEffect(() => {
    let cancelled = false;
    loadSides()
      .then((rows) => !cancelled && setHistory(rows))
      .catch((err: unknown) => {
        console.error('Could not load progress', err);
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadFailed) {
    return (
      <main className="screen stack">
        <h1>MasterMath</h1>
        <p>Progress could not be read. Reload the page to try again.</p>
      </main>
    );
  }
  if (!history) return <main className="screen" />;

  const now = Date.now();
  const doneToday = sidesToday(history, now);
  const next: NextSide | null = nextSide(history);
  const todayMs = history.filter((r) => new Date(r.completedAt).toDateString() === new Date(now).toDateString()).reduce((n, r) => n + r.activeMs, 0);

  const save = async (record: SideRecord) => {
    try {
      await saveSide(record);
      setSaveFailed(null);
      setHistory((h) => [...(h ?? []), record]);
      setView({ kind: 'side-done', record });
    } catch (err) {
      console.error('Could not save the side', err);
      setSaveFailed(record);
    }
  };

  const open = () => {
    if (!next) return;
    setView({ kind: 'sheet', content: buildSide(next.code, reviewPool(history)) });
  };

  if (saveFailed) {
    return (
      <main className="screen stack">
        <h1>Not saved yet</h1>
        <p>That sheet didn’t save. Try again.</p>
        <button className="primary" onClick={() => void save(saveFailed)}>
          Save again
        </button>
      </main>
    );
  }

  if (view.kind === 'sheet') {
    if (!store.isReady()) {
      return (
        <main className="screen stack">
          <h1>{view.content.code}</h1>
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
    return (
      <Sheet
        key={view.content.code}
        store={store}
        content={view.content}
        sideOfToday={doneToday + 1}
        sidesToday={target()}
        onDone={(r) => void save(r)}
        onBack={() => setView({ kind: 'home' })}
      />
    );
  }

  if (view.kind === 'side-done') {
    const r = view.record;
    const setDone = doneToday >= target();
    return (
      <main className="screen stack">
        <h1 data-testid="side-done">{r.code} done</h1>
        <p style={{ fontSize: 'var(--text-problem)', margin: 0 }} data-testid="side-time">
          Time: {formatClock(r.activeMs)}
        </p>
        <p className="muted" data-testid="side-rounds">
          Correction rounds: {correctionRounds({ facts: r.problems, round: 0, pending: [], rounds: r.rounds })} · Right first time: {r.firstPassCorrect} of {r.total}
        </p>
        {setDone ? (
          <>
            <p data-testid="set-done">Today’s set is done: {doneToday} sides in {formatClock(todayMs)}.</p>
            <button className="primary" onClick={() => setView({ kind: 'home' })}>
              Home
            </button>
          </>
        ) : next ? (
          <div className="row">
            <button className="primary" onClick={open} data-testid="next-side">
              Next: {next.code}
            </button>
            <button onClick={() => setView({ kind: 'home' })}>Home</button>
          </div>
        ) : (
          <p data-testid="level-done">Level B is complete.</p>
        )}
      </main>
    );
  }

  const nextBlock = next ? blockFor(parseSheetCode(next.code).sheet) : null;
  return (
    <main className="screen stack">
      <h1>MasterMath</h1>
      {next && nextBlock ? (
        <>
          <p data-testid="next-info" style={{ margin: 0 }}>
            Next: <b>{next.code}</b> · {nextBlock.title}
            {next.attempt > 1 && <span className="muted"> · again, round {next.attempt}</span>}
          </p>
          <p className="muted" data-testid="today-count">
            Today: {Math.min(doneToday, target())} of {target()} sides · {formatClock(todayMs)}
          </p>
          <button className="primary" onClick={open} data-testid="start" disabled={doneToday >= target()}>
            {doneToday === 0 ? 'Start today’s set' : doneToday >= target() ? 'Today’s set is done' : 'Continue'}
          </button>
        </>
      ) : (
        <p data-testid="level-done">Level B is complete.</p>
      )}
      <div className="row" style={{ marginTop: 'var(--space-5)' }}>
        <button onClick={onCalibrate}>Teach the app your handwriting</button>
        <button onClick={onTry}>Try it</button>
        <button onClick={onCheck}>Handwriting check</button>
      </div>
    </main>
  );
}
