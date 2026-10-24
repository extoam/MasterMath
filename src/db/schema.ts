import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Template } from '../ink/templates';

/**
 * IndexedDB schema. Version 1 holds only `templates`; later build steps add the
 * families, facts, levels, pages, items, strokes and sessions stores in a new
 * version. Rows are append-only.
 */
export interface MasterMathDB extends DBSchema {
  templates: {
    key: string;
    value: Template;
    indexes: { 'by-digit': number };
  };
}

export const DB_NAME = 'mastermath';
export const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MasterMathDB>> | null = null;

export function openDb(): Promise<IDBPDatabase<MasterMathDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MasterMathDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const templates = db.createObjectStore('templates', { keyPath: 'id' });
        templates.createIndex('by-digit', 'digit');
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
