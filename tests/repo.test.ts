import 'fake-indexeddb/auto';
import { deleteDB, openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, DB_VERSION, closeDb, openDb } from '../src/db/schema';
import { clearDraft, handInCorrection, handInWorksheet, exportHandwriting, latestCheckRun, loadCorrections, loadDraft, loadSideInk, loadSides, loadWorksheets, saveCorrection, saveDraft, saveSide, saveWorksheet, loadCheckItems, loadTemplates, newId, saveCheckItem, saveTemplate } from '../src/db/repo';
import type { StoredCheckItem } from '../src/ink/check';
import type { Template } from '../src/ink/templates';
import type { Digit } from '../src/ink/types';
import type { SideRecord } from '../src/engine/progress';

function template(overrides: Partial<Template> = {}): Template {
  return {
    id: newId(),
    digit: 4,
    strokes: [[{ x: 1, y: 2, t: 3, pressure: 0.4 }, { x: 5, y: 6, t: 7, pressure: 0.8 }]],
    createdAt: 1_700_000_000_000,
    source: 'calibration',
    ...overrides,
  };
}

beforeEach(async () => {
  await closeDb();
  await deleteDB(DB_NAME);
});

describe('templates repo', () => {

  it('round-trips a template through IndexedDB', async () => {
    const t = template();
    await saveTemplate(t);
    expect(await loadTemplates()).toEqual([t]);
  });

  it('appends rows and returns them oldest first', async () => {
    const later = template({ createdAt: 2_000 });
    const earlier = template({ createdAt: 1_000 });
    await saveTemplate(later);
    await saveTemplate(earlier);
    const rows = await loadTemplates();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.createdAt)).toEqual([1_000, 2_000]);
  });

  it('issues distinct ids', () => {
    expect(newId()).not.toBe(newId());
  });
});

describe('repo on a plain-HTTP tablet (no secure context)', () => {
  it('newId still issues v4 UUIDs when crypto.randomUUID is absent', () => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const id = newId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(newId()).not.toBe(id);
    } finally {
      // Removing the own property restores the prototype method.
      delete (crypto as unknown as Record<string, unknown>)['randomUUID'];
    }
  });
});

describe('openDb after a failed attempt', () => {
  it('retries instead of caching the rejection', async () => {
    await closeDb();
    await deleteDB(DB_NAME);
    const blocker = await openDB(DB_NAME, DB_VERSION + 1);
    await expect(openDb()).rejects.toThrow(); // VersionError: the store is already a newer version
    blocker.close();
    await deleteDB(DB_NAME);
    await expect(openDb()).resolves.toBeTruthy();
  });
});

describe('check items', () => {
  function item(runId: string, index: number, prompt: Digit, read: Digit | null): StoredCheckItem {
    return { id: newId(), runId, index, prompt, read, confident: read !== null, score: read === null ? null : 2.5, runnerUpScore: read === null ? null : 3.1, createdAt: 1_000 + index };
  }

  it('saves items and loads a run in order', async () => {
    await saveCheckItem(item('run-a', 1, 7, 7));
    await saveCheckItem(item('run-a', 0, 3, null));
    const rows = await loadCheckItems('run-a');
    expect(rows.map((r) => r.index)).toEqual([0, 1]);
    expect(rows[1]!.score).toBe(2.5);
  });

  it('finds the most recent run with its items', async () => {
    await saveCheckItem({ ...item('run-old', 0, 1, 1), createdAt: 10 });
    await saveCheckItem({ ...item('run-new', 0, 2, 2), createdAt: 20 });
    await saveCheckItem({ ...item('run-new', 1, 4, 4), createdAt: 30 });
    const latest = await latestCheckRun();
    expect(latest?.runId).toBe('run-new');
    expect(latest?.items.map((i) => i.prompt)).toEqual([2, 4]);
  });

  it('returns null when no check has been started', async () => {
    expect(await latestCheckRun()).toBeNull();
  });
});

describe('schema upgrade from version 1', () => {
  it('keeps templates and adds the check store when a v1 database is opened', async () => {
    await closeDb();
    await deleteDB(DB_NAME);
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('templates', { keyPath: 'id' }).createIndex('by-digit', 'digit');
      },
    });
    await v1.add('templates', template({ id: 'keep-me' }));
    v1.close();
    const db = await openDb();
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(['check_items', 'corrections', 'drafts', 'side_ink', 'sides', 'templates', 'worksheets']);
    expect((await loadTemplates()).map((t) => t.id)).toEqual(['keep-me']);
  });
});

describe('exportHandwriting', () => {
  it('bundles every template and every check answer with a format version', async () => {
    const t = template({ digit: 9 });
    await saveTemplate(t);
    const item = { id: newId(), runId: 'r', index: 0, prompt: 4 as Digit, read: 9 as Digit, confident: false, score: 2, runnerUpScore: 2.1, createdAt: 5 };
    await saveCheckItem(item);
    const out = await exportHandwriting(1234);
    expect(out.format).toBe('mastermath-handwriting-v1');
    expect(out.exportedAt).toBe(1234);
    expect(out.templates).toEqual([t]);
    expect(out.checkItems).toEqual([item]);
  });
});

