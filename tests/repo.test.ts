import 'fake-indexeddb/auto';
import { deleteDB, openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, closeDb, openDb } from '../src/db/schema';
import { loadTemplates, newId, saveTemplate } from '../src/db/repo';
import type { Template } from '../src/ink/templates';

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

describe('templates repo', () => {
  beforeEach(async () => {
    await closeDb();
    await deleteDB(DB_NAME);
  });

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
    const blocker = await openDB(DB_NAME, 2);
    await expect(openDb()).rejects.toThrow(); // VersionError: asked for v1, store is v2
    blocker.close();
    await deleteDB(DB_NAME);
    await expect(openDb()).resolves.toBeTruthy();
  });
});
