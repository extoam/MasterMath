import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { StoredCheckItem } from '../ink/check';
import type { Template } from '../ink/templates';

/**
 * IndexedDB schema. Rows are append-only. Each version's upgrade is guarded by
 * `oldVersion`, so a database created at an earlier version gains only the
 * stores it is missing and keeps its data.
 *
 *   v1  templates     handwriting samples from calibration and overrides
 *   v2  check_items   answers from the handwriting check, by run
 *
 * Later build steps add families, facts, levels, pages, items, strokes and sessions.
 */
export interface MasterMathDB extends DBSchema {
  templates: {
    key: string;
    value: Template;
    indexes: { 'by-digit': number };
  };
  check_items: {
    key: string;
    value: StoredCheckItem;
    indexes: { 'by-run': string };
  };
}

export const DB_NAME = 'mastermath';
export const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<MasterMathDB>> | null = null;

export function openDb(): Promise<IDBPDatabase<MasterMathDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MasterMathDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('templates', { keyPath: 'id' }).createIndex('by-digit', 'digit');
        }
        if (oldVersion < 2) {
          db.createObjectStore('check_items', { keyPath: 'id' }).createIndex('by-run', 'runId');
        }
      },
      blocking() {
        // A newer version is opening elsewhere; release this connection.
        void closeDb();
      },
    }).catch((err: unknown) => {
      dbPromise = null; // a failed open must not poison every later call
      throw err;
    });
  }
  return dbPromise;
}

export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  const pending = dbPromise;
  dbPromise = null;
  (await pending).close();
}
