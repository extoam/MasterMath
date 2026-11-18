import type { StoreNames } from 'idb';
import { DB_VERSION, openDb, type MasterMathDB } from './schema';

/**
 * A backup is one JSON file holding every record on the tablet: her name,
 * handwriting, worksheets, corrections, ink, the work in progress and the
 * parent's decisions. It is saved where the parent chooses (Files, Drive,
 * email) and restored on this or a new tablet. Nothing is sent anywhere.
 */
export const BACKUP_FORMAT = 'mastermath-backup-v1';

type Name = StoreNames<MasterMathDB>;

/** Stores whose rows carry their own key (keyPath). */
const KEYED: Name[] = ['templates', 'check_items', 'sides', 'side_ink', 'worksheets', 'corrections', 'correction_ink', 'draft_ink', 'decisions', 'remarks'];
/** Stores keyed from outside the row: saved as [key, value] pairs. */
const UNKEYED: Name[] = ['drafts', 'settings'];

export interface Backup {
  format: typeof BACKUP_FORMAT;
  /** The schema version that wrote it; a newer one than this app's cannot be restored. */
  dbVersion: number;
  exportedAt: number;
  stores: Partial<Record<Name, unknown[]>>;
  pairs: Partial<Record<Name, Array<[IDBValidKey, unknown]>>>;
}

/** What a backup holds, to show before restoring it. */
export interface BackupSummary {
  exportedAt: number;
  childName: string | null;
  worksheets: number;
  lastHandIn: number | null;
  samples: number;
}

export async function exportBackup(now: number = Date.now()): Promise<Backup> {
  const db = await openDb();
  const tx = db.transaction([...KEYED, ...UNKEYED], 'readonly');
  const stores: Backup['stores'] = {};
  const pairs: Backup['pairs'] = {};
  for (const name of KEYED) stores[name] = await tx.objectStore(name).getAll();
  for (const name of UNKEYED) {
    const store = tx.objectStore(name);
    const keys = await store.getAllKeys();
    const values = await store.getAll();
    pairs[name] = keys.map((k, i) => [k, values[i]]);
  }
  await tx.done;
  return { format: BACKUP_FORMAT, dbVersion: DB_VERSION, exportedAt: now, stores, pairs };
}

/** Check a file's contents is a backup this app can restore; throws a message for the parent if not. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a MasterMath backup.');
  }
  const b = data as Partial<Backup> | null;
  if (!b || b.format !== BACKUP_FORMAT || typeof b.stores !== 'object' || typeof b.pairs !== 'object' || typeof b.exportedAt !== 'number') {
    throw new Error('This file is not a MasterMath backup.');
  }
  if (typeof b.dbVersion !== 'number' || b.dbVersion > DB_VERSION) {
    throw new Error('This backup comes from a newer version of the app. Open the app online to update it, then restore.');
  }
  for (const name of Object.keys(b.stores!)) if (!KEYED.includes(name as Name)) throw new Error(`Unknown part in the backup: ${name}.`);
  for (const name of Object.keys(b.pairs!)) if (!UNKEYED.includes(name as Name)) throw new Error(`Unknown part in the backup: ${name}.`);
  return b as Backup;
}

export function summarise(b: Backup): BackupSummary {
  const settings = (b.pairs.settings ?? []).find(([k]) => k === 'app')?.[1] as { childName?: string } | undefined;
  const worksheets = (b.stores.worksheets ?? []) as Array<{ submittedAt: number }>;
  return {
    exportedAt: b.exportedAt,
    childName: settings?.childName ?? null,
    worksheets: worksheets.length,
    lastHandIn: worksheets.length ? Math.max(...worksheets.map((w) => w.submittedAt)) : null,
    samples: (b.stores.templates ?? []).length,
  };
}

/** Replace everything on the tablet with the backup, in one transaction: all or nothing. */
export async function restoreBackup(b: Backup): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([...KEYED, ...UNKEYED], 'readwrite');
  const ops: Promise<unknown>[] = [];
  for (const name of [...KEYED, ...UNKEYED]) ops.push(tx.objectStore(name).clear());
  for (const name of KEYED) for (const row of b.stores[name] ?? []) ops.push(tx.objectStore(name).put(row as never));
  for (const name of UNKEYED) for (const [k, v] of b.pairs[name] ?? []) ops.push(tx.objectStore(name).put(v as never, k as never));
  await Promise.all([...ops, tx.done]);
}

/** Ask the browser not to clear the app's storage when space runs low. True when it agrees. */
export async function keepStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}
