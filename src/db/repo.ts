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

export function newId(): string {
  return crypto.randomUUID();
}
