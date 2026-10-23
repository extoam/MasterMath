import { openDb } from './schema';
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
