import { useEffect, useRef, useState } from 'react';
import { exportBackup, keepStorage, parseBackup, restoreBackup, summarise, type Backup, type BackupSummary } from '../db/backup';
import { loadSettings, markBackup } from '../db/repo';

const DAY = 24 * 60 * 60 * 1000;
const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** A backup is due when there is work and none was saved in the last week. */
export function backupDue(lastBackupAt: number | undefined, worksheets: number, now: number): boolean {
  return worksheets > 0 && (lastBackupAt === undefined || now - lastBackupAt > 7 * DAY);
}

/**
 * Save everything on the tablet to one file, and restore from such a file.
 * The file goes where the parent chooses (Files, Drive, email); nothing is sent by the app.
 */
export function BackupCard({ worksheets }: { worksheets: number }) {
  const [last, setLast] = useState<number | undefined>(undefined);
  const [kept, setKept] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<{ backup: Backup; summary: BackupSummary } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings().then((s) => setLast(s.lastBackupAt)).catch(() => {});
    keepStorage().then(setKept).catch(() => setKept(false));
  }, []);

  /** Save the file to the tablet's Downloads: works in every browser. */
  const download = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /**
   * `share`: offer the share menu (Drive, email). Some browsers refuse to share this kind of
   * file and report it as a permission error; the backup is then downloaded instead.
   */
  const save = async (share: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      const b = await exportBackup();
      const name = `mastermath-backup-${new Date(b.exportedAt).toISOString().slice(0, 10)}.json`;
      const file = new File([JSON.stringify(b)], name, { type: 'application/json' });
      let where = 'in Downloads on this tablet. Copy it somewhere off the tablet too, such as Google Drive or an email to yourself.';
      let shared = false;
      if (share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'MasterMath backup' });
          shared = true;
          where = 'where you sent it.';
        } catch (err) {
          if ((err as Error).name === 'AbortError') return; // closed the share menu: nothing saved
          where = `in Downloads on this tablet (this browser would not share it). Copy it to Google Drive or email it to yourself from there.`;
        }
      } else if (share) {
        where = `in Downloads on this tablet (this browser cannot share files). Copy it to Google Drive or email it to yourself from there.`;
      }
      if (!shared) download(file);
      await markBackup(b.exportedAt);
      setLast(b.exportedAt);
      setMessage(`Backup saved: ${name}, ${where}`);
    } catch (err) {
      setMessage(`The backup could not be saved: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    try {
      const backup = parseBackup(await file.text());
      setPending({ backup, summary: summarise(backup) });
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      if (input.current) input.current.value = '';
    }
  };

  const restore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreBackup(pending.backup);
      await markBackup(pending.backup.exportedAt);
      window.location.reload(); // start from the restored data
    } catch (err) {
      setMessage(`Nothing was changed; the backup could not be restored: ${(err as Error).message}`);
      setBusy(false);
    }
  };

  const due = backupDue(last, worksheets, Date.now());
  return (
    <section className="card" id="backup" data-testid="backup">
      <h3>Backup</h3>
      <p className="small" data-testid="backup-last" data-due={due || undefined}>
        {last === undefined ? 'No backup saved yet.' : `Last backup: ${when(last)}.`}
        {due && ' Save one now, so her progress is safe if this tablet is lost, reset or replaced.'}
      </p>
      <p className="muted small">
        Her progress lives only on this tablet. Updates to the app keep it; clearing the browser’s data, uninstalling the app or losing the tablet would not.
        {kept === true && ' The browser has agreed to keep the app’s data when space runs low.'}
      </p>
      <div className="row" style={{ marginTop: 'var(--space-2)' }}>
        <button className="primary" onClick={() => void save(false)} disabled={busy} data-testid="backup-save">
          Save a backup
        </button>
        {typeof navigator.share === 'function' && (
          <button onClick={() => void save(true)} disabled={busy} data-testid="backup-share">
            Send to Drive or email…
          </button>
        )}
        <button onClick={() => input.current?.click()} disabled={busy} data-testid="backup-restore">
          Restore from a backup…
        </button>
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => void pick(e.target.files?.[0])} data-testid="backup-file" />
      </div>
      {pending && (
        <div className="confirm" data-testid="backup-confirm">
          <p>
            This backup is from <b>{when(pending.summary.exportedAt)}</b>
            {pending.summary.childName ? ` for ${pending.summary.childName}` : ''}: {pending.summary.worksheets} worksheet{pending.summary.worksheets === 1 ? '' : 's'}
            {pending.summary.lastHandIn ? `, the last handed in ${when(pending.summary.lastHandIn)}` : ''}, {pending.summary.samples} handwriting samples.
          </p>
          <p>Restoring replaces everything on this tablet with it. Work done since the backup is lost.</p>
          <div className="row">
            <button className="primary" onClick={() => void restore()} disabled={busy} data-testid="backup-restore-confirm">
              Restore this backup
            </button>
            <button onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className="note" data-testid="backup-message">
          {message}
        </p>
      )}
    </section>
  );
}
