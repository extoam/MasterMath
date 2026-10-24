import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SideRecord } from '../engine/progress';
import type { CorrectionRecord, Draft, SideInkDraft, WorksheetRecord } from '../engine/schedule';
import type { StoredCheckItem } from '../ink/check';
import type { Template } from '../ink/templates';

/**
 * IndexedDB schema. Rows are append-only. Each version's upgrade is guarded by
 * `oldVersion`, so a database created at an earlier version gains only the
 * stores it is missing and keeps its data.
 *
 *   v1  templates     handwriting samples from calibration and overrides
 *   v2  check_items   answers from the handwriting check, by run
 *   v3  sides         completed worksheet sides (Kumon a/b): rounds and items, strokes stripped
 *   v4  side_ink      the strokes of each side, by side id; never loaded at startup
 *   v5  worksheets    handed-in daily worksheets
 *       corrections   correction rounds, by worksheet
 *       drafts        the one work-in-progress copy (mutable)
 *   v6  draft_ink     the draft's ink, one row per side, so a save writes one side (mutable)
 *       correction_ink  the strokes of each correction round; never loaded at startup
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
  side_ink: {
    key: string;
    value: SideInk;
  };
  worksheets: {
    key: string;
    value: WorksheetRecord;
    indexes: { 'by-submitted': number };
  };
  corrections: {
    key: string;
    value: CorrectionRecord;
    indexes: { 'by-submitted': number };
  };
  drafts: {
    key: string;
    value: Draft;
  };
  draft_ink: {
    key: string;
    value: { key: string; worksheetId: string; round: number; code: string; ink: SideInkDraft };
  };
  correction_ink: {
    key: string;
    value: CorrectionRecord;
  };
}

/** The full rounds of one side, strokes included: the retraining and replay record. */
export interface SideInk {
  id: string;
  rounds: SideRecord['rounds'];
}

export const DB_NAME = 'mastermath';
export const DB_VERSION = 6;

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
        if (oldVersion < 4) {
          db.createObjectStore('side_ink', { keyPath: 'id' });
        }
        if (oldVersion < 5) {
          db.createObjectStore('worksheets', { keyPath: 'id' }).createIndex('by-submitted', 'submittedAt');
          db.createObjectStore('corrections', { keyPath: 'id' }).createIndex('by-submitted', 'submittedAt');
          db.createObjectStore('drafts');
        }
        if (oldVersion < 6) {
          db.createObjectStore('draft_ink', { keyPath: 'key' });
          db.createObjectStore('correction_ink', { keyPath: 'id' });
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
