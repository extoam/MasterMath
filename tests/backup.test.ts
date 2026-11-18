import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportBackup, parseBackup, restoreBackup, summarise, BACKUP_FORMAT } from '../src/db/backup';
import { loadDecisions, loadRemarks, loadSettings, loadTemplates, loadWorksheets, saveChildName, saveDecision, saveDraft, loadDraft, saveRemarks, saveTemplate, saveWorksheet, markBackup } from '../src/db/repo';
import { closeDb, DB_NAME, DB_VERSION } from '../src/db/schema';
import type { Draft, WorksheetRecord } from '../src/engine/schedule';

beforeEach(async () => {
  await closeDb();
  await deleteDB(DB_NAME);
});

const ws = (id: string, submittedAt: number) => ({ id, index: 1, sides: [], submittedAt, activeMs: 0, sideMs: {} }) as WorksheetRecord;
const draft: Draft = { v: 1, kind: 'writing', worksheetId: 'w9', current: 0, sides: [], sideMs: {}, visits: {}, startedAt: 1, overrides: [], round: 0 };

async function seed() {
  await saveChildName('tonya');
  await saveTemplate({ id: 't1', digit: 4, strokes: [[{ x: 1, y: 2, t: 0, pressure: 0.5 }]], createdAt: 1, source: 'calibration' });
  await saveWorksheet(ws('w1', 100));
  await saveWorksheet(ws('w2', 200));
  await saveDecision({ id: 'd1', at: 5, toSheet: 121 });
  await saveRemarks([{ id: 's1', at: 1, positions: [2] }]);
  await saveDraft(draft);
}

describe('backup', () => {
  it('round-trips every record through a JSON file, replacing what was there', async () => {
    await seed();
    const text = JSON.stringify(await exportBackup(1234));
    await saveWorksheet(ws('w3', 300)); // made after the backup: gone after restoring
    await saveChildName('someone else');
    await restoreBackup(parseBackup(text));
    expect((await loadWorksheets()).map((w) => w.id)).toEqual(['w1', 'w2']);
    expect((await loadSettings()).childName).toBe('tonya');
    expect((await loadTemplates()).map((t) => t.id)).toEqual(['t1']);
    expect((await loadDecisions()).map((d) => d.id)).toEqual(['d1']);
    expect(await loadRemarks()).toEqual([{ id: 's1', at: 1, positions: [2] }]);
    expect((await loadDraft())?.worksheetId).toBe('w9');
  });

  it('restores onto an empty tablet (a new device)', async () => {
    await seed();
    const text = JSON.stringify(await exportBackup());
    await closeDb();
    await deleteDB(DB_NAME);
    await restoreBackup(parseBackup(text));
    expect((await loadWorksheets()).length).toBe(2);
  });

  it('summarises a backup before restoring it', async () => {
    await seed();
    expect(summarise(await exportBackup(1234))).toEqual({ exportedAt: 1234, childName: 'tonya', worksheets: 2, lastHandIn: 200, samples: 1 });
  });

  it('refuses files that are not backups, or come from a newer app', () => {
    expect(() => parseBackup('not json')).toThrow(/not a MasterMath backup/);
    expect(() => parseBackup(JSON.stringify({ format: 'mastermath-handwriting-v2' }))).toThrow(/not a MasterMath backup/);
    expect(() => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, dbVersion: DB_VERSION + 1, exportedAt: 1, stores: {}, pairs: {} }))).toThrow(/newer version/);
    expect(() => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, dbVersion: 1, exportedAt: 1, stores: { evil: [] }, pairs: {} }))).toThrow(/Unknown part/);
  });

  it('remembers when the last backup was saved, keeping her name', async () => {
    await saveChildName('tonya');
    await markBackup(999);
    expect(await loadSettings()).toEqual({ childName: 'tonya', lastBackupAt: 999 });
  });
});