describe('sides', () => {
  const side = (id: string, completedAt: number): SideRecord => ({
    id, code: 'B101a', sheet: 101, side: 'a', layout: 'horizontal',
    problems: [{ op: '−', a: 10, b: 3, answer: 7 }],
    rounds: [{ round: 0, items: [] }], firstPassCorrect: 1, total: 1, activeMs: 30_000, startedAt: completedAt - 30_000, completedAt,
  });

  it('appends completed sides and loads them oldest first', async () => {
    await saveSide(side('later', 2_000));
    await saveSide(side('earlier', 1_000));
    expect((await loadSides()).map((s) => s.id)).toEqual(['earlier', 'later']);
  });

  it('never overwrites a saved side, and saving the same side again is harmless', async () => {
    await saveSide(side('x', 1_000));
    await saveSide(side('x', 1_000));
    expect((await loadSides()).map((s) => [s.id, s.completedAt])).toEqual([['x', 1_000]]);
    await expect(saveSide(side('x', 5_000))).rejects.toThrow();
  });

  it('keeps strokes out of the progress list and stores them separately', async () => {
    const withInk = side('ink', 1_000);
    const stroke = [{ x: 1, y: 2, t: 3, pressure: 0.5 }];
    withInk.rounds = [{ round: 0, items: [{ position: 0, round: 0, firstStrokeMs: 500, submittedMs: 900, given: 7, correct: true, override: false,
      boxes: [{ digitIndex: 0, read: 7, confident: true, strokes: [stroke], trueLabel: null }] }] }];
    await saveSide(withInk);
    const [loaded] = await loadSides();
    expect(loaded!.rounds[0]!.items[0]!.boxes[0]!.strokes).toEqual([]);
    expect(loaded!.rounds[0]!.items[0]!.boxes[0]!.read).toBe(7);
    const ink = await loadSideInk('ink');
    expect(ink?.rounds[0]!.items[0]!.boxes[0]!.strokes).toEqual([stroke]);
  });

  it('keeps templates and check answers when a v2 database is upgraded', async () => {
    await closeDb();
    await deleteDB(DB_NAME);
    const v2 = await openDB(DB_NAME, 2, {
      upgrade(db) {
        db.createObjectStore('templates', { keyPath: 'id' }).createIndex('by-digit', 'digit');
        db.createObjectStore('check_items', { keyPath: 'id' }).createIndex('by-run', 'runId');
      },
    });
    await v2.add('templates', template({ id: 'keep-template' }));
    v2.close();
    expect((await loadTemplates()).map((t) => t.id)).toEqual(['keep-template']);
    expect(await loadSides()).toEqual([]);
  });
});

describe('worksheets, corrections and the draft', () => {
  it('appends worksheets and corrections and loads them in order', async () => {
    await saveWorksheet({ id: 'w2', index: 2, sides: [], submittedAt: 2_000, activeMs: 1, sideMs: {} });
    await saveWorksheet({ id: 'w1', index: 1, sides: [], submittedAt: 1_000, activeMs: 1, sideMs: {} });
    expect((await loadWorksheets()).map((w) => w.id)).toEqual(['w1', 'w2']);
    await saveCorrection({ id: 'c1', worksheetId: 'w1', round: 1, items: [], submittedAt: 3_000 });
    expect((await loadCorrections()).map((c) => c.id)).toEqual(['c1']);
    await expect(saveWorksheet({ id: 'w1', index: 9, sides: [], submittedAt: 9, activeMs: 1, sideMs: {} })).rejects.toThrow();
  });

  it('keeps one draft of the work in progress, replaced on save and gone when cleared', async () => {
    expect(await loadDraft()).toBeUndefined();
    await saveDraft({ kind: 'writing', worksheetId: 'w1', current: 0, ink: {}, sideMs: {}, sides: [], startedAt: 1, overrides: [], round: 0 });
    await saveDraft({ kind: 'writing', worksheetId: 'w1', current: 3, ink: {}, sideMs: {}, sides: [], startedAt: 1, overrides: [], round: 0 });
    expect((await loadDraft())?.current).toBe(3);
    await clearDraft();
    expect(await loadDraft()).toBeUndefined();
  });
});

describe('handing in', () => {
  const draft = { kind: 'writing' as const, worksheetId: 'w1', current: 0, ink: {}, sideMs: {}, sides: [], startedAt: 1, overrides: [], round: 0 };
  it('a worksheet saves the worksheet and its sides and clears the draft together', async () => {
    await saveDraft(draft);
    const s = { id: 'w1:B101a', worksheetId: 'w1', code: 'B101a', sheet: 101, side: 'a' as const, layout: 'horizontal' as const,
      problems: [], rounds: [{ round: 0, items: [] }], firstPassCorrect: 0, total: 0, activeMs: 1, startedAt: 1, completedAt: 2 };
    await handInWorksheet({ id: 'w1', index: 1, sides: [], submittedAt: 2, activeMs: 1, sideMs: {} }, [s]);
    expect((await loadWorksheets()).map((w) => w.id)).toEqual(['w1']);
    expect((await loadSides()).map((x) => x.id)).toEqual(['w1:B101a']);
    expect(await loadDraft()).toBeUndefined();
  });

  it('a correction round either clears the draft or replaces it with the next round', async () => {
    await saveDraft(draft);
    await handInCorrection({ id: 'c1', worksheetId: 'w1', round: 1, items: [], submittedAt: 3 }, { ...draft, kind: 'correcting', round: 2 });
    expect((await loadDraft())?.round).toBe(2);
    await handInCorrection({ id: 'c2', worksheetId: 'w1', round: 2, items: [], submittedAt: 4 }, null);
    expect(await loadDraft()).toBeUndefined();
    expect((await loadCorrections()).map((c) => c.id)).toEqual(['c1', 'c2']);
  });
});
