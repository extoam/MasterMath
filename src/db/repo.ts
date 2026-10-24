import { openDb, type SideInk } from './schema';
import type { SideRecord } from '../engine/progress';
import type { StoredCheckItem } from '../ink/check';
import type { Template } from '../ink/templates';

/** Append one template. `add` (not `put`) so an existing id is never overwritten. */
export async function saveTemplate(t: Template): Promise<void> {
  const db = await openDb();
  await db.add('templates', t);
}

/** Every stored template, oldest first. */
export async function loadTemplates(): Promise<Template[]> {
  const db = await openDb();
  const rows = await db.getAll('templates');
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

/** Append one answer from the handwriting check. */
export async function saveCheckItem(item: StoredCheckItem): Promise<void> {
  const db = await openDb();
  await db.add('check_items', item);
}

/** All answers of one check run, in prompt order. */
export async function loadCheckItems(runId: string): Promise<StoredCheckItem[]> {
  const db = await openDb();
  const rows = await db.getAllFromIndex('check_items', 'by-run', runId);
  return rows.sort((a, b) => a.index - b.index);
}

/** The run that was most recently written to, with its answers, or null if no check has started. */
export async function latestCheckRun(): Promise<{ runId: string; items: StoredCheckItem[] } | null> {
  const db = await openDb();
  const rows = await db.getAll('check_items');
  if (rows.length === 0) return null;
  const newest = rows.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
  return { runId: newest.runId, items: await loadCheckItems(newest.runId) };
}

/**
 * A v4 UUID. `crypto.randomUUID` exists only in secure contexts, and the tablet
 * reaches the dev server over plain HTTP on the LAN, so fall back to
 * `getRandomValues`, which is not gated.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface HandwritingExport {
  format: 'mastermath-handwriting-v1';
  exportedAt: number;
  templates: Template[];
  checkItems: StoredCheckItem[];
}

/** Every handwriting sample and check answer, for measuring recogniser changes against her real hand. */
export async function exportHandwriting(now: number = Date.now()): Promise<HandwritingExport> {
  const db = await openDb();
  const checkItems = (await db.getAll('check_items')).sort((a, b) => a.createdAt - b.createdAt || a.index - b.index);
  return { format: 'mastermath-handwriting-v1', exportedAt: now, templates: await loadTemplates(), checkItems };
}

/** The side without its strokes: what progress, review and Home need. */
function slim(side: SideRecord): SideRecord {
  return {
    ...side,
    rounds: side.rounds.map((round) => ({
      ...round,
      items: round.items.map((item) => ({ ...item, boxes: item.boxes.map((b) => ({ ...b, strokes: [] })) })),
    })),
  };
}

/**
 * Append one completed side: the slim record to `sides`, the strokes to
 * `side_ink`, in one transaction. Saving the identical side again (a retry
 * after an uncertain failure) is a no-op; a different side under the same id
 * is refused, so nothing saved is ever overwritten.
 */
export async function saveSide(side: SideRecord): Promise<void> {
  const db = await openDb();
  const record = slim(side);
  const existing = await db.get('sides', side.id);
  if (existing) {
    if (JSON.stringify(existing) === JSON.stringify(record)) return;
    throw new Error(`A different side is already saved as ${side.id}`);
  }
  const tx = db.transaction(['sides', 'side_ink'], 'readwrite');
  await Promise.all([tx.objectStore('sides').add(record), tx.objectStore('side_ink').add({ id: side.id, rounds: side.rounds }), tx.done]);
}

/** Every completed side, oldest first, without strokes. */
export async function loadSides(): Promise<SideRecord[]> {
  const db = await openDb();
  return db.getAllFromIndex('sides', 'by-completed');
}

/** The strokes of one side, for retraining or replay. */
export async function loadSideInk(id: string): Promise<SideInk | undefined> {
  const db = await openDb();
  return db.get('side_ink', id);
}
