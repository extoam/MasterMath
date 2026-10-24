import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SideRecord } from '../engine/progress';
import type { StoredCheckItem } from '../ink/check';
import type { Template } from '../ink/templates';

/**
 * IndexedDB schema. Rows are append-only. Each version's upgrade is guarded by
 * `oldVersion`, so a database created at an earlier version gains only the
 * stores it is missing and keeps its data.
 *
 *   v1  templates     handwriting samples from calibration and overrides
 *   v2  check_items   answers from the handwriting check, by run
 *   v3  sides         completed worksheet sides (Kumon a/b), with every round, item and stroke
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
  sides: {
    key: string;
    value: SideRecord;
    indexes: { 'by-completed': number };
  };
}

export const DB_NAME = 'mastermath';
export const DB_VERSION = 3;

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
        if (oldVersion < 3) {
          db.createObjectStore('sides', { keyPath: 'id' }).createIndex('by-completed', 'completedAt');
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
