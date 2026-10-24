import 'fake-indexeddb/auto';
import { deleteDB, openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, DB_VERSION, closeDb, openDb } from '../src/db/schema';
import { latestCheckRun, loadCheckItems, loadTemplates, newId, saveCheckItem, saveTemplate } from '../src/db/repo';
import type { StoredCheckItem } from '../src/ink/check';
import type { Template } from '../src/ink/templates';
import type { Digit } from '../src/ink/types';

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
    expect(db.version).toBe(2);
    expect([...db.objectStoreNames].sort()).toEqual(['check_items', 'templates']);
    expect((await loadTemplates()).map((t) => t.id)).toEqual(['keep-me']);
  });
});
